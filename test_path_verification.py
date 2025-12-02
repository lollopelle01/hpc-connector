#!/usr/bin/env python3
"""
Quick path verification script
"""
import os
import sys

print("=" * 60)
print("PATH VERIFICATION TEST")
print("=" * 60)

# Current directory
cwd = os.getcwd()
print(f"\nCurrent Working Directory: {cwd}")

# Check if we're in the right place
if "/scratch.hpc/" in cwd and "@" not in cwd:
    print("✅ Path looks correct! (no @ symbol in path)")
    
    # Extract username from path
    path_parts = cwd.split('/')
    if len(path_parts) >= 3:
        username = path_parts[2]
        print(f"✅ Detected username: {username}")
else:
    print("❌ WARNING: Path might be incorrect!")
    if "@" in cwd:
        print("   → Found @ symbol in path - this is the bug!")

# SLURM info
slurm_job_id = os.environ.get('SLURM_JOB_ID', 'N/A')
slurm_submit_dir = os.environ.get('SLURM_SUBMIT_DIR', 'N/A')

print(f"\nSLURM Job ID: {slurm_job_id}")
print(f"SLURM Submit Dir: {slurm_submit_dir}")

# List files in current directory
print("\nFiles in current directory:")
for item in os.listdir('.'):
    print(f"  - {item}")

print("\n" + "=" * 60)
print("TEST COMPLETED")
print("=" * 60)

sys.exit(0)
