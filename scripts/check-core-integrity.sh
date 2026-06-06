#!/usr/bin/env bash

/**
 * @module scripts/check-core-integrity
 * @audience installer
 * @layer build
 * @stability stable
 *
 * V2 Core Integrity Checker - Verify v2-core hasn't been modified.
 * 
 * **Purpose**: Check v2-core directory integrity against stored manifest.
 * - Compares current source and functions hashes with stored values
 * - Used to detect unauthorized modifications to core framework
 * 
 * **Process**: 
 * 1. Check for manifest file existence
 * 2. Calculate current hashes for src and functions
 * 3. Compare with stored manifest values
 * 4. Report any mismatches
 * 
 * **Dependencies**: find, sha256sum, .spine-manifest.json
 * 
 * @tags build, integrity, verification, v2-core, security
 */

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CORE_DIR="$PROJECT_ROOT/.framework"
MANIFEST_FILE="$CORE_DIR/.spine-manifest.json"

echo "Checking .framework integrity..."

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "  ERROR: Manifest file not found at $MANIFEST_FILE"
  exit 1
fi

// ─── CHUNK_START: CHECK_CORE_INTEGRITY_MAIN ──────────────────────────────────────────────
/**
 * @chunk-id    CHECK_CORE_INTEGRITY_MAIN_1_0_0
 * @version     1.0.0
 * @hash        3799437312b1f95c807f0862818bf01651792c0d5e2bb81d91d734251a76fc75
 * @macro       Core Integrity Verification
 * @micro       Calculate and compare v2-core file hashes against manifest
 * @inputs      $MANIFEST_FILE: string — Path to .spine-manifest.json
 * @outputs     exit code — 0 for pass, 1 for failure
 * @depends-on  [find, sha256sum, jq/grep, .spine-manifest.json]
 * @depended-by [CI/CD pipelines, pre-deploy hooks]
 * @side-effects [console output, exit with status code]
 * @tags        integrity, verification, security, v2-core
 */
# Calculate current hashes
CURRENT_SRC_HASH=$(find "$CORE_DIR/src" -type f -name '*.tsx' -o -name '*.ts' -o -name '*.css' 2>/dev/null | LC_ALL=C sort | xargs cat 2>/dev/null | sha256sum | cut -d' ' -f1)
CURRENT_FUNCTIONS_HASH=$(find "$CORE_DIR/functions" -type f -name '*.ts' 2>/dev/null | LC_ALL=C sort | xargs cat 2>/dev/null | sha256sum | cut -d' ' -f1)

# Extract expected hashes from manifest (using jq if available, fallback to grep)
if command -v jq >/dev/null 2>&1; then
  EXPECTED_SRC_HASH=$(jq -r '.integrity.src' "$MANIFEST_FILE" | sed 's/sha256-//')
  EXPECTED_FUNCTIONS_HASH=$(jq -r '.integrity.functions' "$MANIFEST_FILE" | sed 's/sha256-//')
else
  EXPECTED_SRC_HASH=$(grep '"src"' "$MANIFEST_FILE" | cut -d'"' -f4 | sed 's/sha256-//')
  EXPECTED_FUNCTIONS_HASH=$(grep '"functions"' "$MANIFEST_FILE" | cut -d'"' -f4 | sed 's/sha256-//')
fi

# Check integrity
if [ "$CURRENT_SRC_HASH" = "$EXPECTED_SRC_HASH" ] && [ "$CURRENT_FUNCTIONS_HASH" = "$EXPECTED_FUNCTIONS_HASH" ]; then
  echo "  Integrity check PASSED - Core files are unchanged"
  exit 0
else
  echo "  INTEGRITY CHECK FAILED - Core files have been modified!"
  echo "  WARRANTY VOIDED - Core tampering detected"
  echo ""
  echo "  Expected src hash:    $EXPECTED_SRC_HASH"
  echo "  Current src hash:     $CURRENT_SRC_HASH"
  echo ""
  echo "  Expected functions hash: $EXPECTED_FUNCTIONS_HASH"
  echo "  Current functions hash:  $CURRENT_FUNCTIONS_HASH"
  exit 1
fi
// ─── CHUNK_END: CHECK_CORE_INTEGRITY_MAIN ────────────────────────────────────────────────
