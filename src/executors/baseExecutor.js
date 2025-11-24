/**
 * Base class for file executors
 * 
 * Each executor handles a specific file type (.py, .c, .cpp, .ipynb)
 * and knows how to generate appropriate execution commands
 */
class BaseExecutor {
    constructor(jobConfig, clusterInfo) {
        this.jobConfig = jobConfig;
        this.clusterInfo = clusterInfo;
    }

    /**
     * Get file type identifier
     * @returns {string} 'python' | 'cpp' | 'c'
     */
    getFileType() {
        throw new Error('getFileType() must be implemented by subclass');
    }

    /**
     * Get UI configuration for this file type
     * Determines which config fields to show in dialogs
     * @returns {object} UI config flags
     */
    getUIConfig() {
        throw new Error('getUIConfig() must be implemented by subclass');
    }

    /**
     * Build the execution command for this file type
     * @param {string} jobDir - Remote job directory
     * @param {string} fileName - File to execute
     * @returns {string} Bash command to execute the file
     */
    buildExecutionCommand(jobDir, fileName) {
        throw new Error('buildExecutionCommand() must be implemented by subclass');
    }

    /**
     * Get environment setup commands
     * @returns {string} Bash commands to setup environment
     */
    getEnvironmentSetup() {
        return '# No environment setup needed';
    }

    /**
     * Validate executor configuration
     * @throws Error if configuration is invalid
     */
    validate() {
        // Override in subclasses for specific validation
    }

    /**
     * Extract additional configuration from user input
     * @param {object} uiConfig - User input from dialogs
     * @returns {object} Executor-specific config
     */
    async extractConfig(uiConfig) {
        return {};
    }

    /**
     * Build input files reference for SLURM script
     * @returns {string} jq-compatible file list
     */
    buildInputFilesJson() {
        if (!this.jobConfig.inputFiles || this.jobConfig.inputFiles.length === 0) {
            return '[]';
        }
        return this.jobConfig.inputFiles
            .map(f => `"${require('path').basename(f)}"`)
            .join(', ');
    }

    /**
     * Get additional SLURM directives for this executor
     * @returns {string} SLURM directives (#SBATCH lines)
     */
    getAdditionalSlurmDirectives() {
        return '# No additional directives';
    }
}

module.exports = BaseExecutor;
