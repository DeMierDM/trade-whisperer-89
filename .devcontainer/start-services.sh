#!/bin/bash

# 🚀 Start Services in Codespace
# This script starts all trading services after the Codespace is created

set -e

echo "🚀 Starting Trade Whisperer services in Codespace..."

# Change to workspace directory
cd /workspace

# Load development aliases
source /workspace/.devcontainer/scripts/dev-aliases.sh

# Start the trading system
/workspace/.devcontainer/scripts/start-all.sh

echo "🎉 Trade Whisperer is ready in Codespace!"