const PythonExecutor = require('./pythonExecutor');
const CppExecutor = require('./cppExecutor');
const path = require('path');
const { getInstance: getLogger } = require('../logger');

/**
 * Factory for creating appropriate executor based on file type
 */
class ExecutorFactory {
    static createExecutor(filePath, jobConfig, clusterInfo) {
        const logger = getLogger();
        const fileExt = path.extname(filePath);
        
        logger.debug('Creating executor for ' + fileExt);
        
        switch (fileExt) {
            case '.py':
            case '.ipynb':
                return new PythonExecutor(jobConfig, clusterInfo);
            
            case '.c':
            case '.cpp':
                return new CppExecutor(jobConfig, clusterInfo);
            
            default:
                throw new Error('Unsupported file type: ' + fileExt);
        }
    }

    /**
     * Get UI configuration based on file type
     */
    static getUIConfigForFile(filePath) {
        const fileExt = path.extname(filePath);
        
        let executor;
        try {
            executor = this.createExecutor(filePath, {}, {});
            return executor.getUIConfig();
        } catch (error) {
            const logger = getLogger();
            logger.warn('Could not get UI config: ' + error.message);
            return {
                showPythonEnv: false,
                showCompilerFlags: false,
            };
        }
    }
}

module.exports = ExecutorFactory;
