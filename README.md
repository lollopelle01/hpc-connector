# HPC Connector

A Visual Studio Code extension for submitting and managing computational jobs on SLURM-based HPC clusters via SSH.

[![VSCode](https://img.shields.io/badge/VSCode-1.85.0+-blue.svg)](https://code.visualstudio.com/)
[![Node](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)

## ⚠️ Disclaimer

**This project was developed for educational purposes only** to support university coursework and learning about HPC systems. It may contain bugs, incomplete features, or security issues. Use at your own risk.

**Known Limitations:**
- ✅ **Tested**: Python (.py), Jupyter Notebooks (.ipynb), C (.c), C++ (.cpp)
- ⚠️ **Not yet tested**: CUDA (.cu) files and CMake projects - these features are implemented but have not been validated
- This extension does NOT create Python virtual environments or install packages on the cluster
- SSH key-based authentication must be configured manually
- The extension assumes specific directory structures on the target cluster

**Not recommended for production use.** Always test thoroughly in your environment before relying on this tool for important work.

## Features

- **One-Click Job Submission**: Right-click any Python, Jupyter Notebook, C, or C++ file to submit it to the cluster
- **SLURM Integration**: Automatic generation of SLURM batch scripts with resource specifications
- **Job Monitoring**: Track active and completed jobs with real-time status updates
- **Result Management**: Download job outputs and logs with a single command
- **Multi-Language Support**: Python scripts, Jupyter notebooks, C/C++/CUDA programs, CMake projects

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

1. **SSH Access**: You must be able to SSH into the cluster manually
2. **SLURM Scheduler**: The cluster must use SLURM for job scheduling
3. **Python Virtual Environments** (for Python jobs):
   - Must be pre-created in `/scratch.hpc/<username>/python_venvs/`
   - Each venv must have required packages installed (jupyter, nbconvert, etc.)
4. **Directory Structure**: The extension will create directories in `/scratch.hpc/<username>/` but you must have write permissions there

## Installation

### Method 1: From Release (Recommended)

1. Download the latest `hpc-connector-X.X.X.vsix` file from releases
2. Open VS Code
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type "Extensions: Install from VSIX..."
5. Select the downloaded `.vsix` file
6. Reload VS Code

### Method 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/hpc-connector.git
cd hpc-connector

# Build the extension
chmod +x build.sh
./build.sh

# Install the generated .vsix
# In VS Code: Extensions > ... > Install from VSIX > select hpc-connector-1.1.0.vsix
```

## Quick Start

1. **Configure connection**: `Cmd+Shift+P` → "HPC: Configure Connection"
   - Enter cluster hostname, username, and SSH port
2. **Submit a job**: Right-click any supported file → "HPC: Submit Current File"
   - Configure resources (GPUs, CPUs, memory, time)
   - Select optional input files to upload
3. **Monitor jobs**: `Cmd+Shift+P` → "HPC: View Jobs"
   - View active jobs (queued or running)
   - View completed jobs
   - Download results
   - Clean remote files

## Supported File Types

| File Type | Status | Notes |
|-----------|--------|-------|
| Python (`.py`) | ✅ Tested | Requires Python venv on cluster |
| Jupyter (`.ipynb`) | ✅ Tested | Requires jupyter, nbconvert in venv |
| C (`.c`) | ✅ Tested | Compiled with gcc |
| C++ (`.cpp`) | ✅ Tested | Compiled with g++ |
| CUDA (`.cu`) | ⚠️ Untested | Implemented but not validated |
| CMake (`CMakeLists.txt`) | ⚠️ Untested | Implemented but not validated |

## Configuration

Open VS Code Settings (`Cmd+,`) and search for "HPC Connector":

| Setting | Description | Default |
|---------|-------------|---------|
| `hpc-connector.clusterHost` | HPC cluster hostname | `""` |
| `hpc-connector.username` | SSH username | `""` |
| `hpc-connector.sshPort` | SSH port number | `22` |
| `hpc-connector.pythonEnv` | Default Python virtual environment | `base_env` |
| `hpc-connector.defaultPartition` | Default SLURM partition | `l40` |
| `hpc-connector.defaultGPUs` | Default number of GPUs | `1` |
| `hpc-connector.defaultCPUs` | Default number of CPUs | `4` |
| `hpc-connector.defaultMemory` | Default memory allocation | `16G` |
| `hpc-connector.defaultTime` | Default time limit (HH:MM:SS) | `02:00:00` |

## Architecture

### Local Storage

Job metadata is stored in your workspace:

```
<workspace-root>/
└── .vscode/
    └── .hpc-connector/
        ├── jobs.json           # Job metadata
        ├── logs/
        │   └── extension.log   # Extension logs
        └── results/
            └── <job-id>/       # Downloaded results
```

### Remote Structure

On the cluster:

```
/scratch.hpc/<username>/
├── python_venvs/              # Python environments (you create these)
│   └── base_env/
└── hpc_jobs/                  # Job directories (extension creates)
    └── <job-id>/
        ├── job.sbatch         # SLURM script
        ├── script.py          # Your script
        ├── slurm-*.out        # SLURM stdout
        ├── slurm-*.err        # SLURM stderr
        └── status.json        # Job metadata
```

## Technical Details

### Job Lifecycle

1. Extension validates configuration and file type
2. Creates unique job directory on cluster
3. Uploads script and input files via SFTP
4. Generates SLURM batch script with proper directives
5. Submits job via `sbatch` command
6. Monitors status via `squeue` and `status.json`
7. Downloads results on request

### SSH Connection Management

- Single SSH connection reused for multiple operations
- Automatic retry with exponential backoff (up to 3 attempts)
- Connection keepalive every 30 seconds
- 30s connection timeout, 60s command timeout

### Script Generation

Each job gets a custom SLURM script that:
- Sets up environment (modules, venvs)
- Executes the code with proper compiler flags (for C/C++)
- Captures stdout/stderr to separate files
- Writes job metadata to `status.json` (no longer requires `jq`)
- Reports execution time and exit code

## Troubleshooting

### "SSH connection failed"

1. Test manual SSH: `ssh user@cluster`
2. Verify SSH keys in `~/.ssh/`
3. Check if VPN is required
4. Review logs: `.vscode/.hpc-connector/logs/extension.log`

### "Job fails immediately"

1. Download results and check `execution_errors.txt`
2. Verify packages installed in Python venv
3. Test script locally first
4. Check SLURM logs (`slurm-*.err`)

### Job shows "UNKNOWN" status

1. Job may have completed before checking
2. Check "View Completed Jobs"
3. Manually verify `status.json` on cluster

## Development

### Building

```bash
# Install dependencies
npm install

# Package extension
./build.sh

# The build script creates hpc-connector-X.X.X.vsix
```

### Debugging

For development, open the project in VS Code and press `F5` to launch the Extension Development Host. This opens a new VS Code window with the extension loaded for testing.

The `.vscode/launch.json` file is included for this purpose but is **not required** for normal usage - it's only needed if you want to debug or develop the extension.

## Project Structure

```
hpc-connector/
├── extension.js              # Extension entry point
├── package.json              # Extension manifest
├── build.sh                  # Build script
├── src/
│   ├── clusterManager.js     # Job orchestration
│   ├── connectionManager.js  # SSH handling
│   ├── configManager.js      # Settings
│   ├── storageManager.js     # Local persistence
│   ├── scriptBuilder.js      # SLURM script generation
│   ├── uiManager.js          # VS Code UI
│   ├── logger.js             # Logging
│   ├── safetyManager.js      # Security validation
│   └── executors/            # Language-specific executors
│       ├── baseExecutor.js
│       ├── pythonExecutor.js
│       ├── cppExecutor.js
│       ├── cudaExecutor.js
│       └── executorFactory.js
└── .vscode/
    └── launch.json           # Debug configuration (optional)
```

## License

MIT License

## Support

This is an educational project with no official support. For issues:
- Check the Troubleshooting section above
- Review extension logs in `.vscode/.hpc-connector/logs/extension.log`
- Verify manual SSH access works before reporting issues

---

**Built for educational purposes at the University of Bologna**
