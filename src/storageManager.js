const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

/**
 * Manages local storage for job metadata
 * 
 * Stores job data in workspace-specific location:
 * - If opened in workspace: .vscode/.hpc-connector/jobs.json
 * - If no workspace: prompts user to select a directory
 */
class StorageManager {
    constructor() {
        this.jobsFile = null;
        this.storageDir = null;
    }

    /**
     * Initialize storage location
     * Returns the directory where jobs.json is stored
     */
    async initialize() {
        if (this.jobsFile) {
            return this.storageDir;
        }

        // Try workspace folder first
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Use first workspace folder
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.storageDir = path.join(workspaceRoot, '.vscode', '.hpc-connector');
        } else {
            // No workspace open - ask user where to store data
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select folder for HPC job data',
                title: 'Where should HPC Connector store job metadata?',
            });

            if (!selectedFolder || selectedFolder.length === 0) {
                throw new Error('No storage location selected. Please open a workspace or select a folder.');
            }

            this.storageDir = path.join(selectedFolder[0].fsPath, '.hpc-connector');
        }

        this.jobsFile = path.join(this.storageDir, 'jobs.json');
        
        // Create directory if needed
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }

        // Create jobs file if needed
        if (!fs.existsSync(this.jobsFile)) {
            fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
        }

        return this.storageDir;
    }

    /**
     * Get storage directory path
     */
    getStorageDir() {
        if (!this.storageDir) {
            throw new Error('Storage not initialized. Call initialize() first.');
        }
        return this.storageDir;
    }

    /**
     * Get results directory for a job
     */
    getResultsDir(jobId) {
        return path.join(this.getStorageDir(), 'results', jobId);
    }

    /**
     * Load all jobs from storage
     */
    loadJobs() {
        if (!this.jobsFile) {
            throw new Error('Storage not initialized');
        }

        try {
            const content = fs.readFileSync(this.jobsFile, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            return [];
        }
    }

    /**
     * Save jobs to storage
     */
    saveJobs(jobs) {
        if (!this.jobsFile) {
            throw new Error('Storage not initialized');
        }

        fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
    }

    /**
     * Get a specific job by ID
     */
    getJob(jobId) {
        const jobs = this.loadJobs();
        return jobs.find(j => j.id === jobId);
    }

    /**
     * Update a specific job
     */
    updateJob(jobId, updates) {
        const jobs = this.loadJobs();
        const index = jobs.findIndex(j => j.id === jobId);
        
        if (index === -1) {
            throw new Error(`Job ${jobId} not found`);
        }

        jobs[index] = { ...jobs[index], ...updates };
        this.saveJobs(jobs);
        
        return jobs[index];
    }

    /**
     * Delete a job from storage
     */
    deleteJob(jobId) {
        const jobs = this.loadJobs();
        const filtered = jobs.filter(j => j.id !== jobId);
        this.saveJobs(filtered);
    }
}

module.exports = StorageManager;
