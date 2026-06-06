#!/usr/bin/env bash

# Functions Assembly - Merge .framework + custom functions into .assembled/
# 
# Purpose: Create unified functions directory for Netlify deployment.
# - .framework/functions are the canonical Spine runtime
# - custom/functions are your custom extensions
# - Netlify requires a single functions directory, so we assemble at build time
# 
# Process: 
# 1. Assemble into temp directory first (prevents Netlify observing half-deleted dir)
# 2. Copy core functions
# 3. Overlay custom functions (overwrites existing)
# 4. Atomic move to target directory
# 
# Dependencies: standard bash utilities, find, cp, rsync, mv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

CORE_DIR="$PROJECT_ROOT/.framework/functions"
CUSTOM_DIR="$PROJECT_ROOT/custom"
TARGET_DIR="$PROJECT_ROOT/.assembled/netlify/functions"
TMP_DIR="$PROJECT_ROOT/.functions-assemble-tmp"

echo "🔧 Assembling functions → $TARGET_DIR"

# 1. Assemble into a temp directory first so Netlify never observes a half-deleted functions dir
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# 2. Copy core functions (base layer), excluding _quarantine and test files
if [ -d "$CORE_DIR" ]; then
  # Copy all files except _quarantine directory and test files (*-test.ts, *.test.ts)
  find "$CORE_DIR" -maxdepth 1 -name '*.ts' ! -name '*-test.ts' ! -name '*.test.ts' -exec cp {} "$TMP_DIR"/ \;
  # Copy subdirectories except _quarantine
  find "$CORE_DIR" -maxdepth 1 -mindepth 1 -type d ! -name '_quarantine' -exec cp -r {} "$TMP_DIR"/ \;
  echo "  ✓ Core: $(find "$CORE_DIR" -name '*.ts' | grep -v '_quarantine' | grep -v '\-test\.ts$' | grep -v '\.test\.ts$' | wc -l | tr -d ' ') files"
fi

# 3. Overlay custom functions (overrides + additions), excluding test files
CUSTOM_COUNT=0
if [ -d "$CUSTOM_DIR/functions" ]; then
  # Copy all files except test files (*-test.ts, *.test.ts)
  find "$CUSTOM_DIR/functions" -maxdepth 1 -name '*.ts' ! -name '*-test.ts' ! -name '*.test.ts' -exec cp {} "$TMP_DIR"/ \; 2>/dev/null || true
  # Copy subdirectories if any
  find "$CUSTOM_DIR/functions" -mindepth 1 -type d -exec sh -c 'dir="$1"; base=$(basename "$dir"); mkdir -p "'"$TMP_DIR"'/$base" && cp -r "$dir"/* "'"$TMP_DIR"'/$base/"' _ {} \; 2>/dev/null || true
  CUSTOM_COUNT=$(find "$CUSTOM_DIR/functions" -name '*.ts' ! -name '*-test.ts' ! -name '*.test.ts' 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ Custom: $CUSTOM_COUNT files"
else
  echo "  ○ Custom: (empty)"
fi

# 4. Atomically swap temp into place
rm -rf "$TARGET_DIR"
mkdir -p "$(dirname "$TARGET_DIR")"
mv "$TMP_DIR" "$TARGET_DIR"

echo "  ✓ Assembled: $(find "$TARGET_DIR" -name '*.ts' ! -name '*-test.ts' ! -name '*.test.ts' | wc -l | tr -d ' ') total functions"
echo "✅ Done"
