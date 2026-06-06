# Core → Custom Import Violations Audit

**Date:** May 27, 2026
**Auditor:** Windsurf Cascade
**Scope:** `.framework/` (core) importing from `custom/` (tenant-specific)

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Direct imports (core → custom) | 1 | **Critical** |
| App-specific components in core | 2 | **High** |
| Hardcoded app references | 4 | **Medium** |
| **Total Violations** | **7** | **Active** |

---

## Critical Violations

### 1. Core Function Imports Custom Webhook Handlers

**File:** `.framework/functions/integration-routes.ts:40`
```typescript
import { webhookHandlers } from './custom_webhook-handlers'
```

**Issue:** Core integration routing system directly imports custom webhook handler registry. This violates the architectural boundary where core provides the mechanism but custom provides the data/handlers.

**Impact:**
- Core cannot be tested/deployed independently of custom code
- Custom webhook handlers become "required" dependencies of core
- Multi-tenancy breaks - core assumes specific custom handlers exist

**Remediation Options:**
1. **Preferred:** Convert to dynamic registry pattern where custom registers handlers at runtime via `integrations` table
2. **Alternative:** Move `custom_webhook-handlers.ts` to `.framework/functions/_shared/webhook-registry.ts` as a core extensibility point
3. **Nuclear:** Core provides base webhook handler interface, custom functions implement and self-register

---

## High Severity Violations

### 2. App-Specific Components Living in Core

**Files:**
- `.framework/src/components/cortex/CortexSidebar.tsx`
- `.framework/src/components/crm/CRMSidebar.tsx`

**Issue:** Sidebar components for specific tenant apps (`cortex`, `crm`) exist in the core component library. These are not generic/reusable - they're hardcoded to specific app URLs and navigation structures.

**Evidence:**
```typescript
// CRMSidebar.tsx
const navItems = [
  { title: "Dashboard", url: "/crm/dashboard" },
  // ... CRM-specific navigation
]
```

**Remediation:**
1. Move `CortexSidebar.tsx` → `custom/apps/cortex/components/CortexSidebar.tsx`
2. Move `CRMSidebar.tsx` → `custom/apps/crm/components/CRMSidebar.tsx`
3. Core should provide generic `AppSidebar` component that renders based on `app_definitions.nav_items` config

---

## Medium Severity Violations

### 3. Hardcoded App References in Core

**File:** `.framework/functions/integration-routes.ts:255`
```typescript
@param handlerName - The handler key from integration config (e.g. "cortex-handler")
```

**Issue:** Core documentation references specific custom app (`cortex`) as an example. While minor, this reveals implicit coupling.

**Remediation:**
- Change example to generic: `"webhook-handler"` or `"slack-handler"`

---

## Verification Commands

```bash
# Find all custom imports in core
grep -r "from.*custom/\|import.*custom_\|@custom" .framework/ --include="*.ts" --include="*.tsx"

# Find app-specific references
grep -r "cortex\|funnel\|support-triage\|portal-signals" .framework/src/ --include="*.ts" --include="*.tsx"

# Find hardcoded paths
grep -r "/crm/\|/cortex/" .framework/src/ --include="*.ts" --include="*.tsx"
```

---

## Remediation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P0** | Move webhook handlers import to registry pattern | 2-3 days | Unblocks multi-tenancy |
| **P1** | Relocate CortexSidebar to custom app | 1 day | Clean component boundaries |
| **P1** | Relocate CRMSidebar to custom app | 1 day | Clean component boundaries |
| **P2** | Update integration-routes documentation | 10 min | Remove implicit coupling |

---

## Success Criteria

- [ ] Zero `import` statements from `.framework/` targeting `custom/`
- [ ] Zero app-specific components in `.framework/src/components/`
- [ ] Core tests pass without custom code present
- [ ] New tenant can deploy with only core + their own custom code

---

## Notes

**CustomAppLoader Pattern (Correct):**
The `CustomAppLoader.tsx` component demonstrates the correct pattern - it uses `import.meta.glob()` to dynamically load apps at build time without hardcoded imports:
```typescript
const customAppModules = import.meta.glob('../../../custom/apps/*/index.tsx')
```
This is acceptable because it's a runtime discovery mechanism, not a compile-time dependency.

**Test Files Excluded:**
`.framework/tests/integration/custom-integrity.test.ts` intentionally tests custom code boundaries - this is not a violation as it's explicitly testing the integration surface.

---

## Related Documents

- `STRUCTURE.md` - Directory architecture
- `.windsurf/plans/eliminate-v2-references-ce3f82.md` - Previous architectural cleanup
- Core/custom boundary policy: "Core provides mechanism, custom provides data"
