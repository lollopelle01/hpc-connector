# HPC Connector

A Visual Studio Code extension for submitting and managing computational jobs on SLURM-based HPC clusters via SSH. I implemented it specifically for the cluster of University of Bologna.

**NOTE**: i wrote this documentation with Claude for better clarity.

[![VSCode](https://img.shields.io/badge/VSCode-1.85.0+-blue.svg)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Architecture](#architecture)
  - [Local Storage Structure](#local-storage-structure)
  - [Remote Directory Structure](#remote-directory-structure)
  - [Component Overview](#component-overview)
- [Configuration](#configuration)
- [Usage Workflows](#usage-workflows)
  - [Initial Setup](#initial-setup)
  - [Submitting a Job](#submitting-a-job)
  - [Monitoring Jobs](#monitoring-jobs)
  - [Downloading Results](#downloading-results)
  - [Cleaning Remote Files](#cleaning-remote-files)
- [Supported File Types](#supported-file-types)
- [What&#39;s Automated vs Manual](#whats-automated-vs-manual)
- [Technical Details](#technical-details)
  - [Job Lifecycle](#job-lifecycle)
  - [SSH Connection Management](#ssh-connection-management)
  - [Script Generation](#script-generation)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Overview

HPC Connector bridges the gap between local development in VSCode and remote execution on HPC clusters. Instead of manually SSH-ing into the cluster, copying files, writing SLURM scripts, and monitoring jobs, you can do everything directly from VSCode with just a few clicks.

**Key Concept**: You write and test your code locally in VSCode, then submit it to the cluster where it runs with the resources (GPUs, CPUs, memory) you specify. Results are downloaded back to your local workspace.

---

## Features

- **One-Click Job Submission**: Right-click any Python, Jupyter Notebook, C, or C++ file to submit it to the cluster
- **SLURM Integration**: Automatic generation of SLURM batch scripts with resource specifications
- **Job Monitoring**: Track active and completed jobs with real-time status updates
- **Result Management**: Download job outputs and logs with a single command
- **Workspace-Specific Storage**: Job metadata is stored per-project in `.vscode/.hpc-connector/`
- **Multi-Language Support**: Python scripts, Jupyter notebooks, C/C++ programs
- **Virtual Environment Support**: Automatic activation of Python virtual environments on the cluster
- **Robust SSH Handling**: Connection pooling, automatic retry with exponential backoff, keepalive

---

## Prerequisites

### On Your Local Machine

1. **Visual Studio Code** 1.85.0 or higher
2. **SSH Key Pair** for cluster authentication (password auth not supported)
   - Key must be in `~/.ssh/` with one of these names:
     - `id_ed25519_unibo`
     - `id_ed25519`
     - `id_rsa`
     - `id_hpc_test`
   - Or configure SSH agent with `SSH_AUTH_SOCK`

### On the HPC Cluster

The extension expects certain things to be **already set up** on the cluster:

1. **SSH Access**: You must be able to SSH into the cluster manually
2. **SLURM Scheduler**: The cluster must use SLURM for job scheduling
3. **Python Virtual Environments** (for Python jobs):
   - Must be pre-created in `/scratch.hpc/<username>/python_venvs/`
   - Each venv must have required packages installed (jupyter, nbconvert, etc.)
4. **Directory Structure**: The extension will create directories in `/scratch.hpc/<username>/` but you must have write permissions there
5. **System Tools**: `sbatch`, `squeue`, `ssh`, `sftp` must be available

### Important: What This Extension Does NOT Do

- ❌ Create Python virtual environments on the cluster
- ❌ Install packages in remote environments
- ❌ Configure SSH keys (you must do this manually first)
- ❌ Set up VPN or network access to the cluster
- ❌ Compile system libraries or install system dependencies

---

## Installation

### Method 1: Install from VSIX (Recommended for Users)

1. Download the latest `hpc-connector-X.X.X.vsix` file
2. Open VSCode
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Linux/Windows)
4. Type "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file
6. Restart VSCode

### Method 2: Install from Source (For Developers)

```bash
# Clone the repository
git clone <repository-url>
cd hpc-connector

# Install dependencies
npm install

# Package the extension
npx vsce package

# Install the generated .vsix
code --install-extension hpc-connector-1.0.0.vsix
```

---

## Architecture

### Local Storage Structure

Jobs and results are stored in a workspace-specific directory:

```
<workspace-root>/
└── .vscode/
    └── .hpc-connector/
        ├── jobs.json           # Job metadata database
        ├── logs/
        │   └── extension.log   # Extension logs
        └── results/
            └── <job-id>/       # Downloaded results per job
                ├── script.py
                ├── slurm-*.out
                ├── slurm-*.err
                ├── status.json
                └── ...
```

**Key Points**:

- Storage is **per-workspace**: Each VSCode workspace has its own job history
- If no workspace is open, you'll be prompted to select a storage location
- The `.vscode/.hpc-connector/` directory can be safely deleted to reset job history

### Remote Directory Structure

On the HPC cluster, the extension uses this structure:

```
/scratch.hpc/<username>/
├── python_venvs/              # Python virtual environments (YOU create these)
│   ├── base_env/
│   ├── pytorch_env/
│   └── tensorflow_env/
└── hpc_jobs/                  # Job directories (extension creates these)
    └── <job-id>/              # One directory per job
        ├── job.sbatch         # Generated SLURM script
        ├── script.py          # Your uploaded script
        ├── input_data.csv     # Any input files you specified
        ├── slurm-<id>.out     # SLURM stdout
        ├── slurm-<id>.err     # SLURM stderr
        ├── status.json        # Job metadata
        ├── execution_log.txt  # Script stdout
        └── execution_errors.txt # Script stderr
```

**Important Notes**:

- The extension extracts the username from your email (e.g., `user@domain.com` → `/scratch.hpc/user/`)
- You must manually create Python virtual environments before using them
- Job directories persist on the cluster until you explicitly clean them

### Component Overview

The extension follows a modular architecture:

```
extension.js                    # VSCode extension entry point
├── ConfigManager              # Manages VSCode settings
├── ClusterManager             # Orchestrates all cluster operations
│   ├── ConnectionManager      # SSH connection handling with retry logic
│   ├── StorageManager         # Local job metadata persistence
│   ├── ScriptBuilder          # SLURM script generation
│   │   └── ExecutorFactory    # Creates language-specific executors
│   │       ├── PythonExecutor # Handles .py and .ipynb
│   │       └── CppExecutor    # Handles .c and .cpp
│   ├── UIManager              # VSCode UI interactions
│   ├── SafetyManager          # Path validation and security
│   └── Logger                 # Logging system
```

**Design Principles**:

- **Separation of Concerns**: Each component has a single, well-defined responsibility
- **Retry Logic**: Network operations automatically retry with exponential backoff
- **Type Safety**: Executor pattern handles different file types cleanly
- **Security**: SafetyManager validates all remote paths to prevent traversal attacks

---

## Configuration

### First-Time Setup

1. Open VSCode Command Palette (`Cmd+Shift+P`)
2. Run "HPC: Configure Connection"
3. Enter:
   - **Cluster Host**: e.g., `hpc.example.com`
   - **Username**: Your SSH username (can include `@domain.com`)
   - **SSH Port**: Usually `22`

Settings are stored in VSCode's global configuration and persist across sessions.

### Advanced Configuration

Open VSCode Settings (`Cmd+,`) and search for "HPC Connector":

| Setting                            | Description                             | Default      |
| ---------------------------------- | --------------------------------------- | ------------ |
| `hpc-connector.clusterHost`      | HPC cluster hostname                    | `""`       |
| `hpc-connector.username`         | SSH username                            | `""`       |
| `hpc-connector.sshPort`          | SSH port number                         | `22`       |
| `hpc-connector.pythonEnv`        | Default Python virtual environment name | `base_env` |
| `hpc-connector.defaultPartition` | Default SLURM partition                 | `l40`      |
| `hpc-connector.defaultGPUs`      | Default number of GPUs                  | `1`        |
| `hpc-connector.defaultCPUs`      | Default number of CPUs                  | `4`        |
| `hpc-connector.defaultMemory`    | Default memory allocation               | `16G`      |
| `hpc-connector.defaultTime`      | Default time limit (HH:MM:SS)           | `02:00:00` |

You can override these defaults when submitting each job.

---

## Usage Workflows

### Initial Setup

**Before using the extension for the first time:**

1. **Set up SSH keys** on the cluster:

   ```bash
   # On your local machine
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519
   ssh-copy-id -i ~/.ssh/id_ed25519.pub user@hpc.example.com

   # Test the connection
   ssh user@hpc.example.com
   ```
2. **Create Python virtual environments** on the cluster (if using Python):

   ```bash
   # SSH into the cluster
   ssh user@hpc.example.com

   # Create base directory
   mkdir -p /scratch.hpc/$USER/python_venvs

   # Create a virtual environment
   cd /scratch.hpc/$USER/python_venvs
   python3 -m venv base_env
   source base_env/bin/activate

   # Install required packages
   pip install jupyter nbconvert ipykernel numpy scipy matplotlib
   ```
3. **Configure the extension** in VSCode (see [Configuration](#configuration))
4. **Test the connection**:

   - After configuration, you'll be prompted to test the connection
   - Check the extension logs at `.vscode/.hpc-connector/logs/extension.log`

### Submitting a Job

**Method 1: Right-Click (Recommended)**

1. Open a supported file (`.py`, `.ipynb`, `.c`, `.cpp`)
2. Right-click in the editor or on the file in Explorer
3. Select "HPC: Submit Current File"
4. Fill in the job configuration form:
   - Job Name
   - SLURM Partition
   - Resources (GPUs, CPUs, Memory, Time)
   - Python Environment (for Python files)
   - Compiler flags (for C/C++ files)
5. Optionally select input files to upload alongside your script
6. Click OK to submit

**Method 2: Command Palette**

1. Open the file you want to submit
2. Press `Cmd+Shift+P` and type "HPC: Submit Current File"
3. Follow the same configuration process

**What Happens:**

1. Extension validates your configuration
2. Creates a unique job directory on the cluster
3. Uploads your script and any input files via SFTP
4. Generates a SLURM batch script based on your configuration
5. Submits the job to SLURM with `sbatch`
6. Stores job metadata locally in `jobs.json`
7. Shows success notification with SLURM job ID

### Monitoring Jobs

**View Active Jobs:**

1. Command Palette → "HPC: View Jobs"
2. Select "View Active Jobs"
3. Extension queries SLURM with `squeue`
4. Select a job to see details:
   - SLURM job ID
   - Status (PENDING, RUNNING, etc.)
   - Resource allocation
   - Submission time
   - Recent logs (last 50 lines)

**View Completed Jobs:**

1. Command Palette → "HPC: View Jobs"
2. Select "View Completed Jobs"
3. View jobs that have finished (successfully or with errors)
4. Check `status.json` for:
   - Exit code
   - Runtime duration
   - Output files generated

**Job Status Values:**

- `PENDING`: Job is queued, waiting for resources
- `RUNNING`: Job is currently executing
- `COMPLETED`: Job finished successfully (exit code 0)
- `FAILED`: Job finished with errors (non-zero exit code)
- `UNKNOWN`: Status cannot be determined (check manually)

### Downloading Results

1. Command Palette → "HPC: View Jobs"
2. Select "Download Results"
3. Choose the job you want to download
4. Extension recursively downloads the entire job directory via SFTP
5. Files are saved to `.vscode/.hpc-connector/results/<job-id>/`
6. You'll see a notification with the local path
7. Click "Open Folder" to view results in Finder/Explorer

**Downloaded Files Include:**

- Your original script (with outputs for Jupyter notebooks)
- SLURM logs (`.out` and `.err`)
- Execution logs (`execution_log.txt`, `execution_errors.txt`)
- Any output files your script created
- `status.json` with job metadata

### Cleaning Remote Files

To save disk space on the cluster:

1. Command Palette → "HPC: View Jobs"
2. Select "Clean Remote Files"
3. Choose a job to clean
4. Confirm the deletion
5. Extension runs `rm -rf` on the remote job directory

**Warning**: This is permanent! Download results first if you need them.

---

## Supported File Types

### Python Scripts (`.py`)

- Executed with `python script.py`
- Output captured to `execution_log.txt`
- Requires Python virtual environment on cluster

### Jupyter Notebooks (`.ipynb`)

- Executed with `jupyter nbconvert --execute --inplace`
- **Cell outputs are preserved** in the notebook file
- Execution errors appear in `execution_errors.txt`
- Requires `jupyter` and `nbconvert` in the virtual environment

### C Programs (`.c`)

- Compiled with `gcc` and configurable flags
- Executed after compilation
- Supports OpenMP for parallelization

### C++ Programs (`.cpp`)

- Compiled with `g++` and configurable flags
- Executed after compilation
- Supports OpenMP for parallelization

---

## What's Automated vs Manual

### ✅ Fully Automated by Extension

- SSH connection establishment and management
- SLURM script generation with correct directives
- File uploads (script + input files) via SFTP
- Job submission with `sbatch`
- Status monitoring via `squeue` and `status.json`
- Result downloads via SFTP (recursive directory transfer)
- Job metadata tracking in `jobs.json`
- Log file management
- Retry logic for network failures
- Path validation for security

### ⚠️ Requires Manual Setup (One-Time)

- SSH key generation and installation on cluster
- Python virtual environment creation on cluster
- Package installation in virtual environments
- VPN connection (if required by your cluster)
- Initial test SSH connection to verify access
- Directory permissions in `/scratch.hpc/<username>/`

### ❌ NOT Automated (By Design)

- **Live output streaming**: You cannot see script output in real-time as it runs. Jobs execute in batch mode. Download logs after completion.
- **Interactive debugging**: No interactive shell or breakpoints. Debug locally first.
- **Environment creation**: Extension doesn't create or modify virtual environments.
- **Package management**: No automatic `pip install`. Pre-install all dependencies.
- **Job cancellation**: Use SLURM's `scancel` command manually if needed.
- **Resource quota checking**: Extension doesn't verify if you have permission to use requested resources.

---

## Technical Details

### Job Lifecycle

```
1. USER ACTION: Submit job via right-click or command palette
   └─> Extension: submitJob()

2. VALIDATION: Check configuration, file type, SSH keys
   └─> ConfigManager.validate()

3. JOB CREATION:
   a. Generate unique job ID (timestamp-based)
   b. Create remote directory: /scratch.hpc/<user>/hpc_jobs/<job-id>/
   └─> ClusterManager.submitJob()

4. FILE UPLOAD:
   a. Upload main script via SFTP
   b. Upload any input files
   └─> ConnectionManager.uploadFile() [with retry]

5. SCRIPT GENERATION:
   a. Determine file type → select Executor
   b. Generate SLURM header (#SBATCH directives)
   c. Add environment setup (module load, venv activation)
   d. Add execution command (executor-specific)
   e. Add metadata capture (status.json generation)
   └─> ScriptBuilder.buildScript() → ExecutorFactory

6. SLURM SUBMISSION:
   a. Execute: ssh user@host 'cd <job-dir> && sbatch job.sbatch'
   b. Parse SLURM job ID from output
   c. Store metadata locally in jobs.json
   └─> ConnectionManager.executeCommand('sbatch ...')

7. MONITORING (User-Initiated):
   a. Query SLURM: squeue -j <slurm-id>
   b. If not in queue, read status.json from remote
   c. Update local jobs.json
   └─> ClusterManager.getJobStatus()

8. COMPLETION:
   a. Script writes status.json with exit code, runtime, outputs
   b. SLURM writes stdout/stderr to slurm-*.out/err
   c. User downloads results via extension
   └─> ClusterManager.fetchResults()
```

### SSH Connection Management

The extension implements robust SSH handling:

**Connection Pooling:**

- Single SSH connection is reused for multiple operations
- Connection is kept alive with periodic health checks (every 30s)
- Automatic reconnection if connection drops

**Retry Logic:**

- Failed operations retry up to 3 times
- Exponential backoff: 2s, 4s, 8s delays between retries
- Random jitter (±25%) to prevent thundering herd
- Authentication errors don't retry (fail fast)

**Timeout Handling:**

- Connection timeout: 30 seconds
- Command timeout: 60 seconds (configurable per operation)
- Upload/download timeouts scale with file size

**Error Detection:**

- Connection health checks every 30 seconds
- Automatic cleanup of dead connections
- Detailed error messages with suggestions

### Script Generation

Each job gets a custom SLURM batch script:

**Structure:**

```bash
#!/bin/bash
#SBATCH --job-name=<name>
#SBATCH --output=<path>/slurm-%j.out
#SBATCH --error=<path>/slurm-%j.err
#SBATCH --partition=<partition>
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=<cpus>
#SBATCH --gres=gpu:<gpus>
#SBATCH --mem=<memory>
#SBATCH --time=<time>

# Environment setup
export OMP_NUM_THREADS=$SLURM_CPUS_PER_TASK
source /scratch.hpc/<user>/python_venvs/<env>/bin/activate
cd /scratch.hpc/<user>/hpc_jobs/<job-id>/

# Execution (executor-specific)
START_TIME=$(date +%s)
python script.py > execution_log.txt 2> execution_errors.txt
EXIT_CODE=$?
END_TIME=$(date +%s)

# Metadata capture
cat > status.json << EOF
{
  "jobId": "<job-id>",
  "slurmId": "$SLURM_JOB_ID",
  "status": "$JOB_STATUS",
  "exitCode": $EXIT_CODE,
  "duration": $((END_TIME - START_TIME)),
  "node": "$(hostname)",
  ...
}
EOF
```

**Executor-Specific Behavior:**

| File Type  | Execution Command                                        | Notes                     |
| ---------- | -------------------------------------------------------- | ------------------------- |
| `.py`    | `python script.py`                                     | Standard Python execution |
| `.ipynb` | `jupyter nbconvert --execute --inplace notebook.ipynb` | Outputs saved in notebook |
| `.c`     | `gcc -O2 -fopenmp script.c -o program && ./program`    | Compilation + execution   |
| `.cpp`   | `g++ -O2 -fopenmp script.cpp -o program && ./program`  | Compilation + execution   |

---

## Troubleshooting

### 1. Connection Issues

**1.1 Problem**: "SSH connection failed"

**Solutions**:

1. Verify SSH keys are in `~/.ssh/` and properly named
2. Test manual SSH: `ssh -v user@host`
3. Check if VPN is required and connected
4. Verify SSH config: `~/.ssh/config`
5. Check extension logs: `.vscode/.hpc-connector/logs/extension.log`

**1.2 Problem**: "Authentication failed"

**Solutions**:

1. SSH keys must be passwordless (or in ssh-agent)
2. Verify key is authorized: check `~/.ssh/authorized_keys` on cluster
3. Try: `ssh-add ~/.ssh/id_ed25519`

### 2. Job Submission Issues

**2.1 Problem**: "Configuration incomplete"

**Solution**: Run "HPC: Configure Connection" first

**2.2 Problem**: "Python environment not specified"

**Solution**: Ensure the virtual environment exists on the cluster in `/scratch.hpc/<user>/python_venvs/`

**2.3 Problem**: "Job fails immediately"

**Solutions**:

1. Download results and check `execution_errors.txt`
2. Verify Python packages are installed in the venv
3. Check SLURM logs (`slurm-*.err`)
4. Test the script locally first

### 3. Job Monitoring Issues

**3.1 Problem**: Job status shows "UNKNOWN"

**Solutions**:

1. Job may have completed before extension checked
2. Check `status.json` manually on cluster
3. Verify SLURM job ID in jobs.json matches cluster

**3.2 Problem**: Can't see job in "View Active Jobs"

**Solutions**:

1. Job may have completed very quickly
2. Check "View Completed Jobs"
3. Verify SLURM partition has resources available

### 4. Result Download Issues

**4.1 Problem**: "Download failed"

**Solutions**:

1. Check SSH connection
2. Verify job directory exists on cluster
3. Check permissions on remote directory
4. Try manual SFTP: `sftp user@host`

---

## Development

### Building from Source

```bash
# Clone repository
git clone <repository-url>
cd hpc-connector

# Install dependencies
npm install

# Development mode (opens Extension Development Host)
# Press F5 in VSCode or:
npm run watch

# Package extension
npx vsce package

# Install locally
code --install-extension hpc-connector-1.0.0.vsix
```

### Project Structure

```
hpc-connector/
├── extension.js             # Extension entry point
├── package.json             # Manifest and dependencies
├── src/
|   ├── clusterManager.js    # Job orchestration
│   ├── connectionManager.js # SSH handling
│   ├── configManager.js     # Settings management
│   ├── storageManager.js    # Local persistence
│   ├── scriptBuilder.js     # SLURM script generation
│   ├── uiManager.js         # VSCode UI
│   ├── logger.js            # Logging
│   ├── safetyManager.js     # Security validation
│   └── executors/
│       ├── baseExecutor.js
│       ├── pythonExecutor.js
│       ├── cppExecutor.js
│       └── executorFactory.js
```

### Testing

The extension uses VSCode's Extension Development Host for testing:

1. Open project in VSCode
2. Press `F5` to launch Extension Development Host
3. A new VSCode window opens with the extension loaded
4. Test all commands in this window
5. View logs in the Debug Console

### Logging

Logs are written to `.vscode/.hpc-connector/logs/extension.log`:

```javascript
const logger = getLogger();
logger.info('Normal operation');
logger.warn('Warning message');
logger.error('Error occurred');
logger.debug('Detailed debug info');
```

Enable verbose logging in Developer Console:

- `Cmd+Shift+P` → "Developer: Toggle Developer Tools"
- Check Console tab for `[StorageManager]`, `[ConnectionManager]` logs

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

For issues, questions, or contributions:

- Check the [Troubleshooting](#troubleshooting) section
- Review logs in `.vscode/.hpc-connector/logs/extension.log`
- Verify manual SSH access works: `ssh user@cluster`

---

**Built with ❤️ for the HPC community**
