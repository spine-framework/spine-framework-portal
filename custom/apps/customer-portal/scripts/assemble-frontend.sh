#!/usr/bin/env bash

# Frontend Assembly - Merge .framework/src + custom/apps/*/src → .assembled/src
#
# Purpose: Create unified frontend source directory for Vite build process.
# - .framework/src is the canonical Spine frontend
# - custom/apps/*/src are your application sources
# - Vite expects a single src directory, so we assemble at build time
#
# Process:
# 1. Clean target directory
# 2. Copy core src files
# 3. Overlay custom src files (overwrites existing)
#
# Dependencies: standard bash utilities, find, cp, rsync

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

CORE_SRC_DIR="$PROJECT_ROOT/.framework/src"
CUSTOM_SRC_DIR="$PROJECT_ROOT/custom/apps"
TARGET_SRC_DIR="$PROJECT_ROOT/.assembled/src"

echo "🔧 Assembling frontend → $TARGET_SRC_DIR"

# 1. Clean target (except .gitkeep if exists)
if [ -d "$TARGET_SRC_DIR" ]; then
  find "$TARGET_SRC_DIR" -mindepth 1 -not -name '.gitkeep' -delete 2>/dev/null || true
else
  mkdir -p "$TARGET_SRC_DIR"
fi

# 2. Copy core src (base layer)
if [ -d "$CORE_SRC_DIR" ]; then
  # Ensure subdirectories are copied properly
  cp -r "$CORE_SRC_DIR"/* "$TARGET_SRC_DIR"/ 2>/dev/null || true
  echo "  ✓ Core: $(find "$CORE_SRC_DIR" -name '*.tsx' -o -name '*.ts' -o -name '*.css' | wc -l | tr -d ' ') files"
else
  echo "  ⚠ Core: $CORE_SRC_DIR not found"
fi

# 4. Copy public files from .framework
if [ -f "$PROJECT_ROOT/.framework/index.html" ]; then
  # Copy and fix the script src path for assembled structure
  sed 's|/src/main.tsx|./main.tsx|g' "$PROJECT_ROOT/.framework/index.html" > "$TARGET_SRC_DIR/index.html"
  echo "  ✓ Core: index.html (paths fixed)"
fi

# 3. Copy public assets from .framework → assembled public dir (Vite serves from <root>/public)
if [ -d "$PROJECT_ROOT/.framework/public" ]; then
  mkdir -p "$TARGET_SRC_DIR/public"
  cp -r "$PROJECT_ROOT/.framework/public"/* "$TARGET_SRC_DIR/public/" 2>/dev/null || true
  echo "  ✓ Core: $(find "$PROJECT_ROOT/.framework/public" -type f | wc -l | tr -d ' ') public files"
fi

# 3.5. Copy _redirects to Vite-served directory for Netlify dev
if [ -f "$PROJECT_ROOT/.framework/public/_redirects" ]; then
  cp "$PROJECT_ROOT/.framework/public/_redirects" "$TARGET_SRC_DIR/_redirects"
  echo "  ✓ Core: _redirects copied to Vite-served directory for Netlify dev"
fi

# 6. Overlay custom src (overrides + additions)
if [ -d "$CUSTOM_SRC_DIR" ]; then
  # Copy files and subdirectories
  cp -r "$CUSTOM_SRC_DIR"/* "$TARGET_SRC_DIR"/ 2>/dev/null || true
  
  # Handle subdirectories properly
  find "$CUSTOM_SRC_DIR" -mindepth 1 -type d -exec sh -c 'dir="$1"; base=$(basename "$dir"); mkdir -p "'"$TARGET_SRC_DIR"'/$base" && cp -r "$dir"/* "'"$TARGET_SRC_DIR"'/$base/"' _ {} \; 2>/dev/null || true
  
  CUSTOM_COUNT=$(find "$CUSTOM_SRC_DIR" -name '*.tsx' -o -name '*.ts' -o -name '*.css' 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ Custom: $CUSTOM_COUNT files"
else
  echo "  ○ Custom: (empty)"
fi

echo "  ✓ Assembled: $(find "$TARGET_SRC_DIR" -name '*.tsx' -o -name '*.ts' -o -name '*.css' | wc -l | tr -d ' ') total files"
echo "✅ Done"
