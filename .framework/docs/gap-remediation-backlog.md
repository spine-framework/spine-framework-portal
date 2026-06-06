# Gap Remediation Backlog

## Priority 1: Critical v2-Incompatible Endpoints

### 1. Quarantine v2-Incompatible Endpoints
**Files to quarantine:**
- `ai-orchestrator.ts` - References non-existent `ai_orchestrator` table
- `pending-actions.ts` - References non-existent `pending_actions` table
- `apps-accounts.ts` - References non-existent `apps_accounts` table
- `apps-integrations.ts` - References non-existent `apps_integrations` table
- `impersonation.ts` - References non-existent impersonation tables
- `integration-health.ts` - References non-existent integration log tables
- `thread-participants.ts` - References non-existent `thread_participants` table
- `outbox.ts` - References non-existent `outbox` table
- `webhooks.ts` - References non-existent `webhooks` table

**Action:**
1. Move these files to `v2-core/functions/_quarantine/` directory
2. Update any routing that might call these endpoints
3. Document what functionality needs replacement

## Priority 2: UI Adoption Issues

### 2. Fix TimersPage Mock Data
**Issue:** TimersPage uses mock data instead of calling timers.ts API
**File:** `v2-core/src/pages/admin/TimersPage.tsx`
**Action:** Replace mock data with `apiFetch('/.netlify/functions/timers')`

## Priority 3: API Standardization

### 3. Add Role Guards to Config Endpoints
**Files to update:**
- `types.ts` - Admin-only for create/update/delete
- `apps.ts` - Admin-only for create/update/delete
- `pipelines.ts` - Admin-only for create/update/delete
- `triggers.ts` - Admin-only for create/update/delete
- `ai-agents.ts` - Admin-only for create/update/delete
- `embeddings.ts` - Admin-only for create/update/delete
- `timers.ts` - Admin-only for create/update/delete
- `integrations.ts` - Admin-only for create/update/delete
- `prompt-configs.ts` - Admin-only for create/update/delete
- `roles.ts` - Admin-only for create/update/delete

**Action:** Add `requireAuth` middleware to all config mutation endpoints

### 4. Verify Soft Delete Implementation
**Files to check:**
- All endpoints should use `is_active=false` for delete
- Ensure `updated_at` is set on soft delete
- Verify audit logging before soft delete

## Priority 4: Documentation

### 5. Add Inline API Documentation
**All endpoint files need:**
- Purpose and domain documentation
- Auth requirements
- Account scoping rules
- Request/response contracts
- Soft delete behavior
- v2 table dependencies

### 6. Generate API Reference Docs
**Create files in `v2-core/docs/apis/`:**
- `admin-data.md`
- `admin-configs.md`
- `runtime.md`
- `internal.md`
- `index.md` (top-level)

## Implementation Order

### Phase 1: Critical Fixes (Immediate)
1. Quarantine v2-incompatible endpoints
2. Fix TimersPage mock data issue

### Phase 2: Security & Standards (High)
1. Add role guards to config endpoints
2. Verify soft delete implementation
3. Add basic inline documentation

### Phase 3: Documentation (Medium)
1. Complete inline documentation for all endpoints
2. Generate split API reference docs
3. Create top-level index

### Phase 4: Verification (Low)
1. Verify UI adoption for all completed APIs
2. Final compliance check against API rulebook

## Success Criteria

- [ ] No v2-incompatible endpoints in active routing
- [ ] All admin UIs use proper APIs (no mock data)
- [ ] All config endpoints have admin-only role guards
- [ ] All endpoints use soft delete correctly
- [ ] All endpoints have inline documentation
- [ ] API reference docs generated and indexed
- [ ] UI adoption verified for all APIs

## Blocked Items

None currently identified.
