const vscode = require('vscode');

/**
 * Manages UI interactions
 */
class UIManager {
    
    /**
     * Show compilation and execution commands dialog for C/C++ files
     */
    async showCompileExecuteDialog(fileName) {
        const fileExt = require('path').extname(fileName);
        const executable = fileName.replace(/\.[^.]+$/, '.out');
        const compiler = fileExt === '.c' ? 'gcc' : 'g++';
        
        const defaultCompileCmd = `${compiler} ${fileName} -o ${executable} -O3 -march=native -Wall`;
        const defaultExecuteCmd = `./${executable}`;

        // Compilation command
        const compileCommand = await vscode.window.showInputBox({
            prompt: 'Compilation command',
            placeHolder: defaultCompileCmd,
            value: defaultCompileCmd,
            prompt: 'Enter the compilation command (or press Enter for default)',
        });
        if (compileCommand === undefined) return null;

        // Execution command
        const executeCommand = await vscode.window.showInputBox({
            prompt: 'Execution command',
            placeHolder: defaultExecuteCmd,
            value: defaultExecuteCmd,
            prompt: 'Enter the execution command (or press Enter for default)',
        });
        if (executeCommand === undefined) return null;

        return {
            compileCommand: compileCommand,
            executeCommand: executeCommand,
        };
    }

    /**
     * Show compilation and execution commands dialog for CUDA files
     */
    async showCudaCompileExecuteDialog(fileName) {
        const executable = fileName.replace(/\.cu$/, '.out');
        
        const defaultCompileCmd = `nvcc ${fileName} -o ${executable} -O3 -arch=sm_75`;
        const defaultExecuteCmd = `./${executable}`;

        // Compilation command
        const compileCommand = await vscode.window.showInputBox({
            prompt: 'CUDA compilation command',
            placeHolder: defaultCompileCmd,
            value: defaultCompileCmd,
            prompt: 'Enter the nvcc compilation command (or press Enter for default)',
        });
        if (compileCommand === undefined) return null;

        // Execution command
        const executeCommand = await vscode.window.showInputBox({
            prompt: 'Execution command',
            placeHolder: defaultExecuteCmd,
            value: defaultExecuteCmd,
            prompt: 'Enter the execution command (or press Enter for default)',
        });
        if (executeCommand === undefined) return null;

        return {
            compileCommand: compileCommand,
            executeCommand: executeCommand,
        };
    }

    /**
     * Show CMake commands dialog
     */
    async showCMakeCommandsDialog() {
        const defaultConfigureCmd = 'cmake -S . -B build -DCMAKE_BUILD_TYPE=Release';
        const defaultBuildCmd = 'cmake --build build -j $SLURM_CPUS_PER_TASK';
        const defaultExecuteCmd = './build/main';

        // Configure command
        const cmakeConfigureCommand = await vscode.window.showInputBox({
            prompt: 'CMake configure command',
            placeHolder: defaultConfigureCmd,
            value: defaultConfigureCmd,
            prompt: 'Enter the CMake configuration command (or press Enter for default)',
        });
        if (cmakeConfigureCommand === undefined) return null;

        // Build command
        const cmakeBuildCommand = await vscode.window.showInputBox({
            prompt: 'CMake build command',
            placeHolder: defaultBuildCmd,
            value: defaultBuildCmd,
            prompt: 'Enter the CMake build command (or press Enter for default)',
        });
        if (cmakeBuildCommand === undefined) return null;

        // Execution command
        const executeCommand = await vscode.window.showInputBox({
            prompt: 'Execution command',
            placeHolder: defaultExecuteCmd,
            value: defaultExecuteCmd,
            prompt: 'Enter the execution command (or press Enter for default)',
        });
        if (executeCommand === undefined) return null;

        return {
            cmakeConfigureCommand: cmakeConfigureCommand,
            cmakeBuildCommand: cmakeBuildCommand,
            executeCommand: executeCommand,
        };
    }

    /**
     * Show scheduling parameters dialog
     */
    async showSchedulingDialog(configManager, fileExt) {
        const defaults = configManager.getDefaultJobParams();

        // Job name
        const jobName = await vscode.window.showInputBox({
            prompt: 'Job Name',
            placeHolder: 'my-job',
            value: 'job-' + new Date().toISOString().slice(0, 16).replace(/[:-]/g, ''),
        });
        if (jobName === undefined) return null;

        // Partition
        const partitionChoice = await vscode.window.showQuickPick(
            [
                { label: 'l40', description: '8-core CPU + L40 GPU (18176 CUDA cores) - Most powerful' },
                { label: 'rtx2080', description: '4-core CPU + RTX 2080 TI (4352 CUDA cores)' }
            ],
            {
                placeHolder: `Partition (default: ${defaults.partition})`,
                canPickMany: false,
            }
        );
        if (!partitionChoice) return null;
        const partition = partitionChoice.label;

        // GPUs (skip for C/C++)
        let gpus = defaults.gpus;
        if (fileExt !== '.c' && fileExt !== '.cpp') {
            const gpuInput = await vscode.window.showInputBox({
                prompt: 'Number of GPUs',
                value: defaults.gpus.toString(),
                validateInput: (value) => {
                    return /^\d+$/.test(value) ? null : 'Must be a number';
                }
            });
            if (gpuInput === undefined) return null;
            gpus = parseInt(gpuInput);
        }

        // CPUs
        const cpus = await vscode.window.showInputBox({
            prompt: 'Number of CPUs',
            value: defaults.cpus.toString(),
            validateInput: (value) => {
                return /^\d+$/.test(value) ? null : 'Must be a number';
            }
        });
        if (cpus === undefined) return null;

        // Memory
        const memory = await vscode.window.showInputBox({
            prompt: 'Memory (e.g., 16G, 32G)',
            value: defaults.memory,
            validateInput: (value) => {
                return /^\d+[GM]$/.test(value) ? null : 'Format: 16G or 32000M';
            }
        });
        if (memory === undefined) return null;

        // Time limit
        const time = await vscode.window.showInputBox({
            prompt: 'Time limit (HH:MM:SS)',
            value: defaults.time,
            validateInput: (value) => {
                return /^\d{2}:\d{2}:\d{2}$/.test(value) ? null : 'Format: HH:MM:SS';
            }
        });
        if (time === undefined) return null;

        // Python environment (only for .py and .ipynb)
        let pythonEnv = defaults.pythonEnv;
        if (fileExt === '.py' || fileExt === '.ipynb') {
            pythonEnv = await vscode.window.showInputBox({
                prompt: 'Python virtual environment name',
                value: defaults.pythonEnv,
                placeHolder: 'base_env, torch_env, tf_env',
            });
            if (pythonEnv === undefined) return null;
        }

        return {
            name: jobName,
            partition: partition,
            gpus: gpus,
            cpus: parseInt(cpus),
            memory: memory,
            time: time,
            pythonEnv: pythonEnv,
        };
    }

    /**
     * Show input files selection dialog
     * Allows user to select additional files to upload to job workspace
     * These files will be available in the remote job directory
     */
    async showInputFilesDialog() {
        const selection = await vscode.window.showQuickPick(
            ['Yes - Select files to upload to job workspace', 'No - Submit without additional files'],
            {
                placeHolder: 'Do you need to upload additional files to the job workspace?',
                canPickMany: false,
            }
        );

        if (!selection || selection.startsWith('No')) {
            return [];
        }

        // Show file picker for multiple files
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Select Files to Upload',
            title: 'Select files to copy to remote job workspace',
            filters: {
                'All Files': ['*'],
                'Data Files': ['csv', 'json', 'txt', 'xml', 'yaml', 'yml'],
                'Config Files': ['cfg', 'conf', 'ini', 'toml'],
                'Source Files': ['c', 'cpp', 'cu', 'h', 'hpp', 'cuh'],
            }
        });

        if (!fileUris || fileUris.length === 0) {
            return [];
        }

        return fileUris.map(uri => uri.fsPath);
    }

    /**
     * Show job picker
     */
    async showJobPicker(jobs, title = 'Select a job') {
        const items = jobs.map(job => ({
            label: `$(cloud) ${job.name}`,
            description: `ID: ${job.id} | Status: ${job.status}`,
            detail: `Submitted: ${new Date(job.submitted).toLocaleString()} | SLURM: ${job.slurmId || 'N/A'}`,
            job: job,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: title,
        });

        return selected ? selected.job : null;
    }

    /**
     * Show job details in output channel
     */
    showJobDetails(details) {
        const channel = vscode.window.createOutputChannel('HPC Job Details');
        channel.clear();
        channel.appendLine('='.repeat(80));
        channel.appendLine(`Job: ${details.name}`);
        channel.appendLine(`ID: ${details.id}`);
        channel.appendLine(`SLURM ID: ${details.slurmId || 'Not assigned'}`);
        channel.appendLine(`Status: ${details.status}`);
        channel.appendLine(`Submitted: ${new Date(details.submitted).toLocaleString()}`);
        channel.appendLine('='.repeat(80));
        
        channel.appendLine('\nConfiguration:');
        channel.appendLine(`  Partition: ${details.config.partition}`);
        channel.appendLine(`  GPUs: ${details.config.gpus}`);
        channel.appendLine(`  CPUs: ${details.config.cpus}`);
        channel.appendLine(`  Memory: ${details.config.memory}`);
        channel.appendLine(`  Time Limit: ${details.config.time}`);
        channel.appendLine(`  Python Env: ${details.config.pythonEnv}`);

        channel.appendLine('\nFiles:');
        channel.appendLine(`  Script: ${details.fileName}`);
        if (details.inputFiles && details.inputFiles.length > 0) {
            channel.appendLine(`  Input Files: ${details.inputFiles.length}`);
            details.inputFiles.forEach(f => channel.appendLine(`    - ${f}`));
        }

        if (details.statusData) {
            channel.appendLine('\nDetailed Status:');
            channel.appendLine(`  Duration: ${details.statusData.duration ? details.statusData.duration + 's' : 'N/A'}`);
            channel.appendLine(`  Exit Code: ${details.statusData.exitCode !== null ? details.statusData.exitCode : 'N/A'}`);
            channel.appendLine(`  Node: ${details.statusData.node || 'N/A'}`);
            if (details.statusData.completed) {
                channel.appendLine(`  Completed: ${new Date(details.statusData.completed).toLocaleString()}`);
            }
        }
        
        if (details.logs) {
            channel.appendLine('\n' + '='.repeat(80));
            channel.appendLine('Recent Logs (last 50 lines):');
            channel.appendLine('='.repeat(80));
            channel.appendLine(details.logs);
        }

        channel.show();
    }

    /**
     * Show progress notification
     */
    async withProgress(title, task) {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: title,
                cancellable: false,
            },
            async (progress) => {
                return await task(progress);
            }
        );
    }

    /**
     * Show error message
     */
    showError(message) {
        vscode.window.showErrorMessage(`HPC Connector: ${message}`);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        vscode.window.showInformationMessage(`HPC Connector: ${message}`);
    }

    /**
     * Show warning message
     */
    showWarning(message) {
        vscode.window.showWarningMessage(`HPC Connector: ${message}`);
    }

    /**
     * Confirm action
     */
    async confirm(message) {
        const selection = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Yes',
            'No'
        );
        return selection === 'Yes';
    }
}

module.exports = UIManager;
