const fs = require('fs');
const path = require('path');
const ConnectionManager = require('./connectionManager');
const StorageManager = require('./storageManager');
const ScriptBuilder = require('./scriptBuilder');
const { getInstance: getLogger } = require('./logger');

/**
 * Manages cluster operations and job lifecycle
 * 
 * Responsibilities:
 * - Submit jobs to SLURM
 * - Monitor job status
 * - Download results
 * - Clean remote files
 * - Persist job metadata locally (via StorageManager)
 */
class ClusterManager {
    constructor(configManager) {
        this.config = configManager;
        this.connectionManager = new ConnectionManager(configManager);
        this.storageManager = new StorageManager();
        this.scriptBuilder = new ScriptBuilder();
        this.logger = getLogger();
        this.logger.info('ClusterManager initialized');
    }

    /**
     * Ensure storage is initialized
     */
    async ensureStorage() {
        await this.storageManager.initialize();
    }

    /**
     * Load jobs from storage
     */
    loadJobs() {
        return this.storageManager.loadJobs();
    }

    /**
     * Save jobs to storage
     */
    saveJobs(jobs) {
        this.storageManager.saveJobs(jobs);
    }

    // ===== Connection Methods =====
    
    async connect() {
        return this.connectionManager.getConnection();
    }

    async executeCommand(command, options = {}) {
        return this.connectionManager.executeCommand(command, options);
    }

    async uploadFile(localPath, remotePath, options = {}) {
        return this.connectionManager.uploadFile(localPath, remotePath, options);
    }

    async downloadFile(remotePath, localPath, options = {}) {
        return this.connectionManager.downloadFile(remotePath, localPath, options);
    }

    async downloadDirectory(remotePath, localPath) {
        const conn = await this.connect();
        return new Promise((resolve, reject) => {
            conn.sftp(async (err, sftp) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    await this._downloadDirRecursive(sftp, remotePath, localPath);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async _downloadDirRecursive(sftp, remotePath, localPath) {
        if (!fs.existsSync(localPath)) {
            fs.mkdirSync(localPath, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            sftp.readdir(remotePath, async (err, list) => {
                if (err) {
                    reject(err);
                    return;
                }

                for (const item of list) {
                    const remoteFile = path.posix.join(remotePath, item.filename);
                    const localFile = path.join(localPath, item.filename);

                    if (item.attrs.isDirectory()) {
                        await this._downloadDirRecursive(sftp, remoteFile, localFile);
                    } else {
                        await new Promise((res, rej) => {
                            sftp.fastGet(remoteFile, localFile, (err) => {
                                if (err) rej(err);
                                else res();
                            });
                        });
                    }
                }
                resolve();
            });
        });
    }

    // ===== Job Submission =====

    generateJobId() {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/T/, 'T')
            .replace(/\..+/, '')
            .replace(/:/g, '-');
        const ms = now.getMilliseconds().toString().padStart(3, '0');
        return `${timestamp}-${ms}`;
    }

    async submitJob(filePath, inputFiles, jobConfig) {
        await this.ensureStorage();
        
        this.logger.info('Submitting job: ' + jobConfig.name);
        
        const clusterInfo = this.config.getClusterInfo();
        const fileName = path.basename(filePath);
        
        const jobId = this.generateJobId();
        jobConfig.id = jobId;
        jobConfig.fileName = fileName;
        jobConfig.submitted = new Date().toISOString();
        jobConfig.inputFiles = inputFiles || [];

        this.logger.info('Job ID: ' + jobId);

        const remoteJobDir = `${clusterInfo.jobsDir}/${jobId}`;

        // Create remote directory
        this.logger.info('Creating remote directory: ' + remoteJobDir);
        await this.executeCommand(`mkdir -p ${remoteJobDir}`);

        // Upload main script
        this.logger.info('Uploading script: ' + fileName);
        const remoteFilePath = `${remoteJobDir}/${fileName}`;
        await this.uploadFile(filePath, remoteFilePath);

        // Upload input files
        if (inputFiles && inputFiles.length > 0) {
            this.logger.info('Uploading ' + inputFiles.length + ' input files');
            for (const inputFile of inputFiles) {
                const inputFileName = path.basename(inputFile);
                const remoteInputPath = `${remoteJobDir}/${inputFileName}`;
                await this.uploadFile(inputFile, remoteInputPath);
            }
        }

        // Generate and upload SLURM script
        this.logger.info('Generating SLURM script');
        const slurmScript = this.scriptBuilder.buildScript(jobConfig, clusterInfo);
        const localScriptPath = path.join(require('os').tmpdir(), `job_${jobId}.sbatch`);
        fs.writeFileSync(localScriptPath, slurmScript);
        
        const remoteScriptPath = `${remoteJobDir}/job.sbatch`;
        this.logger.info('Uploading SLURM script');
        await this.uploadFile(localScriptPath, remoteScriptPath);
        fs.unlinkSync(localScriptPath);

        // Submit to SLURM
        this.logger.info('Submitting to SLURM');
        const { stdout } = await this.executeCommand(`cd ${remoteJobDir} && sbatch job.sbatch`);
        this.logger.info('SLURM output: ' + stdout);

        // Extract SLURM job ID
        let slurmId = null;
        const match = stdout.match(/Submitted batch job (\d+)/);
        if (match) {
            slurmId = match[1];
            this.logger.info('SLURM Job ID: ' + slurmId);
        } else {
            this.logger.warn('Could not extract SLURM job ID from output');
        }

        // Save job metadata
        const jobs = this.loadJobs();
        jobs.push({
            id: jobId,
            slurmId: slurmId,
            name: jobConfig.name,
            fileName: fileName,
            filePath: filePath,
            inputFiles: inputFiles,
            remoteDir: remoteJobDir,
            submitted: jobConfig.submitted,
            status: 'PENDING',
            config: jobConfig,
        });
        this.saveJobs(jobs);

        this.logger.info('Job submission complete');
        return { jobId, slurmId };
    }

    // ===== Job Monitoring =====

    async getJobStatus() {
        await this.ensureStorage();
        
        this.logger.info('Checking job statuses');
        const jobs = this.loadJobs();
        
        for (const job of jobs) {
            if (job.slurmId && job.status !== 'COMPLETED' && job.status !== 'FAILED') {
                try {
                    this.logger.debug('Checking status for job ' + job.id);
                    
                    // Check SLURM queue
                    const { stdout } = await this.executeCommand(`squeue -j ${job.slurmId} -o '%T' -h`);
                    
                    if (stdout.trim()) {
                        job.status = stdout.trim();
                        this.logger.debug('Job ' + job.id + ' is in queue with status: ' + job.status);
                    } else {
                        // Job not in queue, check status.json
                        this.logger.debug('Job ' + job.id + ' not in queue, checking status.json');
                        try {
                            const statusResult = await this.executeCommand(`cat ${job.remoteDir}/status.json 2>/dev/null`);
                            if (statusResult.stdout && statusResult.stdout.trim()) {
                                const statusData = JSON.parse(statusResult.stdout);
                                if (statusData.status && !statusData.status.includes('$') && !statusData.status.includes('[')) {
                                    job.status = statusData.status;
                                    job.statusData = statusData;
                                    this.logger.debug('Job ' + job.id + ' status from file: ' + job.status);
                                } else {
                                    this.logger.warn('Job ' + job.id + ' has invalid status.json, assuming COMPLETED');
                                    job.status = 'COMPLETED';
                                }
                            } else {
                                this.logger.debug('Job ' + job.id + ' status.json not found, status: UNKNOWN');
                                job.status = 'UNKNOWN';
                            }
                        } catch (error) {
                            this.logger.error('Error reading status.json for job ' + job.id + ': ' + error.message);
                            job.status = 'UNKNOWN';
                        }
                    }
                } catch (error) {
                    this.logger.error('Error checking status for job ' + job.id + ': ' + error.message);
                    job.status = 'UNKNOWN';
                }
            }
        }

        this.saveJobs(jobs);
        const activeJobs = jobs.filter(j => j.status !== 'COMPLETED' && j.status !== 'FAILED');
        this.logger.info('Active jobs: ' + activeJobs.length);
        return activeJobs;
    }

    async getCompletedJobs() {
        await this.ensureStorage();
        
        this.logger.info('Getting completed jobs');
        await this.getJobStatus();
        const jobs = this.loadJobs();
        const completedJobs = jobs.filter(j => j.status === 'COMPLETED');
        this.logger.info('Completed jobs: ' + completedJobs.length);
        return completedJobs;
    }

    async getJobDetails(jobId) {
        await this.ensureStorage();
        
        this.logger.info('Getting details for job ' + jobId);
        const jobs = this.loadJobs();
        const job = jobs.find(j => j.id === jobId);

        if (!job) {
            throw new Error('Job ' + jobId + ' not found');
        }

        // Load status.json if available
        try {
            const { stdout } = await this.executeCommand(`cat ${job.remoteDir}/status.json 2>/dev/null`);
            if (stdout && stdout.trim()) {
                job.statusData = JSON.parse(stdout);
                this.logger.info('Loaded status data for job ' + jobId);
            }
        } catch (error) {
            this.logger.warn('Could not load status.json for job ' + jobId + ': ' + error.message);
        }

        // Load SLURM logs
        try {
            const { stdout } = await this.executeCommand(`tail -n 50 ${job.remoteDir}/slurm-*.out 2>/dev/null || echo ""`);
            
            if (stdout.trim()) {
                job.logs = stdout;
                this.logger.info('Loaded SLURM logs for job ' + jobId);
            } else {
                job.logs = 'No SLURM logs available.';
                this.logger.info('No SLURM logs found for job ' + jobId);
            }
        } catch (error) {
            job.logs = 'Unable to fetch logs';
            this.logger.error('Error fetching logs for job ' + jobId + ': ' + error.message);
        }

        return job;
    }

    // ===== Results Management =====

    async fetchResults(jobId) {
        await this.ensureStorage();
        
        this.logger.info('Fetching results for job ' + jobId);
        const jobs = this.loadJobs();
        const job = jobs.find(j => j.id === jobId);

        if (!job) {
            throw new Error('Job ' + jobId + ' not found');
        }

        const resultsDir = this.storageManager.getResultsDir(jobId);
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir, { recursive: true });
        }

        this.logger.info('Downloading to: ' + resultsDir);
        await this.downloadDirectory(job.remoteDir, resultsDir);
        this.logger.info('Download complete');
        
        return resultsDir;
    }

    async cleanRemoteJob(jobId) {
        await this.ensureStorage();
        
        this.logger.info('Cleaning remote files for job ' + jobId);
        const jobs = this.loadJobs();
        const job = jobs.find(j => j.id === jobId);

        if (!job) {
            throw new Error('Job ' + jobId + ' not found');
        }

        await this.executeCommand(`rm -rf ${job.remoteDir}`);
        this.logger.info('Remote files cleaned for job ' + jobId);
    }

    // ===== Cleanup =====

    disconnect() {
        if (this.connectionManager) {
            this.logger.info('Disconnecting via ConnectionManager');
            this.connectionManager.disconnect();
        }
    }
}

module.exports = ClusterManager;
