const path = require('path');

/**
 * Safety manager to prevent dangerous operations
 * 
 * CRITICAL RULES:
 * - All operations must be inside /scratch.hpc/username/
 * - No path traversal allowed (..)
 * - Only delete inside hpc_jobs/ directory
 */
class SafetyManager {
    constructor(configManager) {
        this.config = configManager;
    }

    /**
     * Validate that a path is safe to use
     * 
     * Ensures path is inside /scratch.hpc/username/ and has no traversal
     */
    validatePath(remotePath) {
        const clusterInfo = this.config.getClusterInfo();
        const scratchDir = clusterInfo.scratchDir;

        // Normalize path (resolve . and ..)
        const normalizedPath = path.posix.normalize(remotePath);

        // CRITICAL: Must be inside scratch directory
        if (!normalizedPath.startsWith(scratchDir)) {
            throw new Error(`SECURITY: Path outside scratch directory: ${remotePath} (must be in ${scratchDir})`);
        }

        // CRITICAL: Cannot contain path traversal
        if (remotePath.includes('..')) {
            throw new Error(`SECURITY: Path traversal not allowed: ${remotePath}`);
        }

        // CRITICAL: Cannot access root
        if (normalizedPath === '/' || normalizedPath === clusterInfo.scratchBase) {
            throw new Error(`SECURITY: Cannot access base directories: ${remotePath}`);
        }

        return true;
    }

    /**
     * Validate delete operation
     * 
     * Only allows deletion inside hpc_jobs/ directory
     */
    validateDelete(remotePath) {
        this.validatePath(remotePath);

        const clusterInfo = this.config.getClusterInfo();
        const jobsDir = clusterInfo.jobsDir;

        // Can only delete inside hpc_jobs directory
        if (!remotePath.startsWith(jobsDir + '/')) {
            throw new Error(`SECURITY: Can only delete inside ${jobsDir}`);
        }

        // Cannot delete the jobs directory itself
        if (remotePath === jobsDir) {
            throw new Error(`SECURITY: Cannot delete jobs directory itself`);
        }

        return true;
    }

    /**
     * Get safe job directory path
     * 
     * Returns validated path for a job
     */
    getSafeJobPath(jobId) {
        const clusterInfo = this.config.getClusterInfo();
        
        // Validate job ID (no path traversal)
        if (jobId.includes('..') || jobId.includes('/')) {
            throw new Error(`SECURITY: Invalid job ID: ${jobId}`);
        }
        
        const jobPath = `${clusterInfo.jobsDir}/${jobId}`;
        this.validatePath(jobPath);
        
        return jobPath;
    }

    /**
     * Get safe venv path
     * 
     * Returns validated path for a Python virtual environment
     */
    getSafeVenvPath(venvName) {
        const clusterInfo = this.config.getClusterInfo();
        
        // Validate venv name (no path traversal)
        if (venvName.includes('..') || venvName.includes('/')) {
            throw new Error(`SECURITY: Invalid venv name: ${venvName}`);
        }
        
        const venvPath = `${clusterInfo.venvsDir}/${venvName}`;
        this.validatePath(venvPath);
        
        return venvPath;
    }

    /**
     * Log operation for audit trail
     */
    logOperation(operation, details) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            operation,
            details
        };
        
        console.log(`[SECURITY LOG] ${JSON.stringify(logEntry)}`);
        return logEntry;
    }
}

module.exports = SafetyManager;
