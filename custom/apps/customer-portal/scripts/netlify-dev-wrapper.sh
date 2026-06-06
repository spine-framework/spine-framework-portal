#!/usr/bin/env bash

# Netlify Dev Wrapper - Start dev server for Spine.
# 
# Purpose: Execute Vite directly to avoid npx/npm indirection issues under Netlify CLI.
# - Called by: netlify dev (via netlify.toml [dev].command)
# - .framework/ is the working core directory
# 
# Integration: Part of the development workflow, bridges Netlify CLI and Vite.
# 
# Dependencies: vite, netlify CLI

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Starting Netlify dev for Spine..."

# Start Vite dev server directly (.assembled/src is now the root)
echo "  Starting Vite on port 3001..."
exec "$PROJECT_ROOT/node_modules/.bin/vite" --config "$PROJECT_ROOT/config/vite.config.ts"
