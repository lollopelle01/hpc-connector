const vscode = require('vscode');

/**
 * Manages extension configuration
 * 
 * Handles settings from VSCode workspace configuration:
 * - Cluster connection (host, username, port)
 * - Default job parameters (partition, resources)
 * - Python environment settings
 */
class ConfigManager {
    constructor() {
        this.config = vscode.workspace.getConfiguration('hpc-connector');
        this.SCRATCH_BASE = '/scratch.hpc'; // Cluster base path
        console.log('[ConfigManager] Initialized');
    }

    /**
     * Get configuration value
     */
    get(key, defaultValue = null) {
        const value = this.config.get(key);
        return (value !== undefined && value !== null && value !== '') ? value : defaultValue;
    }

    /**
     * Set configuration value
     */
    async set(key, value) {
        await this.config.update(key, value, vscode.ConfigurationTarget.Global);
    }

    /**
     * Get cluster connection info and paths
     */
    getClusterInfo() {
        const username = this.get('username');
        
        // Extract the actual cluster username (before @) if email format
        const clusterUsername = username.includes('@') ? username.split('@')[0] : username;
        
        return {
            host: this.get('clusterHost'),
            port: this.get('sshPort', 22),
            username: username, // Keep full username for SSH connection
            clusterUsername: clusterUsername, // Username for paths
            scratchBase: this.SCRATCH_BASE,
            scratchDir: `${this.SCRATCH_BASE}/${clusterUsername}`,
            jobsDir: `${this.SCRATCH_BASE}/${clusterUsername}/hpc_jobs`,
            venvsDir: `${this.SCRATCH_BASE}/${clusterUsername}/python_venvs`,
        };
    }

    /**
     * Get default job parameters from settings
     */
    getDefaultJobParams() {
        return {
            partition: this.get('defaultPartition', 'l40'),
            gpus: this.get('defaultGPUs', 1),
            cpus: this.get('defaultCPUs', 4),
            memory: this.get('defaultMemory', '16G'),
            time: this.get('defaultTime', '02:00:00'),
            pythonEnv: this.get('pythonEnv', 'base_env'),
        };
    }

    /**
     * Validate required configuration
     * 
     * @throws Error if required fields are missing
     */
    validate() {
        const clusterHost = this.get('clusterHost');
        const username = this.get('username');
        
        if (!clusterHost || !username) {
            throw new Error('Missing configuration. Please set cluster host and username in VSCode settings.');
        }

        // Validate username format (allow email-style usernames)
        if (!/^[a-zA-Z0-9._@-]+$/.test(username)) {
            throw new Error('Username can only contain letters, numbers, dots, @, hyphens, and underscores');
        }

        return true;
    }
}

module.exports = ConfigManager;
