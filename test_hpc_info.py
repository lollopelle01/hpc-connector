#!/usr/bin/env python3
"""
HPC System Information Script
Tests HPC connector and provides detailed system info
"""

import sys
import os
import platform
import subprocess
import time
from datetime import datetime

def run_command(cmd):
    """Execute shell command and return output"""
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=10
        )
        return result.stdout.strip()
    except Exception as e:
        return f"Error: {str(e)}"

def print_section(title):
    """Print section header"""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def main():
    print("HPC SYSTEM INFORMATION REPORT")
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # ===== PYTHON INFO =====
    print_section("PYTHON ENVIRONMENT")
    print(f"Python Version: {sys.version}")
    print(f"Python Executable: {sys.executable}")
    print(f"Python Path: {sys.prefix}")
    
    # Virtual environment detection
    venv = os.environ.get('VIRTUAL_ENV', 'None')
    print(f"Virtual Environment: {venv}")
    
    # ===== SYSTEM INFO =====
    print_section("SYSTEM INFORMATION")
    print(f"Platform: {platform.platform()}")
    print(f"System: {platform.system()}")
    print(f"Release: {platform.release()}")
    print(f"Machine: {platform.machine()}")
    print(f"Processor: {platform.processor()}")
    print(f"Hostname: {platform.node()}")
    
    # ===== CPU INFO =====
    print_section("CPU INFORMATION")
    
    # CPU count
    try:
        import multiprocessing
        print(f"CPU Count (logical): {multiprocessing.cpu_count()}")
    except:
        print("CPU Count: Unable to determine")
    
    # Detailed CPU info from /proc/cpuinfo (Linux)
    cpu_info = run_command("lscpu | grep -E 'Model name|Socket|Core|Thread|CPU MHz'")
    if cpu_info and "Error" not in cpu_info:
        print("\nCPU Details:")
        print(cpu_info)
    
    # CPU load
    try:
        load_avg = os.getloadavg()
        print(f"\nLoad Average (1m, 5m, 15m): {load_avg[0]:.2f}, {load_avg[1]:.2f}, {load_avg[2]:.2f}")
    except:
        pass
    
    # ===== MEMORY INFO =====
    print_section("MEMORY INFORMATION")
    
    mem_info = run_command("free -h | grep -E 'Mem|Swap'")
    if mem_info and "Error" not in mem_info:
        print(mem_info)
    else:
        # Alternative method
        try:
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    if 'MemTotal' in line or 'MemAvailable' in line:
                        print(line.strip())
        except:
            print("Memory info not available")
    
    # ===== GPU INFO =====
    print_section("GPU INFORMATION")
    
    # Check for NVIDIA GPUs
    nvidia_smi = run_command("nvidia-smi --query-gpu=index,name,driver_version,memory.total --format=csv,noheader")
    if nvidia_smi and "Error" not in nvidia_smi and nvidia_smi:
        print("NVIDIA GPUs detected:")
        print(nvidia_smi)
        
        # GPU utilization
        print("\nGPU Utilization:")
        gpu_util = run_command("nvidia-smi --query-gpu=index,utilization.gpu,utilization.memory,temperature.gpu --format=csv,noheader")
        print(gpu_util)
    else:
        print("No NVIDIA GPUs detected or nvidia-smi not available")
    
    # Check CUDA environment variables
    cuda_home = os.environ.get('CUDA_HOME', 'Not set')
    cuda_visible = os.environ.get('CUDA_VISIBLE_DEVICES', 'Not set')
    print(f"\nCUDA_HOME: {cuda_home}")
    print(f"CUDA_VISIBLE_DEVICES: {cuda_visible}")
    
    # ===== SLURM INFO =====
    print_section("SLURM JOB INFORMATION")
    
    slurm_vars = [
        'SLURM_JOB_ID',
        'SLURM_JOB_NAME',
        'SLURM_JOB_NODELIST',
        'SLURM_JOB_PARTITION',
        'SLURM_CPUS_PER_TASK',
        'SLURM_CPUS_ON_NODE',
        'SLURM_MEM_PER_NODE',
        'SLURM_GPUS',
        'SLURM_SUBMIT_DIR',
    ]
    
    for var in slurm_vars:
        value = os.environ.get(var, 'Not set')
        print(f"{var}: {value}")
    
    # ===== STORAGE INFO =====
    print_section("STORAGE INFORMATION")
    
    # Current directory
    print(f"Current Directory: {os.getcwd()}")
    
    # Disk usage of current directory
    disk_usage = run_command("df -h . | tail -1")
    if disk_usage and "Error" not in disk_usage:
        print(f"\nDisk Usage (current location):")
        print(disk_usage)
    
    # Home directory
    print(f"\nHome Directory: {os.path.expanduser('~')}")
    
    # ===== NETWORK INFO =====
    print_section("NETWORK INFORMATION")
    
    # Hostname and IP
    hostname = run_command("hostname -f")
    print(f"FQDN: {hostname}")
    
    ip_addr = run_command("hostname -I | awk '{print $1}'")
    print(f"IP Address: {ip_addr}")
    
    # ===== ENVIRONMENT MODULES =====
    print_section("LOADED MODULES")
    
    modules = run_command("module list 2>&1")
    if modules and "Error" not in modules:
        print(modules)
    else:
        print("Module system not available or no modules loaded")
    
    # ===== PYTHON PACKAGES =====
    print_section("KEY PYTHON PACKAGES")
    
    packages_to_check = [
        'numpy',
        'scipy',
        'pandas',
        'matplotlib',
        'torch',
        'tensorflow',
        'jax',
        'sklearn',
    ]
    
    print("Checking installed packages...")
    for package in packages_to_check:
        try:
            mod = __import__(package)
            version = getattr(mod, '__version__', 'unknown')
            print(f"  ✓ {package}: {version}")
        except ImportError:
            print(f"  ✗ {package}: not installed")
    
    # ===== TIMING TEST =====
    print_section("PERFORMANCE TEST")
    
    print("Running 5-second computation test...")
    start_time = time.time()
    
    # Simple computation test
    result = 0
    for i in range(10_000_000):
        result += i ** 0.5
    
    elapsed = time.time() - start_time
    print(f"Computation completed in {elapsed:.3f} seconds")
    print(f"Result checksum: {result:.2e}")
    
    # ===== SUMMARY =====
    print_section("JOB COMPLETION")
    print("✓ System information collection completed successfully")
    print(f"✓ Script executed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"✓ Total runtime: {time.time() - time.time():.2f} seconds")
    
    return 0

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"ERROR: Script failed with exception:")
        print(f"{type(e).__name__}: {str(e)}")
        print(f"{'='*60}")
        sys.exit(1)
