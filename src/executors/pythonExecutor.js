const BaseExecutor = require('./baseExecutor');
const { getInstance: getLogger } = require('../logger');

/**
 * Executor for Python files (.py and .ipynb)
 * 
 * Handles:
 * - Python scripts (.py): Executed with `python script.py`
 * - Jupyter notebooks (.ipynb): Executed with `jupyter nbconvert --execute --inplace`
 */
class PythonExecutor extends BaseExecutor {
    constructor(jobConfig, clusterInfo) {
        super(jobConfig, clusterInfo);
        this.logger = getLogger();
    }

    getFileType() {
        return 'python';
    }

    getUIConfig() {
        return {
            showPythonEnv: true,
            showCompilerFlags: false,
        };
    }

    buildExecutionCommand(jobDir, fileName) {
        const fileExt = require('path').extname(fileName);
        
        if (fileExt === '.ipynb') {
            // Jupyter notebook: execute in-place and add results to notebook
            return `jupyter nbconvert --to notebook --execute --inplace ${fileName} --ExecutePreprocessor.timeout=-1`;
        } else {
            // Python script: simple execution
            return `python ${fileName}`;
        }
    }

    getEnvironmentSetup() {
        const venvPath = `${this.clusterInfo.venvsDir}/${this.jobConfig.pythonEnv}`;
        return `source ${venvPath}/bin/activate`;
    }

    async extractConfig(uiConfig) {
        return {
            pythonEnv: uiConfig.pythonEnv || 'base_env',
        };
    }

    validate() {
        if (!this.jobConfig.pythonEnv) {
            throw new Error('Python environment not specified');
        }
        this.logger.debug('Python executor validated with env: ' + this.jobConfig.pythonEnv);
    }
}

module.exports = PythonExecutor;
