const BaseExecutor = require('./baseExecutor');
const path = require('path');
const { getInstance: getLogger } = require('../logger');

/**
 * Executor for C/C++ files (.c and .cpp)
 * 
 * Handles:
 * - C programs (.c): Compiled with gcc
 * - C++ programs (.cpp): Compiled with g++
 * 
 * Features:
 * - Customizable compiler optimization flags (-O0, -O1, -O2, -O3)
 * - Additional compiler flags (e.g., -Wall, -std=c17)
 * - Automatic include directories
 */
class CppExecutor extends BaseExecutor {
    constructor(jobConfig, clusterInfo) {
        super(jobConfig, clusterInfo);
        this.logger = getLogger();
    }

    getFileType() {
        return 'cpp';
    }

    getUIConfig() {
        return {
            showPythonEnv: false,
            showCompilerFlags: true,
        };
    }

    buildExecutionCommand(jobDir, fileName) {
        const fileExt = path.extname(fileName);
        const executable = fileName.replace(/\.[^.]+$/, '.out');
        
        const compiler = fileExt === '.c' ? 'gcc' : 'g++';
        
        // Build compiler flags
        const optimizationLevel = this.jobConfig.optimizationLevel || '-O3';
        const extraFlags = this.jobConfig.extraFlags || '';
        const includeFlags = this.jobConfig.includeFlags || '';
        
        const compileCmd = `${compiler} ${fileName} -o ${executable} ${optimizationLevel} -march=native ${extraFlags} ${includeFlags}`;
        const executeCmd = `./${executable}`;
        
        return `${compileCmd}\n${executeCmd}`;
    }

    getEnvironmentSetup() {
        // C/C++ doesn't need Python environment
        return '# No Python environment needed for C/C++';
    }

    async extractConfig(uiConfig) {
        return {
            optimizationLevel: uiConfig.optimizationLevel || '-O3',
            extraFlags: uiConfig.extraFlags || '',
            includeFlags: uiConfig.includeFlags || '',
        };
    }

    validate() {
        const validOptimizations = ['-O0', '-O1', '-O2', '-O3'];
        if (!validOptimizations.includes(this.jobConfig.optimizationLevel)) {
            throw new Error('Invalid optimization level: ' + this.jobConfig.optimizationLevel);
        }
        this.logger.debug('C/C++ executor validated with optimization: ' + this.jobConfig.optimizationLevel);
    }

    /**
     * Get additional SLURM directives for C/C++
     * GPU resources are not requested for pure C/C++ compilation/execution
     */
    getAdditionalSlurmDirectives() {
        // C/C++ typically doesn't need GPU
        return '# C/C++ execution: no GPU requested';
    }
}

module.exports = CppExecutor;
