const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Simple and robust file logger
 * 
 * Writes to:
 * - Workspace: .vscode/.hpc-connector/logs/hpc-connector-YYYY-MM-DD.log
 * - Fallback: ~/.hpc-connector/logs/hpc-connector-YYYY-MM-DD.log
 */
class Logger {
    constructor(workspaceRoot = null) {
        const homeDir = os.homedir();
        
        // Try to use workspace directory if available
        if (workspaceRoot) {
            this.logDir = path.join(workspaceRoot, '.vscode', '.hpc-connector', 'logs');
        } else {
            this.logDir = path.join(homeDir, '.hpc-connector', 'logs');
        }
        
        this.logFile = path.join(this.logDir, `hpc-connector-${this._getDateString()}.log`);
        
        this._initializeLog();
        this._writeStartupMessage();
    }
    
    _initializeLog() {
        try {
            // Create log directory if it doesn't exist
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true, mode: 0o755 });
            }
            
            // Test write access
            fs.appendFileSync(this.logFile, '');
            
            console.log('[Logger] Log file ready:', this.logFile);
        } catch (error) {
            console.error('[Logger] FATAL: Cannot initialize log file:', error.message);
            throw error;
        }
    }
    
    _writeStartupMessage() {
        const lines = [
            '='.repeat(80),
            'HPC Connector Extension Started',
            'Timestamp: ' + new Date().toISOString(),
            'Log File: ' + this.logFile,
            'Node Version: ' + process.version,
            'Platform: ' + process.platform,
            'Environment:',
            '  HOME: ' + (process.env.HOME || 'NOT SET'),
            '  SSH_AUTH_SOCK: ' + (process.env.SSH_AUTH_SOCK || 'NOT SET'),
            '  USER: ' + (process.env.USER || 'NOT SET'),
            '='.repeat(80),
            ''
        ];
        
        lines.forEach(line => this._writeToFile(line + '\n'));
    }
    
    _getDateString() {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    }
    
    _getTimestamp() {
        return new Date().toISOString();
    }
    
    _writeToFile(message) {
        try {
            fs.appendFileSync(this.logFile, message, { encoding: 'utf8' });
        } catch (error) {
            console.error('[Logger] ERROR writing to log:', error.message);
        }
    }
    
    _formatMessage(message, level) {
        return `[${this._getTimestamp()}] [${level}] ${message}\n`;
    }
    
    log(message, level = 'INFO') {
        const formatted = this._formatMessage(message, level);
        this._writeToFile(formatted);
        console.log(`[HPC][${level}] ${message}`);
    }
    
    info(message) {
        this.log(message, 'INFO');
    }
    
    warn(message) {
        this.log(message, 'WARN');
    }
    
    error(message) {
        this.log(message, 'ERROR');
    }
    
    debug(message) {
        this.log(message, 'DEBUG');
    }
    
    separator() {
        const line = '-'.repeat(80);
        this._writeToFile(line + '\n');
    }
    
    getLogPath() {
        return this.logFile;
    }
}

// Singleton instance
let instance = null;

module.exports = {
    /**
     * Get logger instance
     * 
     * @param {string} workspaceRoot - Optional workspace root for log location
     */
    getInstance: (workspaceRoot = null) => {
        if (!instance) {
            try {
                instance = new Logger(workspaceRoot);
            } catch (error) {
                console.error('[Logger] FATAL: Could not create logger:', error);
                // Create dummy logger that only logs to console
                instance = {
                    info: (msg) => console.log('[INFO]', msg),
                    warn: (msg) => console.warn('[WARN]', msg),
                    error: (msg) => console.error('[ERROR]', msg),
                    debug: (msg) => console.log('[DEBUG]', msg),
                    separator: () => console.log('-'.repeat(80)),
                    log: (msg) => console.log(msg),
                    getLogPath: () => 'LOGGER FAILED TO INITIALIZE'
                };
            }
        }
        return instance;
    },
    Logger
};
