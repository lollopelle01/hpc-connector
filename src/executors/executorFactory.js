const PythonExecutor = require('./pythonExecutor');
const CppExecutor = require('./cppExecutor');
const CudaExecutor = require('./cudaExecutor');
const CMakeExecutor = require('./cmakeExecutor');
const path = require('path');
const { getInstance: getLogger } = require('../logger');

/**
 * Factory for creating appropriate executor based on file type
 */
class ExecutorFactory {
    static createExecutor(filePath, jobConfig, clusterInfo) {
        const logger = getLogger();
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath);
        
        logger.debug('Creating executor for ' + fileExt);
        
        // Special case for CMakeLists.txt
        if (fileName === 'CMakeLists.txt') {
            return new CMakeExecutor(jobConfig, clusterInfo);
        }
        
        switch (fileExt) {
            case '.py':
            case '.ipynb':
                return new PythonExecutor(jobConfig, clusterInfo);
            
            case '.c':
            case '.cpp':
                return new CppExecutor(jobConfig, clusterInfo);
            
            case '.cu':
                return new CudaExecutor(jobConfig, clusterInfo);
            
            default:
                throw new Error('Unsupported file type: ' + fileExt);
        }
    }

    /**
     * Get UI configuration based on file type
     */
    static getUIConfigForFile(filePath) {
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath);
        
        let executor;
        try {
            executor = this.createExecutor(filePath, { gpus: 0 }, {});
            return executor.getUIConfig();
        } catch (error) {
            const logger = getLogger();
            logger.warn('Could not get UI config: ' + error.message);
            return {
                showPythonEnv: false,
                showCompilerFlags: false,
                showCompileCommand: false,
                showExecuteCommand: false,
                showCMakeCommands: false,
            };
        }
    }
}

module.exports = ExecutorFactory;
