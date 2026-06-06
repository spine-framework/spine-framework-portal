# Admin UI Audit Results
_Last updated: 2026-05-11 (post-fix pass)_

## Summary Table

| Page | URL | Render | H1 | Table/Form | Errors | Status |
|------|-----|--------|-----|-----------|--------|--------|
| **CONFIGS** |
| Types (list) | /configs/types | ✅ | Types | ✅ | 0 | ✅ PASS |
| Type (detail) | /configs/types/:id | ✅ | — | form | 0 | ✅ PASS |
| Apps (list) | /configs/apps | ✅ | Apps | ✅ | 0 | ✅ PASS |
| App (detail/save) | /configs/apps/:id | ✅ | — | form | 0 | ✅ PASS (fixed) |
| Pipelines | /configs/pipelines | ✅ | Pipelines | ✅ | 0 | ✅ PASS |
| Triggers | /configs/triggers | ✅ | Triggers | ✅ | 0 | ✅ PASS |
| AI Agents | /configs/ai-agents | ✅ | AI Agents | ✅ | 0 | ✅ PASS |
| Embeddings | /configs/embeddings | ✅ | Embeddings | ✅ | 0 | ✅ PASS |
| Timers | /configs/timers | ✅ | Timers | ✅ | 0 | ✅ PASS |
| Integrations | /configs/integrations | ✅ | Integrations | ✅ | 0 | ✅ PASS |
| Roles | /configs/roles | ✅ | Roles | ✅ | 0 | ✅ PASS |
| Prompts | /configs/prompts | ✅ | Prompts | ✅ | 0 | ✅ PASS |
| API Keys | /configs/api-keys | ✅ | API Keys | ✅ | 0 | ✅ PASS |
| **RUNTIME** |
| Items | /runtime/items | ✅ | Items | ✅ | 0 | ✅ PASS (fixed) |
| Accounts | /runtime/accounts | ✅ | Accounts | ✅ | 0 | ✅ PASS |
| People | /runtime/people | ✅ | People | ✅ | 0 | ✅ PASS |
| Threads | /runtime/threads | ✅ | Threads | ✅ | 0 | ✅ PASS |
| Messages | /runtime/messages | ✅ | Messages | ✅ | 0 | ✅ PASS |
| Attachments | /runtime/attachments | ✅ | Attachments | — (empty) | 0 | ✅ PASS |
| Watchers | /runtime/watchers | ✅ | Watchers | — (empty) | 0 | ✅ PASS |
| Links | /runtime/links | ✅ | Links | — (empty) | 0 | ✅ PASS |
| **OBSERVABILITY** |
| Dashboard | /observability | ✅ | Observability Dashboard | charts | 0 | ✅ PASS (fixed) |
| Alerts | /observability/alerts | ✅ | Alerts | ✅ | 0 | ✅ PASS |
| Executions | /observability/executions | ✅ | Pipeline Executions | ✅ | 0 | ✅ PASS (fixed) |
| Logs | /observability/logs | ✅ | System Logs | ✅ | 0 | ✅ PASS (fixed) |
| **TESTING** |
| Test Runs | /testing | ✅ | — | ✅ | 0 | ✅ PASS |
| Test Run Detail | /testing/:id | ✅ | — | form | 0 | ✅ PASS (fixed) |

## Final Score: 27/27 ✅ PASS (0 failures)

---

## Bugs Fixed (7 total)

### BUG-01: TypeDetailPage — false "App required" validation on ownership=System
- **Root cause:** Combobox returned capitalized `'System'` but validation checked `!== 'system'` (lowercase)
- **Fix:** `const ownership = (editData.ownership || '').toLowerCase()` before the check
- **File:** `v2-core/src/pages/admin/TypeDetailPage.tsx`

### BUG-02: AppDetailPage — 500 on save
- **Root cause 1:** `validateUpdatePermissions` called with table name `'app'` (singular) — not in SECOND_SURFACE_TABLES so fell to first-surface and failed
- **Fix 1:** Changed `'app'` → `'apps'` in `apps.ts` update handler
- **Root cause 2:** `is_public` field sent in payload but column doesn't exist on `apps` table
- **Fix 2:** Strip `is_public`, `item_count`, `user_count`, `account_name` from save payload in `AppDetailPage.tsx`
- **Files:** `v2-core/functions/apps.ts`, `v2-core/src/pages/admin/AppDetailPage.tsx`

### BUG-03: ObservabilityDashboard — legacy Heroicon crash (`ChartBarIcon`, `ExclamationTriangleIcon`, `ClockIcon`, `ArrowPathIcon`)
- **Fix:** Replaced with already-imported lucide-react equivalents: `BarChart3`, `AlertTriangle`, `Clock`, `RefreshCw`
- **File:** `v2-core/src/pages/admin/ObservabilityDashboard.tsx`

### BUG-04: PipelineExecutionsPage — legacy Heroicon crash (`BoltIcon`, `CheckCircleIcon`, `XCircleIcon`, `PlayIcon`, `ArrowPathIcon`)
- **Fix:** Replaced with already-imported lucide-react equivalents: `Zap`, `CheckCircle`, `XCircle`, `Play`, `RefreshCw`
- **File:** `v2-core/src/pages/admin/PipelineExecutionsPage.tsx`

### BUG-05: LogsPage — legacy Heroicon crash (`DocumentTextIcon`, `CalendarIcon`, `ExclamationTriangleIcon`, `UserIcon`)
- **Fix:** Replaced with already-imported lucide-react equivalents: `FileText`, `Calendar`, `AlertTriangle`, `User`
- **File:** `v2-core/src/pages/admin/LogsPage.tsx`

### BUG-06: Runtime Items — blank page ("View 'default_list' not found in design_schema")
- **Root cause:** `useListSchema` throws when the types fallback query returns no results (item type is pack-owned, RLS-hidden). Also threw when schema existed but view key was missing.
- **Fix:** Both error paths now fall back to a minimal default schema instead of throwing
- **File:** `v2-core/src/hooks/useListSchema.ts`

### BUG-07: TestRunDetailPage — crash on load (lazy import)
- **Root cause:** `lazy(() => import('...TestRunDetailPage'))` requires a default export; the file only has a named export
- **Fix:** Added `.then(m => ({ default: m.TestRunDetailPage }))` to the lazy import
- **File:** `v2-core/src/apps/admin/index.tsx`

### MINOR-01: Runtime page headings lowercase
- **Fix:** Capitalized entity name in `DataHeader` title: `entity.charAt(0).toUpperCase() + entity.slice(1)`
- **File:** `v2-core/src/components/runtime/DataListPage.tsx`
