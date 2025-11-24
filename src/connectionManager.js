const { Client } = require('ssh2');
const { getInstance: getLogger } = require('./logger');

/**
 * Enhanced SSH connection manager with retry logic and better error handling
 * 
 * Features:
 * - Automatic reconnection on failures
 * - Exponential backoff for retries
 * - Connection pooling
 * - Health checks
 * - Detailed error diagnostics
 */
class ConnectionManager {
    constructor(configManager) {
        this.config = configManager;
        this.connection = null;
        this.logger = getLogger();
        this.isConnecting = false;
        this.lastConnectionAttempt = null;
        this.connectionAttempts = 0;
        this.maxRetries = 3;
        this.baseRetryDelay = 2000; // 2 seconds
        this.connectionTimeout = 30000; // 30 seconds
        this.keepAliveInterval = 10000; // 10 seconds
        this.logger.info('ConnectionManager initialized');
    }

    /**
     * Get connection with automatic retry
     */
    async getConnection() {
        // If already connected and alive, return it
        if (this.connection && await this.isConnectionAlive()) {
            this.logger.debug('Reusing existing connection');
            return this.connection;
        }

        // If connecting, wait for it
        if (this.isConnecting) {
            this.logger.debug('Connection in progress, waiting...');
            return this.waitForConnection();
        }

        // Otherwise, connect
        return this.connectWithRetry();
    }

    /**
     * Check if connection is alive
     */
    async isConnectionAlive() {
        if (!this.connection) return false;

        try {
            return await new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 2000);
                
                this.connection.exec('echo "ping"', (err, stream) => {
                    clearTimeout(timeout);
                    if (err) {
                        resolve(false);
                        return;
                    }
                    
                    let output = '';
                    stream.on('data', (data) => {
                        output += data.toString();
                    });
                    
                    stream.on('close', () => {
                        resolve(output.includes('ping'));
                    });
                });
            });
        } catch (error) {
            this.logger.debug('Connection health check failed: ' + error.message);
            return false;
        }
    }

    /**
     * Wait for ongoing connection attempt
     */
    async waitForConnection() {
        const maxWait = 60000; // 60 seconds
        const startTime = Date.now();

        while (this.isConnecting) {
            if (Date.now() - startTime > maxWait) {
                throw new Error('Timeout waiting for connection');
            }
            await this.sleep(500);
        }

        if (this.connection) {
            return this.connection;
        }

        throw new Error('Connection failed');
    }

    /**
     * Connect with automatic retry and exponential backoff
     */
    async connectWithRetry() {
        this.isConnecting = true;
        let lastError = null;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                this.connectionAttempts = attempt + 1;
                this.logger.info(`Connection attempt ${this.connectionAttempts}/${this.maxRetries}`);

                const conn = await this.establishConnection();
                
                this.connection = conn;
                this.connectionAttempts = 0;
                this.isConnecting = false;
                this.logger.info('✅ Connection established successfully');
                
                return conn;

            } catch (error) {
                lastError = error;
                this.logger.error(`❌ Connection attempt ${attempt + 1} failed: ${error.message}`);

                // Don't retry on authentication errors
                if (this.isAuthenticationError(error)) {
                    this.logger.error('Authentication failed - not retrying');
                    this.isConnecting = false;
                    throw this.enrichError(error);
                }

                // Calculate backoff delay with exponential increase
                if (attempt < this.maxRetries - 1) {
                    const delay = this.calculateBackoffDelay(attempt);
                    this.logger.info(`Retrying in ${delay}ms...`);
                    await this.sleep(delay);
                }
            }
        }

        this.isConnecting = false;
        this.logger.error(`All ${this.maxRetries} connection attempts failed`);
        throw this.enrichError(lastError);
    }

    /**
     * Establish SSH connection (single attempt)
     */
    async establishConnection() {
        this.config.validate();
        const clusterInfo = this.config.getClusterInfo();

        this.logger.separator();
        this.logger.info('SSH Connection Attempt');
        this.logger.info('Target: ' + clusterInfo.username + '@' + clusterInfo.host + ':' + clusterInfo.port);

        return new Promise((resolve, reject) => {
            const conn = new Client();
            let connectionEstablished = false;
            let connectionTimeout = null;

            // Setup timeout
            connectionTimeout = setTimeout(() => {
                if (!connectionEstablished) {
                    connectionEstablished = true;
                    this.logger.error('❌ Connection timeout');
                    conn.end();
                    reject(new Error('SSH_TIMEOUT'));
                }
            }, this.connectionTimeout);

            // Connection successful
            conn.on('ready', () => {
                if (connectionEstablished) return;
                connectionEstablished = true;
                clearTimeout(connectionTimeout);
                
                this.logger.info('✅ SSH Connection Ready');
                this.setupKeepAlive(conn);
                resolve(conn);
            });

            // Connection error
            conn.on('error', (err) => {
                if (connectionEstablished) return;
                connectionEstablished = true;
                clearTimeout(connectionTimeout);
                
                this.logger.error('❌ SSH Error: ' + err.message);
                reject(err);
            });

            // Connection closed
            conn.on('close', () => {
                this.logger.info('SSH connection closed');
                if (this.connection === conn) {
                    this.connection = null;
                }
            });

            // Connection ended
            conn.on('end', () => {
                this.logger.info('SSH connection ended');
            });

            // Build SSH config
            const sshConfig = this.buildSSHConfig(clusterInfo);
            
            this.logger.info('Initiating SSH connection...');
            conn.connect(sshConfig);
        });
    }

    /**
     * Build SSH configuration with key loading
     */
    buildSSHConfig(clusterInfo) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const sshConfig = {
            host: clusterInfo.host,
            port: clusterInfo.port,
            username: clusterInfo.username,
            tryKeyboard: false,
            readyTimeout: this.connectionTimeout,
            keepaliveInterval: this.keepAliveInterval,
            keepaliveCountMax: 3,
        };

        // Try to load SSH keys
        const keyFiles = [
            'id_ed25519_unibo',
            'id_ed25519',
            'id_rsa',
            'id_hpc_test'
        ];

        let keyLoaded = false;
        this.logger.info('Searching for SSH keys in ~/.ssh/');

        for (const keyName of keyFiles) {
            const keyPath = path.join(process.env.HOME || os.homedir(), '.ssh', keyName);
            try {
                if (fs.existsSync(keyPath)) {
                    const keyContent = fs.readFileSync(keyPath);
                    sshConfig.privateKey = keyContent;
                    
                    this.logger.info('✅ Loaded SSH key: ' + keyName);
                    keyLoaded = true;
                    break;
                }
            } catch (error) {
                this.logger.debug('Could not read ' + keyName + ': ' + error.message);
            }
        }

        // Fallback to SSH agent
        if (!keyLoaded) {
            if (process.env.SSH_AUTH_SOCK) {
                this.logger.info('Using SSH agent');
                sshConfig.agent = process.env.SSH_AUTH_SOCK;
                sshConfig.agentForward = true;
            } else {
                this.logger.warn('No SSH key or agent found - attempting password auth');
            }
        }

        return sshConfig;
    }

    /**
     * Setup keep-alive mechanism
     */
    setupKeepAlive(conn) {
        // SSH2 already has keepalive, but we can add application-level checks
        const keepAliveCheck = setInterval(async () => {
            if (!await this.isConnectionAlive()) {
                this.logger.warn('Connection lost, cleaning up');
                clearInterval(keepAliveCheck);
                this.connection = null;
            }
        }, 30000); // Check every 30 seconds

        conn.on('close', () => {
            clearInterval(keepAliveCheck);
        });
    }

    /**
     * Check if error is authentication-related
     */
    isAuthenticationError(error) {
        const authErrors = [
            'All configured authentication methods failed',
            'NO_SSH_KEY',
            'Authentication failed',
            'Permission denied'
        ];

        return authErrors.some(msg => 
            error.message && error.message.includes(msg)
        );
    }

    /**
     * Calculate exponential backoff delay
     */
    calculateBackoffDelay(attempt) {
        // Exponential backoff: 2s, 4s, 8s, ...
        const delay = this.baseRetryDelay * Math.pow(2, attempt);
        // Add random jitter (±25%)
        const jitter = delay * 0.25 * (Math.random() - 0.5) * 2;
        return Math.floor(delay + jitter);
    }

    /**
     * Enrich error with helpful information
     */
    enrichError(error) {
        if (!error) return new Error('Unknown connection error');

        let enrichedMessage = error.message || 'Connection failed';
        let suggestions = [];

        // Analyze error and add suggestions
        if (error.message && error.message.includes('NO_SSH_KEY')) {
            suggestions.push('Create SSH key: ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519');
            suggestions.push('Copy key to server: ssh-copy-id user@host');
        } else if (error.message && error.message.includes('SSH_TIMEOUT')) {
            suggestions.push('Check network connection');
            suggestions.push('Verify VPN is connected (if required)');
            suggestions.push('Check firewall settings');
        } else if (error.message && error.message.includes('ECONNREFUSED')) {
            suggestions.push('Verify host address: ' + this.config.get('clusterHost'));
            suggestions.push('Verify SSH port: ' + this.config.get('sshPort'));
            suggestions.push('Check if SSH service is running on cluster');
        } else if (error.message && error.message.includes('ENOTFOUND')) {
            suggestions.push('Check host name spelling');
            suggestions.push('Verify DNS resolution');
        }

        if (suggestions.length > 0) {
            enrichedMessage += '\n\n💡 Suggestions:\n' + suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
        }

        const enrichedError = new Error(enrichedMessage);
        enrichedError.originalError = error;
        return enrichedError;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute command with automatic retry
     */
    async executeCommand(command, options = {}) {
        const maxRetries = options.maxRetries || 2;
        const timeout = options.timeout || 60000;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const conn = await this.getConnection();
                return await this.executeCommandOnConnection(conn, command, timeout);
            } catch (error) {
                this.logger.error(`Command execution failed (attempt ${attempt + 1}): ${error.message}`);
                
                // If connection lost, reset it
                if (error.message.includes('Connection') || error.message.includes('ETIMEDOUT')) {
                    this.connection = null;
                }

                if (attempt === maxRetries - 1) {
                    throw error;
                }

                await this.sleep(1000);
            }
        }
    }

    /**
     * Execute command on established connection
     */
    async executeCommandOnConnection(conn, command, timeout) {
        return new Promise((resolve, reject) => {
            let commandTimeout = null;

            commandTimeout = setTimeout(() => {
                reject(new Error(`Command timeout after ${timeout}ms`));
            }, timeout);

            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(commandTimeout);
                    reject(err);
                    return;
                }

                let stdout = '';
                let stderr = '';

                stream.on('close', (code, signal) => {
                    clearTimeout(commandTimeout);
                    resolve({ stdout, stderr, code, signal });
                });

                stream.on('data', (data) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            });
        });
    }

    /**
     * Upload file with retry
     */
    async uploadFile(localPath, remotePath, options = {}) {
        const maxRetries = options.maxRetries || 2;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const conn = await this.getConnection();
                await this.uploadFileOnConnection(conn, localPath, remotePath);
                return;
            } catch (error) {
                this.logger.error(`Upload failed (attempt ${attempt + 1}): ${error.message}`);
                
                if (attempt === maxRetries - 1) {
                    throw error;
                }

                this.connection = null;
                await this.sleep(1000);
            }
        }
    }

    /**
     * Upload file on established connection
     */
    async uploadFileOnConnection(conn, localPath, remotePath) {
        return new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.fastPut(localPath, remotePath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Download file with retry
     */
    async downloadFile(remotePath, localPath, options = {}) {
        const maxRetries = options.maxRetries || 2;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const conn = await this.getConnection();
                await this.downloadFileOnConnection(conn, remotePath, localPath);
                return;
            } catch (error) {
                this.logger.error(`Download failed (attempt ${attempt + 1}): ${error.message}`);
                
                if (attempt === maxRetries - 1) {
                    throw error;
                }

                this.connection = null;
                await this.sleep(1000);
            }
        }
    }

    /**
     * Download file on established connection
     */
    async downloadFileOnConnection(conn, remotePath, localPath) {
        return new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }

                sftp.fastGet(remotePath, localPath, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Graceful disconnect
     */
    disconnect() {
        if (this.connection) {
            this.logger.info('Disconnecting SSH connection');
            try {
                this.connection.end();
            } catch (error) {
                this.logger.error('Error during disconnect: ' + error.message);
            }
            this.connection = null;
        }
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            isConnected: this.connection !== null,
            isConnecting: this.isConnecting,
            lastAttempt: this.lastConnectionAttempt,
            totalAttempts: this.connectionAttempts,
        };
    }
}

module.exports = ConnectionManager;
