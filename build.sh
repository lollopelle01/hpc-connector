#!/bin/bash

# Script to recompile the HPC Connector extension
# Run this script from the root of the hpc-connector project

echo "=========================================="
echo "HPC Connector - Build Script v1.1.0"
echo "=========================================="

# 1. Check that we are in the correct directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found"
    echo "Run this script from the root of the hpc-connector project"
    exit 1
fi

echo "Correct directory"

# 2. Install dependencies
echo ""
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "Error during dependency installation"
    exit 1
fi

# 3. Remove the old .vsix extension
echo ""
echo "Removing old extension..."
rm -f *.vsix

# 4. Build the new extension
echo ""
echo "Building extension..."
npx @vscode/vsce package --no-dependencies

if [ $? -ne 0 ]; then
    echo "Error during build"
    exit 1
fi

# 5. Check that the .vsix file was created
VSIX_FILE=$(ls -1 *.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "Error: .vsix file not created"
    exit 1
fi

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "=========================================="
echo "Generated file: $VSIX_FILE"
echo ""
echo "To install:"
echo "1. Open VS Code"
echo "2. Extensions > ... (menu) > Install from VSIX"
echo "3. Select: $VSIX_FILE"
echo "4. Reload VS Code (Cmd+Shift+P > Developer: Reload Window)"
echo "=========================================="
