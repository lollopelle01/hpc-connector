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
            console.log('[StorageManager] Already initialized: ' + this.storageDir);
            return this.storageDir;
        }

        console.log('[StorageManager] Initializing storage...');

        // Try workspace folder first
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders && workspaceFolders.length > 0) {
            // Use first workspace folder
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.storageDir = path.join(workspaceRoot, '.vscode', '.hpc-connector');
            console.log('[StorageManager] Using workspace storage: ' + this.storageDir);
        } else {
            console.log('[StorageManager] No workspace open, asking user...');
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
            console.log('[StorageManager] Using selected folder: ' + this.storageDir);
        }

        this.jobsFile = path.join(this.storageDir, 'jobs.json');
        console.log('[StorageManager] Jobs file: ' + this.jobsFile);
        
        // Create directory if needed
        if (!fs.existsSync(this.storageDir)) {
            console.log('[StorageManager] Creating storage directory...');
            fs.mkdirSync(this.storageDir, { recursive: true });
            console.log('[StorageManager] ✅ Storage directory created');
        } else {
            console.log('[StorageManager] Storage directory already exists');
        }

        // Create jobs file if needed
        if (!fs.existsSync(this.jobsFile)) {
            console.log('[StorageManager] Creating jobs.json...');
            fs.writeFileSync(this.jobsFile, JSON.stringify([], null, 2));
            console.log('[StorageManager] ✅ jobs.json created');
        } else {
            console.log('[StorageManager] jobs.json already exists');
        }

        console.log('[StorageManager] ✅ Initialization complete');
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
            console.warn('[StorageManager] Could not load jobs.json, returning empty array');
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

        console.log('[StorageManager] Saving ' + jobs.length + ' jobs to ' + this.jobsFile);
        fs.writeFileSync(this.jobsFile, JSON.stringify(jobs, null, 2));
        console.log('[StorageManager] ✅ Jobs saved');
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
