#!/usr/bin/env bash

# Assembly Orchestrator - Assemble .framework + custom into .assembled/
# 
# Purpose: Main assembly script that orchestrates the complete build process.
# - Calls frontend and functions assembly scripts
# - Removes stale dist/ to prevent Netlify CLI conflicts
# - Coordinates multi-step assembly process
# 
# Process: 
# 1. Clean dist/ directory
# 2. Assemble functions to .assembled/netlify/functions/
# 3. Assemble frontend to .assembled/src/
# 
# Dependencies: assemble-functions.sh, assemble-frontend.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Assembling Spine..."

# Remove stale dist/ so Netlify CLI never reads its _redirects during dev
rm -rf "$PROJECT_ROOT/dist"

# Step 1: Assemble functions
echo "Assembling functions..."
bash "$SCRIPT_DIR/assemble-functions.sh"

# Step 2: Assemble frontend
echo "Assembling frontend..."
bash "$SCRIPT_DIR/assemble-frontend.sh"

echo "Spine assembly complete"
