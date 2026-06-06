#!/bin/bash
#
# Boundary Check Script
#
# Prevents Core→Custom violations by blocking PRs that import custom code
# into the core framework. This enforces the architectural boundary where
# Core provides mechanism and Custom provides data.
#
# Usage: ./scripts/boundary-check.sh
# Exit code: 0 if clean, 1 if violations found
#

set -e

echo "🔍 Checking Core→Custom boundary violations..."
echo ""

VIOLATIONS=0

# Check 1: Core importing from custom/ directory
echo "1. Checking for imports from custom/ in core..."
if grep -r "from.*custom/\|import.*@custom" .framework/ --include="*.ts" --include="*.tsx" --exclude-dir=tests 2>/dev/null; then
    echo "   ❌ FAIL: Core files import from custom/"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: No custom/ imports in core"
fi
echo ""

# Check 2: Core importing custom_ prefixed modules
echo "2. Checking for custom_ module imports in core..."
if grep -r "from.*custom_\|import.*custom_" .framework/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
    echo "   ❌ FAIL: Core files import custom_ modules"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: No custom_ imports in core"
fi
echo ""

# Check 2b: Custom apps using relative paths to .framework/ (should use @core alias instead)
echo "2b. Checking custom apps use @core alias (not relative paths to .framework/)..."
if grep -r "from.*\.\./.*\.framework\|from.*\.framework/" custom/ --include="*.ts" --include="*.tsx" 2>/dev/null; then
    echo "   ❌ FAIL: Custom apps use relative paths to .framework/ — use @core alias instead"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: Custom apps use @core alias correctly"
fi
echo ""

# Check 3: App-specific references in core
echo "3. Checking for app-specific references in core..."
APP_REFS=$(grep -r "cortex\|funnel\|support-triage\|kb-chunker\|portal-signals" .framework/src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "manifest.json\|webhook-registry" || true)
if [ -n "$APP_REFS" ]; then
    echo "   ❌ FAIL: App-specific references found in core:"
    echo "$APP_REFS"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: No app-specific references in core"
fi
echo ""

# Check 4: Verify manifest files exist for custom apps
echo "4. Checking custom apps have manifest.json..."
MANIFEST_COUNT=$(find custom/apps -name "manifest.json" | wc -l)
if [ "$MANIFEST_COUNT" -eq 0 ]; then
    echo "   ⚠️  WARNING: No manifest.json files found in custom/apps/"
else
    echo "   ✅ PASS: $MANIFEST_COUNT manifest.json files found"
    find custom/apps -name "manifest.json" | while read -r manifest; do
        echo "      - $manifest"
    done
fi
echo ""

# Check 5: Verify webhook registry is used (not static imports)
echo "5. Checking integration-routes uses dynamic registry..."
if grep -q "webhookHandlers\|custom_webhook-handlers" .framework/functions/integration-routes.ts 2>/dev/null; then
    echo "   ❌ FAIL: integration-routes still uses static imports"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: integration-routes uses dynamic registry"
fi
echo ""

# Check 6: Sidebar components should not be in core
echo "6. Checking app-specific components removed from core..."
if [ -d ".framework/src/components/cortex" ] || [ -d ".framework/src/components/crm" ]; then
    echo "   ❌ FAIL: App-specific component directories still exist in core"
    ls -la .framework/src/components/ | grep -E "cortex|crm" || true
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "   ✅ PASS: App-specific component directories removed from core"
fi
echo ""

# Summary
echo "========================================"
if [ $VIOLATIONS -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED"
    echo "Core→Custom boundary is clean."
    exit 0
else
    echo "❌ $VIOLATIONS VIOLATION(S) FOUND"
    echo "Fix violations before merging."
    exit 1
fi
