const vscode = require('vscode');

/**
 * Manages UI interactions
 */
class UIManager {
    
    /**
     * Show compiler flags dialog for C/C++ files
     * Allows customization of compilation flags
     */
    async showCompilerFlagsDialog(configManager) {
        // Optimization level
        const optimizationLevel = await vscode.window.showQuickPick(
            [
                { label: '-O0', description: 'No optimization (debug)' },
                { label: '-O1', description: 'Basic optimization' },
                { label: '-O2', description: 'Good optimization' },
                { label: '-O3', description: 'Aggressive optimization (default)', picked: true },
            ],
            {
                placeHolder: 'Select optimization level',
                canPickMany: false,
            }
        );
        if (!optimizationLevel) return null;

        // Extra compiler flags
        const extraFlags = await vscode.window.showInputBox({
            prompt: 'Additional compiler flags (optional)',
            placeHolder: '-Wall -Wextra -std=c17',
            value: '-Wall',
        });
        if (extraFlags === undefined) return null;

        // Include directories
        const includeFlags = await vscode.window.showInputBox({
            prompt: 'Include directories (optional)',
            placeHolder: '-I/path/to/headers',
            value: '',
        });
        if (includeFlags === undefined) return null;

        return {
            optimizationLevel: optimizationLevel.label,
            extraFlags: extraFlags,
            includeFlags: includeFlags,
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
     * Allows user to select additional input files to upload with the job
     */
    async showInputFilesDialog() {
        const selection = await vscode.window.showQuickPick(
            ['Yes - Select input files', 'No - Submit without additional files'],
            {
                placeHolder: 'Does this job need additional input files?',
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
            openLabel: 'Select Input Files',
            filters: {
                'All Files': ['*'],
                'Data Files': ['csv', 'json', 'txt', 'xml', 'yaml', 'yml'],
                'Config Files': ['cfg', 'conf', 'ini', 'toml'],
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
