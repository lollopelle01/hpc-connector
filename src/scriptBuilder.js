const path = require('path');
const ExecutorFactory = require('./executors/executorFactory');
const { getInstance: getLogger } = require('./logger');

/**
 * Builds SLURM batch scripts for job execution
 * 
 * Responsibilities:
 * - Generate SLURM directives (#SBATCH)
 * - Setup environment (modules, venvs)
 * - Build execution commands
 * - Capture output (stdout/stderr)
 * - Create status.json metadata
 */
class ScriptBuilder {
    constructor() {
        this.logger = getLogger();
    }

    /**
     * Build complete SLURM script for a job
     */
    buildScript(jobConfig, clusterInfo) {
        const fileExt = path.extname(jobConfig.fileName);
        const jobDir = `${clusterInfo.jobsDir}/${jobConfig.id}`;
        
        this.logger.info('Building script for ' + fileExt);
        
        // Create executor for file type
        const executor = ExecutorFactory.createExecutor(
            jobConfig.fileName,
            jobConfig,
            clusterInfo
        );
        
        // Validate configuration
        executor.validate();
        
        // Get components from executor
        const executionCommand = executor.buildExecutionCommand(jobDir, jobConfig.fileName);
        const envSetup = executor.getEnvironmentSetup();
        
        // Build script sections
        const sections = [
            this._buildHeader(jobConfig, jobDir),
            this._buildEnvironment(envSetup, jobDir),
            this._buildExecution(jobConfig, jobDir, executionCommand),
            this._buildStatusCapture(jobConfig, jobDir),
            this._buildFooter()
        ];
        
        return sections.join('\n\n');
    }

    /**
     * Build SLURM header with directives
     */
    _buildHeader(jobConfig, jobDir) {
        const { name, partition, gpus, cpus, memory, time } = jobConfig;
        
        const lines = [];
        lines.push('#!/bin/bash');
        lines.push(`#SBATCH --job-name=${name}`);
        lines.push(`#SBATCH --output=${jobDir}/slurm-%j.out`);
        lines.push(`#SBATCH --error=${jobDir}/slurm-%j.err`);
        lines.push(`#SBATCH --partition=${partition}`);
        lines.push('#SBATCH --nodes=1');
        lines.push('#SBATCH --ntasks=1');
        lines.push(`#SBATCH --cpus-per-task=${cpus}`);
        
        if (gpus > 0) {
            lines.push(`#SBATCH --gres=gpu:${gpus}`);
        }
        
        lines.push(`#SBATCH --mem=${memory}`);
        lines.push(`#SBATCH --time=${time}`);
        lines.push('');
        lines.push('echo "=========================================="');
        lines.push('echo "Job ID: $SLURM_JOB_ID"');
        lines.push(`echo "Job Name: ${name}"`);
        lines.push('echo "Running on: $(hostname)"');
        lines.push('echo "Starting at: $(date +%s)"');
        lines.push('echo "=========================================="');
        
        return lines.join('\n');
    }

    /**
     * Build environment setup section
     */
    _buildEnvironment(envSetup, jobDir) {
        const lines = [];
        lines.push('# Environment setup');
        lines.push('export OMP_NUM_THREADS=$SLURM_CPUS_PER_TASK');
        lines.push('echo "OMP_NUM_THREADS: $OMP_NUM_THREADS"');
        lines.push('');
        lines.push(envSetup);
        lines.push(`cd ${jobDir}`);
        
        return lines.join('\n');
    }

    /**
     * Build execution section with output capture
     */
    _buildExecution(jobConfig, jobDir, executionCommand) {
        const { fileName } = jobConfig;
        
        const lines = [];
        lines.push('# Execution');
        lines.push('START_TIME=$(date +%s)');
        lines.push('');
        lines.push(`echo "Executing: ${fileName}"`);
        lines.push('');
        lines.push('# Capture stdout and stderr separately');
        lines.push(`(${executionCommand}) > execution_log.txt 2> execution_errors.txt`);
        lines.push('');
        lines.push('EXIT_CODE=$?');
        lines.push('END_TIME=$(date +%s)');
        lines.push('DURATION=$((END_TIME - START_TIME))');
        
        return lines.join('\n');
    }

    /**
     * Build status capture section
     */
    _buildStatusCapture(jobConfig, jobDir) {
        const { id, submitted, partition, gpus, cpus, memory, time, fileName, pythonEnv } = jobConfig;
        
        // Build input files list
        const inputFilesList = (jobConfig.inputFiles || [])
            .map(f => `"${path.basename(f)}"`)
            .join(', ');
        
        const lines = [];
        lines.push('# Capture metadata');
        lines.push(`OUTPUT_FILES=$(ls -1 ${jobDir} 2>/dev/null | grep -v -e "job.sbatch" -e "slurm-" -e "status.json" -e "execution_" -e "${fileName}" $(for f in ${(jobConfig.inputFiles || []).map(f => path.basename(f)).join(' ')}; do echo "-e \\"$f\\""; done) || echo "")`);
        lines.push('');
        lines.push('if [ $EXIT_CODE -eq 0 ]; then');
        lines.push('    JOB_STATUS="COMPLETED"');
        lines.push('else');
        lines.push('    JOB_STATUS="FAILED"');
        lines.push('fi');
        lines.push('');
        lines.push('HOSTNAME=$(hostname)');
        lines.push('');
        lines.push('# Format timestamps');
        lines.push('if date --version >/dev/null 2>&1; then');
        lines.push('    START_ISO=$(date -d @$START_TIME -Iseconds)');
        lines.push('    END_ISO=$(date -d @$END_TIME -Iseconds)');
        lines.push('else');
        lines.push('    START_ISO=$(date -u -r $START_TIME +"%Y-%m-%dT%H:%M:%S+00:00")');
        lines.push('    END_ISO=$(date -u -r $END_TIME +"%Y-%m-%dT%H:%M:%S+00:00")');
        lines.push('fi');
        lines.push('');
        lines.push('# Format output files as JSON array (without jq)');
        lines.push('OUTPUT_JSON="["');
        lines.push('FIRST=true');
        lines.push('while IFS= read -r file; do');
        lines.push('    if [ -n "$file" ]; then');
        lines.push('        if [ "$FIRST" = true ]; then');
        lines.push('            OUTPUT_JSON="${OUTPUT_JSON}\\"${file}\\""');
        lines.push('            FIRST=false');
        lines.push('        else');
        lines.push('            OUTPUT_JSON="${OUTPUT_JSON}, \\"${file}\\""');
        lines.push('        fi');
        lines.push('    fi');
        lines.push('done <<< "$OUTPUT_FILES"');
        lines.push('OUTPUT_JSON="${OUTPUT_JSON}]"');
        lines.push('');
        lines.push('# Write status.json');
        lines.push(`cat > ${jobDir}/status.json << EOFSTATUS`);
        lines.push('{');
        lines.push(`  "jobId": "${id}",`);
        lines.push('  "slurmId": "$SLURM_JOB_ID",');
        lines.push('  "status": "$JOB_STATUS",');
        lines.push(`  "submitted": "${submitted}",`);
        lines.push('  "started": "$START_ISO",');
        lines.push('  "completed": "$END_ISO",');
        lines.push('  "duration": $DURATION,');
        lines.push('  "exitCode": $EXIT_CODE,');
        lines.push('  "resources": {');
        lines.push(`    "partition": "${partition}",`);
        lines.push(`    "gpus": ${gpus},`);
        lines.push(`    "cpus": ${cpus},`);
        lines.push(`    "memory": "${memory}",`);
        lines.push(`    "timeLimit": "${time}"`);
        lines.push('  },');
        lines.push('  "files": {');
        lines.push(`    "script": "${fileName}",`);
        lines.push(`    "inputs": [${inputFilesList}],`);
        lines.push('    "outputs": $OUTPUT_JSON');
        lines.push('  },');
        lines.push(`  "pythonEnv": "${pythonEnv || 'N/A'}",`);
        lines.push('  "node": "$HOSTNAME",');
        lines.push('  "errors": []');
        lines.push('}');
        lines.push('EOFSTATUS');
        
        return lines.join('\n');
    }

    /**
     * Build footer with final status
     */
    _buildFooter() {
        const lines = [];
        lines.push('# Final status');
        lines.push('if [ $EXIT_CODE -eq 0 ]; then');
        lines.push('    echo "Job completed successfully"');
        lines.push('else');
        lines.push('    echo "Job failed with exit code $EXIT_CODE"');
        lines.push('fi');
        lines.push('');
        lines.push('echo "=========================================="');
        lines.push('echo "Finished at: $(date)"');
        lines.push('echo "Duration: $DURATION seconds"');
        lines.push('echo "=========================================="');
        lines.push('');
        lines.push('echo "Output files: execution_log.txt, execution_errors.txt"');
        
        return lines.join('\n');
    }
}

module.exports = ScriptBuilder;
