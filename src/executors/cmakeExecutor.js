const BaseExecutor = require('./baseExecutor');
const path = require('path');
const { getInstance: getLogger } = require('../logger');

/**
 * Executor for CMake projects (CMakeLists.txt)
 * 
 * Handles:
 * - CMake projects: Build with cmake and make
 * - Supports both C/C++ and CUDA projects
 * 
 * Features:
 * - Manual cmake configuration command
 * - Manual build command
 * - Manual execution command
 * - CUDA module loading if needed
 */
class CMakeExecutor extends BaseExecutor {
    constructor(jobConfig, clusterInfo) {
        super(jobConfig, clusterInfo);
        this.logger = getLogger();
    }

    getFileType() {
        return 'cmake';
    }

    getUIConfig() {
        return {
            showPythonEnv: false,
            showCompilerFlags: false,
            showCMakeCommands: true,
        };
    }

    buildExecutionCommand(jobDir, fileName) {
        // Use custom commands if provided
        const configureCmd = this.jobConfig.cmakeConfigureCommand || this._getDefaultConfigureCommand();
        const buildCmd = this.jobConfig.cmakeBuildCommand || this._getDefaultBuildCommand();
        const executeCmd = this.jobConfig.executeCommand || this._getDefaultExecuteCommand();
        
        const lines = [];
        lines.push('# CMake configuration');
        lines.push(configureCmd);
        lines.push('');
        lines.push('# Build');
        lines.push(buildCmd);
        lines.push('');
        lines.push('# Execute');
        lines.push(executeCmd);
        
        return lines.join('\n');
    }

    _getDefaultConfigureCommand() {
        return 'cmake -S . -B build -DCMAKE_BUILD_TYPE=Release';
    }

    _getDefaultBuildCommand() {
        return 'cmake --build build -j $SLURM_CPUS_PER_TASK';
    }

    _getDefaultExecuteCommand() {
        return './build/main';
    }

    getEnvironmentSetup() {
        // Load CUDA module if GPU is requested
        if (this.jobConfig.gpus > 0) {
            const lines = [];
            lines.push('# Load CUDA module for CMake CUDA support');
            lines.push('module load cuda');
            lines.push('echo "CUDA Version: $(nvcc --version | grep release)"');
            lines.push('echo "GPU Info:"');
            lines.push('nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader');
            return lines.join('\n');
        }
        
        return '# CMake project (no CUDA)';
    }

    async extractConfig(uiConfig) {
        return {
            cmakeConfigureCommand: uiConfig.cmakeConfigureCommand || '',
            cmakeBuildCommand: uiConfig.cmakeBuildCommand || '',
            executeCommand: uiConfig.executeCommand || '',
        };
    }

    validate() {
        // Validation: ensure commands are not empty if custom
        if (this.jobConfig.cmakeConfigureCommand === '') {
            throw new Error('CMake configure command cannot be empty');
        }
        if (this.jobConfig.cmakeBuildCommand === '') {
            throw new Error('CMake build command cannot be empty');
        }
        if (this.jobConfig.executeCommand === '') {
            throw new Error('Execution command cannot be empty');
        }
        
        this.logger.debug('CMake executor validated');
    }

    /**
     * Get additional SLURM directives for CMake
     */
    getAdditionalSlurmDirectives() {
        if (this.jobConfig.gpus > 0) {
            return '# CMake project with GPU support';
        }
        return '# CMake project (CPU only)';
    }
}

module.exports = CMakeExecutor;
