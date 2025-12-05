const BaseExecutor = require('./baseExecutor');
const path = require('path');
const { getInstance: getLogger } = require('../logger');

/**
 * Executor for CUDA files (.cu)
 * 
 * Handles:
 * - CUDA programs (.cu): Compiled with nvcc
 * 
 * Features:
 * - Manual compilation command definition
 * - Manual execution command definition
 * - CUDA module loading
 * - GPU-aware execution
 */
class CudaExecutor extends BaseExecutor {
    constructor(jobConfig, clusterInfo) {
        super(jobConfig, clusterInfo);
        this.logger = getLogger();
    }

    getFileType() {
        return 'cuda';
    }

    getUIConfig() {
        return {
            showPythonEnv: false,
            showCompilerFlags: false,
            showCompileCommand: true,
            showExecuteCommand: true,
        };
    }

    buildExecutionCommand(jobDir, fileName) {
        // Use custom commands if provided
        const compileCmd = this.jobConfig.compileCommand || this._getDefaultCompileCommand(fileName);
        const executeCmd = this.jobConfig.executeCommand || this._getDefaultExecuteCommand(fileName);
        
        return `${compileCmd}\n${executeCmd}`;
    }

    _getDefaultCompileCommand(fileName) {
        const executable = fileName.replace(/\.cu$/, '.out');
        return `nvcc ${fileName} -o ${executable} -O3 -arch=sm_75`;
    }

    _getDefaultExecuteCommand(fileName) {
        const executable = fileName.replace(/\.cu$/, '.out');
        return `./${executable}`;
    }

    getEnvironmentSetup() {
        // CUDA needs the CUDA module loaded
        const lines = [];
        lines.push('# Load CUDA module');
        lines.push('module load cuda');
        lines.push('echo "CUDA Version: $(nvcc --version | grep release)"');
        lines.push('echo "GPU Info:"');
        lines.push('nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader');
        
        return lines.join('\n');
    }

    async extractConfig(uiConfig) {
        return {
            compileCommand: uiConfig.compileCommand || '',
            executeCommand: uiConfig.executeCommand || '',
        };
    }

    validate() {
        // Validation: ensure commands are not empty if custom
        if (this.jobConfig.compileCommand === '') {
            throw new Error('Compilation command cannot be empty');
        }
        if (this.jobConfig.executeCommand === '') {
            throw new Error('Execution command cannot be empty');
        }
        
        // CUDA requires GPU
        if (this.jobConfig.gpus <= 0) {
            throw new Error('CUDA execution requires at least 1 GPU');
        }
        
        this.logger.debug('CUDA executor validated');
    }

    /**
     * Get additional SLURM directives for CUDA
     * GPU is mandatory for CUDA
     */
    getAdditionalSlurmDirectives() {
        return '# CUDA execution: GPU required';
    }
}

module.exports = CudaExecutor;
