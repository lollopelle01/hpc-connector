const vscode = require('vscode');
const path = require('path');
const ConfigManager = require('./src/configManager');
const ClusterManager = require('./src/clusterManager');
const UIManager = require('./src/uiManager');
const { getInstance: getLogger } = require('./src/logger');

let configManager;
let clusterManager;
let uiManager;
let logger;

function activate(context) {
    // Initialize logger with workspace root if available
    const workspaceRoot = vscode.workspace.workspaceFolders 
        ? vscode.workspace.workspaceFolders[0].uri.fsPath 
        : null;
    
    logger = getLogger(workspaceRoot);
    logger.info('HPC Connector extension activating...');

    configManager = new ConfigManager();
    clusterManager = new ClusterManager(configManager);
    uiManager = new UIManager();

    logger.info('Managers initialized');

    const submitCommand = vscode.commands.registerCommand('hpc-connector.submitJob', async (uri) => {
        await submitJob(uri);
    });

    const viewJobsCommand = vscode.commands.registerCommand('hpc-connector.viewJobs', async () => {
        await viewJobs();
    });

    const configureCommand = vscode.commands.registerCommand('hpc-connector.configure', async () => {
        await configureConnection();
    });

    context.subscriptions.push(submitCommand, viewJobsCommand, configureCommand);

    logger.info('HPC Connector extension activated');
    vscode.window.showInformationMessage('HPC Connector ready!');
}

async function submitJob(uri) {
    try {
        // Get file path from URI (context menu) or active editor
        let filePath;
        
        if (uri) {
            // Called from context menu (right-click)
            filePath = uri.fsPath;
        } else {
            // Called from command palette or keyboard shortcut
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                uiManager.showError('No file is currently open');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        const fileName = path.basename(filePath);
        const fileExt = path.extname(filePath);

        const supportedExtensions = ['.py', '.ipynb', '.c', '.cpp'];
        if (!supportedExtensions.includes(fileExt)) {
            uiManager.showError('Unsupported file type: ' + fileExt);
            return;
        }

        logger.info('Submitting job for file: ' + fileName);

        try {
            configManager.validate();
        } catch (error) {
            uiManager.showError('Configuration incomplete: ' + error.message);
            const configure = await vscode.window.showErrorMessage(
                'HPC Connector is not configured. Configure now?',
                'Configure', 'Cancel'
            );
            if (configure === 'Configure') {
                await configureConnection();
            }
            return;
        }

        const inputFiles = await uiManager.showInputFilesDialog();

        let compilerConfig = null;
        if (fileExt === '.c' || fileExt === '.cpp') {
            compilerConfig = await uiManager.showCompilerFlagsDialog(configManager);
            if (compilerConfig === null) return;
        }

        const jobConfig = await uiManager.showSchedulingDialog(configManager, fileExt);
        if (!jobConfig) return;

        if (compilerConfig) {
            Object.assign(jobConfig, compilerConfig);
        }

        logger.info('Job configuration prepared');

        await uiManager.withProgress('Submitting job to cluster...', async (progress) => {
            progress.report({ message: 'Connecting to cluster...' });
            
            const result = await clusterManager.submitJob(filePath, inputFiles, jobConfig);
            
            logger.info('Job submitted: ' + result.jobId);
            
            const viewJob = await vscode.window.showInformationMessage(
                'Job submitted successfully! Job ID: ' + result.jobId,
                'View Jobs', 'OK'
            );
            
            if (viewJob === 'View Jobs') {
                await viewJobs();
            }
        });

    } catch (error) {
        logger.error('Submit job failed: ' + error.message);
        uiManager.showError('Failed to submit job: ' + error.message);
    }
}

async function viewJobs() {
    try {
        try {
            configManager.validate();
        } catch (error) {
            uiManager.showError('Configuration incomplete: ' + error.message);
            return;
        }

        const action = await vscode.window.showQuickPick([
            { label: '$(list-unordered) View Active Jobs', value: 'active' },
            { label: '$(check) View Completed Jobs', value: 'completed' },
            { label: '$(cloud-download) Download Results', value: 'download' },
            { label: '$(trash) Clean Remote Files', value: 'clean' }
        ], {
            placeHolder: 'What would you like to do?'
        });

        if (!action) return;

        switch (action.value) {
            case 'active':
                await viewActiveJobs();
                break;
            case 'completed':
                await viewCompletedJobs();
                break;
            case 'download':
                await downloadJobResults();
                break;
            case 'clean':
                await cleanJobFiles();
                break;
        }

    } catch (error) {
        logger.error('View jobs failed: ' + error.message);
        uiManager.showError('Failed to view jobs: ' + error.message);
    }
}

async function viewActiveJobs() {
    await uiManager.withProgress('Checking job status...', async () => {
        const activeJobs = await clusterManager.getJobStatus();

        if (activeJobs.length === 0) {
            uiManager.showWarning('No active jobs');
            return;
        }

        const selectedJob = await uiManager.showJobPicker(activeJobs, 'Active Jobs');
        if (selectedJob) {
            await showJobDetails(selectedJob.id);
        }
    });
}

async function viewCompletedJobs() {
    await uiManager.withProgress('Loading completed jobs...', async () => {
        const completedJobs = await clusterManager.getCompletedJobs();

        if (completedJobs.length === 0) {
            uiManager.showWarning('No completed jobs');
            return;
        }

        const selectedJob = await uiManager.showJobPicker(completedJobs, 'Completed Jobs');
        if (selectedJob) {
            await showJobDetails(selectedJob.id);
        }
    });
}

async function showJobDetails(jobId) {
    await uiManager.withProgress('Loading job details...', async () => {
        const details = await clusterManager.getJobDetails(jobId);
        uiManager.showJobDetails(details);
    });
}

async function downloadJobResults() {
    const completedJobs = await clusterManager.getCompletedJobs();

    if (completedJobs.length === 0) {
        uiManager.showWarning('No completed jobs available for download');
        return;
    }

    const selectedJob = await uiManager.showJobPicker(completedJobs, 'Select job to download');
    if (!selectedJob) return;

    await uiManager.withProgress('Downloading results...', async (progress) => {
        progress.report({ message: 'Fetching files from cluster...' });
        
        const resultsDir = await clusterManager.fetchResults(selectedJob.id);
        
        uiManager.showSuccess('Results downloaded to: ' + resultsDir);
        
        const openFolder = await vscode.window.showInformationMessage(
            'Results downloaded successfully!',
            'Open Folder', 'OK'
        );
        
        if (openFolder === 'Open Folder') {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(resultsDir));
        }
    });
}

async function cleanJobFiles() {
    const jobs = clusterManager.loadJobs();

    if (jobs.length === 0) {
        uiManager.showWarning('No jobs to clean');
        return;
    }

    const selectedJob = await uiManager.showJobPicker(jobs, 'Select job to clean');
    if (!selectedJob) return;

    const confirmed = await uiManager.confirm(
        'Are you sure you want to delete remote files for job "' + selectedJob.name + '"?'
    );

    if (!confirmed) return;

    await uiManager.withProgress('Cleaning remote files...', async () => {
        await clusterManager.cleanRemoteJob(selectedJob.id);
        uiManager.showSuccess('Remote files cleaned successfully');
    });
}

async function configureConnection() {
    try {
        const currentHost = configManager.get('clusterHost') || '';
        const currentUser = configManager.get('username') || '';
        const currentPort = configManager.get('sshPort') || 22;

        const clusterHost = await vscode.window.showInputBox({
            prompt: 'Cluster Hostname',
            value: currentHost,
            placeHolder: 'hpc.example.com'
        });
        if (clusterHost === undefined) return;

        const username = await vscode.window.showInputBox({
            prompt: 'Username',
            value: currentUser,
            placeHolder: 'your.name@domain.com'
        });
        if (username === undefined) return;

        const sshPort = await vscode.window.showInputBox({
            prompt: 'SSH Port',
            value: currentPort.toString(),
            placeHolder: '22'
        });
        if (sshPort === undefined) return;

        await configManager.set('clusterHost', clusterHost.trim());
        await configManager.set('username', username.trim());
        await configManager.set('sshPort', parseInt(sshPort));

        logger.info('Configuration saved');
        
        uiManager.showSuccess('Configuration saved successfully!');

        const testConn = await vscode.window.showInformationMessage(
            'Configuration saved. Test connection now?',
            'Test Connection', 'Later'
        );

        if (testConn === 'Test Connection') {
            await testConnection();
        }

    } catch (error) {
        logger.error('Configuration failed: ' + error.message);
        uiManager.showError('Failed to save configuration: ' + error.message);
    }
}

async function testConnection() {
    try {
        await uiManager.withProgress('Testing cluster connection...', async () => {
            await clusterManager.connect();
            const result = await clusterManager.executeCommand('echo "Connection test"');
            
            logger.info('Connection test successful');
            
            uiManager.showSuccess('Connection successful!');
        });
    } catch (error) {
        logger.error('Connection test failed: ' + error.message);
        uiManager.showError('Connection test failed: ' + error.message);
    }
}

function deactivate() {
    logger.info('HPC Connector extension deactivating...');
    
    if (clusterManager) {
        clusterManager.disconnect();
    }
    
    logger.info('Extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
