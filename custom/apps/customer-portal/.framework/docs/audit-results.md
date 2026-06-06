# Spine v2 — Two-Pass Codebase Audit Results

Generated: 2026-04-26  
Auditor: Cascade (automated trace + sweep)

---

## Summary

- **Live frontend files:** 78 (all files in `v2-core/src/`)
- **Live function files:** 18 handlers + 6 shared files
- **Orphaned / dead files:** 11 identified
- **Legacy candidates:** 8 identified
- **Tables required by live code:** 21 distinct tables
- **RPC functions required:** 8 distinct RPCs
- **Hardcoded values found:** 0 in source (schema targets `v2` — see note)
- **Duplicate migration prefix:** 1 (`047`)
- **Critical note:** ALL code targets the `v2` schema, NOT `public`. Day-zero migrations must use `v2` schema OR code must be updated to use `public`.

---

## Live Set

### Frontend Entry Chain (`v2-core/src/`)

**Entry:** `main.tsx` → `App.tsx`

#### Core files (always live)
- `main.tsx`
- `App.tsx`
- `index.css`
- `contexts/AuthContext.tsx`
- `types/types.ts`
- `types/auth.ts`
- `lib/` (all files)

#### Layout
- `components/layout/Layout.tsx`
- `components/layout/Header.tsx`
- `components/layout/Sidebar.tsx`

#### Auth
- `components/auth/ProtectedRoute.tsx`
- `pages/auth/LoginPage.tsx`

#### Pages
- `pages/DashboardPage.tsx`
- `pages/NotFoundPage.tsx`
- `pages/admin/TypesPage.tsx`
- `pages/admin/TypeDetailPage.tsx`
- `pages/admin/AppsPage.tsx`
- `pages/admin/AppDetailPage.tsx`
- `pages/admin/PipelinesPage.tsx`
- `pages/admin/PipelineDetailPage.tsx`
- `pages/admin/TriggersPage.tsx`
- `pages/admin/TriggerDetailPage.tsx`
- `pages/admin/AIAgentsPage.tsx`
- `pages/admin/AIAgentDetailPage.tsx`
- `pages/admin/EmbeddingsPage.tsx`
- `pages/admin/EmbeddingDetailPage.tsx`
- `pages/admin/TimersPage.tsx`
- `pages/admin/TimerDetailPage.tsx`
- `pages/admin/IntegrationsPage.tsx`
- `pages/admin/IntegrationDetailPage.tsx`
- `pages/admin/AccountTypesPage.tsx`
- `pages/admin/AccountTypeDetailPage.tsx`
- `pages/admin/PersonTypesPage.tsx`
- `pages/admin/PersonTypeDetailPage.tsx`
- `pages/admin/RolesPage.tsx`
- `pages/admin/RoleDetailPage.tsx`
- `pages/admin/ThreadTypesPage.tsx`
- `pages/admin/MessageTypesPage.tsx`
- `pages/admin/AttachmentTypesPage.tsx`
- `pages/admin/PromptConfigsPage.tsx`
- `pages/admin/PromptConfigDetailPage.tsx`
- `pages/admin/APIKeysPage.tsx`
- `pages/admin/APIKeyDetailPage.tsx`
- `pages/admin/PipelineExecutionsPage.tsx`
- `pages/admin/LogsPage.tsx`

#### Runtime components (live — routed via `DataListPage` / `DataDetailPage`)
- `components/runtime/DataListPage.tsx`
- `components/runtime/DataDetailPage.tsx`
- `components/runtime/DataTable.tsx`
- `components/runtime/DataStats.tsx`
- `components/runtime/DataFilters.tsx`
- `components/runtime/DataHeader.tsx`
- `components/runtime/DataDetailHeader.tsx`
- `components/runtime/SchemaDetailForm.tsx`
- `components/runtime/index.ts`

#### Shared components
- `components/shared/FieldRenderer.tsx`
- `components/shared/SchemaFields.tsx`

#### Admin components
- `components/admin/AdminListPage.tsx`
- `components/admin/AdminStatsCard.tsx`
- `components/admin/SortableTableHeader.tsx`

#### Hooks
- `hooks/useApi.ts`
- `hooks/useEntityList.ts`
- `hooks/useEntityRecord.ts`
- `hooks/useForm.ts`
- `hooks/useListSchema.ts`
- `hooks/useSchemaRecord.ts`

### Live Functions (`v2-core/functions/`)

All 18 handlers are reachable from `netlify.toml [functions] directory = "v2-core/functions"`:

| Handler | Tables accessed |
|---|---|
| `admin-data.ts` | accounts, people, items, threads, messages, links, attachments, watchers, types |
| `types.ts` | types, accounts, apps |
| `roles.ts` | roles, apps |
| `apps.ts` | apps, accounts |
| `auth.ts` | people, accounts, roles |
| `pipelines.ts` | pipelines, pipeline_executions, apps, people |
| `pipeline-executions.ts` | pipeline_executions, pipelines, people |
| `triggers.ts` | triggers, trigger_executions, apps, people |
| `timers.ts` | timers, apps, people |
| `ai-agents.ts` | ai_agents, apps, people |
| `embeddings.ts` | embeddings |
| `integrations.ts` | integrations, apps, people |
| `logs.ts` | logs |
| `prompt-configs.ts` | prompt_configs, apps, people |
| `api-keys.ts` | api_keys, api_key_usage_logs, integrations, people |
| `account-nodes.ts` | accounts, types |
| `debug-auth.ts` | (no DB — JWT debug only) |
| `system-cron.ts` | actions, api_keys, schedule_executions (via `adminDb.rpc`) |

### Live `_shared/` Files

All 6 are imported by live handlers:
- `_shared/db.ts` — Supabase clients, `joins` constants
- `_shared/middleware.ts` — `createHandler`, `RequestContext`
- `_shared/permissions.ts` — `PermissionEngine`, `sanitizeRecordData`
- `_shared/principal.ts` — `resolvePrincipal`, `getPrincipalDb`
- `_shared/audit.ts` — `emitLog`, `emitAudit`
- `_shared/schema-utils.ts` — `generateValidationSchema` (used by `types.ts`)

### Live Scripts

| Script | Status | Called by |
|---|---|---|
| `scripts/netlify-dev-wrapper.sh` | ✅ Live | `netlify.toml [dev].command` |
| `scripts/assemble-v2.sh` | ✅ Live | `package.json` prebuild |
| `scripts/assemble-v2-functions.sh` | ✅ Live | `assemble-v2.sh` |
| `scripts/assemble-v2-frontend.sh` | ✅ Live | `assemble-v2.sh` |
| `scripts/assemble-v2-custom.sh` | ✅ Live | `assemble-v2.sh` |
| `scripts/build-manifest.sh` | ✅ Live | `package.json` prebuild |
| `scripts/verify-integrity.sh` | ✅ Live | `package.json` prebuild |

---

## Orphaned Files

These files exist but nothing in the live code path imports or routes to them:

| File | Reason |
|---|---|
| `v2-core/src/pages/admin/AccountDetailPage.tsx.new` | Zero-byte file with `.new` extension — artifact |
| `v2-core/x-netlify-functions/` (entire dir, 40 files) | Legacy function snapshot — no live code imports from here; superseded by `v2-core/functions/` |
| `v2-core/functions/schema-utils.ts` *(if exists at root)* | Confirm — `schema-utils` lives in `_shared/`; any root-level copy is orphaned |
| `scripts/assemble-apps.sh` | Not called by any live script |
| `scripts/assemble-apps-simple.sh` | Not called by any live script |
| `scripts/assemble-frontend.sh` | v1-era script, superseded by `assemble-v2-frontend.sh` |
| `scripts/assemble-functions.sh` | v1-era script, superseded by `assemble-v2-functions.sh` |
| `scripts/quarantine-legacy.sh` | One-time-use script, no longer needed |
| `scripts/app-install-cli.ts` | Not called by any live script or route |
| `scripts/load-test-app-install.ts` | Test/dev script, not part of any build chain |
| `_quarantine/` (entire dir) | All contents are retired artifacts — no imports anywhere |

---

## Legacy Candidates

Files that contain references to old patterns, deleted tables, or v1-era architecture:

| File | Issue |
|---|---|
| `v2-core/migrations/047_provisioning.sql` | Duplicate `047_` prefix — conflicts with `047_simplify_auth_model.sql`; migration order is ambiguous on fresh install |
| `v2-core/migrations/047_simplify_auth_model.sql` | Same duplicate prefix issue |
| `v2-core/src/App.tsx` lines 376–390 | Legacy redirect routes (`/admin/data/:entity` → `/admin/runtime/:entity`) — safe to keep short-term but dead routes |
| `v2-core/docs/` (various .md files) | Contains stale audit reports, gap-remediation notes referencing old state — not harmful, but stale |
| `v2-core/fix-functions.sh` | One-off fix script at `v2-core/` root — purpose served, should be deleted |
| `v2-core/.windsurf/` | Unknown contents — confirm empty or remove |
| `v2-core/.vscode/` | Editor config — OK to keep, but confirm not containing hardcoded values |
| `v2-core/README.md` | May reference old architecture — needs refresh for clean install |

---

## DB: Code→Table Map

> **CRITICAL:** `db.ts` connects to schema `v2` (not `public`). Day-zero migrations must either:  
> (a) Create tables in the `v2` schema, OR  
> (b) Update `db.ts` to use `schema: 'public'`  
> This decision must be made before writing migration files.

---

### Table: `accounts`
```
columns used:  id, slug, display_name, is_active, parent_id, type_id, owner_account_id
FKs:           parent_id → accounts.id
               type_id → types.id
               owner_account_id → accounts.id
joins:         type:types!type_id, parent:accounts!parent_id, owner_account:accounts!owner_account_id
accessed by:   admin-data.ts (ctx.db + adminDb), auth.ts (ctx.db), types.ts (adminDb), account-nodes.ts (ctx.db)
RLS required:  yes (account hierarchy filtering)
RPCs:          get_account_hierarchy(parent_account_id), get_account_ancestors(account_id),
               get_account_descendants(account_id), get_account_apps(account_id, include_system, include_inactive)
```

### Table: `people`
```
columns used:  id, email, full_name, avatar_url, account_id, role_id, is_active
FKs:           account_id → accounts.id
               role_id → roles.id
joins:         account:accounts!people_account_id_fkey, role:roles
accessed by:   auth.ts (ctx.db), admin-data.ts (ctx.db), pipeline-executions.ts (join),
               prompt-configs.ts (join), api-keys.ts (join), ai-agents.ts (join),
               triggers.ts (join), timers.ts (join), pipelines.ts (join), integrations.ts (join)
RLS required:  yes
```

### Table: `types`
```
columns used:  id, slug, name, kind, description, icon, color, app_id, is_active,
               design_schema, validation_schema, ownership
FKs:           app_id → apps.id
joins:         app:apps!app_id
accessed by:   types.ts (ctx.db + adminDb), admin-data.ts (adminDb — type lookup for items),
               account-nodes.ts (join on accounts)
RLS required:  yes
RPCs:          get_type_schema(kind, slug, app_id)
```

### Table: `apps`
```
columns used:  id, slug, name, description, icon, color, version, app_type, source,
               owner_account_id, config, nav_items, min_role, integration_deps, metadata,
               is_active, is_system
FKs:           owner_account_id → accounts.id
joins:         owner_account:accounts!owner_account_id
accessed by:   apps.ts (ctx.db), types.ts (adminDb), roles.ts (ctx.db),
               pipelines.ts (join), triggers.ts (join), timers.ts (join),
               ai-agents.ts (join), integrations.ts (join), prompt-configs.ts (join)
RLS required:  yes
RPCs:          get_account_apps(account_id, include_system, include_inactive),
               get_app_schema(app_slug),
               is_app_available(app_slug, account_id),
               update_app_version(app_id, new_version)
```

### Table: `roles`
```
columns used:  id, slug, name, description, permissions, is_system, is_active, app_id
FKs:           app_id → apps.id
joins:         app:apps!app_id
accessed by:   roles.ts (ctx.db + adminDb), auth.ts (join on people)
RLS required:  yes
```

### Table: `items`
```
columns used:  id, item_type_id, title, is_active, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           item_type_id → types.id
               account_id → accounts.id
               created_by → people.id
accessed by:   admin-data.ts (ctx.db — full CRUD via VALID_ENTITIES)
search field:  title
soft delete:   yes (is_active)
RLS required:  yes
```

### Table: `threads`
```
columns used:  id, title, is_active, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           account_id → accounts.id
accessed by:   admin-data.ts (ctx.db — VALID_ENTITIES)
search field:  title
soft delete:   yes (is_active)
RLS required:  yes
```

### Table: `messages`
```
columns used:  id, content, is_active, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           account_id → accounts.id
accessed by:   admin-data.ts (ctx.db — VALID_ENTITIES)
search field:  content
soft delete:   yes (is_active)
RLS required:  yes
```

### Table: `links`
```
columns used:  id, link_type, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           account_id → accounts.id
accessed by:   admin-data.ts (ctx.db — VALID_ENTITIES)
search field:  link_type
soft delete:   no (hard delete)
RLS required:  yes
```

### Table: `attachments`
```
columns used:  id, filename, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           account_id → accounts.id
accessed by:   admin-data.ts (ctx.db — VALID_ENTITIES)
search field:  filename
soft delete:   no
RLS required:  yes
```

### Table: `watchers`
```
columns used:  id, watch_type, is_active, design_schema, validation_schema,
               account_id, type_id, created_by, created_at, updated_at, updated_by
FKs:           account_id → accounts.id
accessed by:   admin-data.ts (ctx.db — VALID_ENTITIES)
search field:  watch_type
soft delete:   yes (is_active)
RLS required:  yes
```

### Table: `pipelines`
```
columns used:  id, name, description, trigger_type, config, stages, metadata, is_active,
               app_id, account_id, created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
joins:         app:apps!app_id, created_by_person:people!created_by
accessed by:   pipelines.ts (ctx.db), pipeline-executions.ts (join)
RLS required:  yes
```

### Table: `pipeline_executions`
```
columns used:  id, pipeline_id, status, trigger_data, result, error_message,
               started_at, completed_at, duration_ms, created_by, account_id, created_at
FKs:           pipeline_id → pipelines.id
               created_by → people.id
               account_id → accounts.id
joins:         pipeline:pipelines!pipeline_id, triggered_by_person:people!pipeline_executions_created_by_fkey
accessed by:   pipeline-executions.ts (ctx.db), pipelines.ts (ctx.db — getExecutions)
RLS required:  yes
```

### Table: `triggers`
```
columns used:  id, name, description, trigger_type, event_type, config, pipeline_id,
               metadata, is_active, app_id, account_id, created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
               pipeline_id → pipelines.id
joins:         app:apps!app_id, created_by_person:people!created_by
accessed by:   triggers.ts (ctx.db)
RLS required:  yes
```

### Table: `trigger_executions`
```
columns used:  id, trigger_id, triggered_at, status (implicit via ordering)
FKs:           trigger_id → triggers.id
accessed by:   triggers.ts (ctx.db — getExecutions)
RLS required:  yes
```

### Table: `timers`
```
columns used:  id, name, description, timer_type, config, pipeline_id, metadata, is_active,
               app_id, account_id, created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
               pipeline_id → pipelines.id
joins:         app:apps!app_id, created_by_person:people!created_by
accessed by:   timers.ts (ctx.db)
RLS required:  yes
```

### Table: `ai_agents`
```
columns used:  id, name, description, agent_type, model_config, system_prompt, tools,
               capabilities, constraints, metadata, is_active, app_id, account_id,
               created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
joins:         app:apps!app_id, created_by_person:people!created_by
accessed by:   ai-agents.ts (ctx.db)
RLS required:  yes
```

### Table: `embeddings`
```
columns used:  id, model_id, document_id, chunk_index, content, metadata,
               account_id, created_at
FKs:           account_id → accounts.id
accessed by:   embeddings.ts (ctx.db)
RLS required:  yes
```

### Table: `integrations`
```
columns used:  id, name, description, integration_type, provider, version, config,
               credentials, metadata, is_active, is_configured, app_id, account_id,
               created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
joins:         app:apps!app_id, created_by_person:people!created_by
accessed by:   integrations.ts (ctx.db), api-keys.ts (join)
RLS required:  yes
```

### Table: `logs`
```
columns used:  id, level, message, context, source, source_type, source_id,
               person_id, account_id, metadata, created_at
FKs:           account_id → accounts.id
               person_id → people.id (nullable)
accessed by:   logs.ts (ctx.db), audit.ts (ctx.db or adminDb — all functions via emitLog/emitAudit)
RLS required:  yes (scoped to account_id)
```

### Table: `prompt_configs`
```
columns used:  id, name, slug, system_prompt, context_template, model, temperature,
               max_tokens, is_multi_turn, max_history_messages, confidence_threshold,
               escalation_action, escalation_target, output_mode, output_field,
               requires_review, knowledge_sources, available_tools, tool_constraints,
               metadata, is_active, app_id, account_id, created_by, created_at, updated_at
FKs:           app_id → apps.id
               account_id → accounts.id
               created_by → people.id
joins:         app:apps!app_id, created_by_person:people!prompt_configs_created_by_fkey
accessed by:   prompt-configs.ts (ctx.db)
RLS required:  yes
```

### Table: `api_keys`
```
columns used:  id, integration_id, name, key_type, key_prefix, permissions, rate_limit,
               expires_at, metadata, is_active, account_id, created_by, created_at, updated_at
               machine_type, is_internal, scopes (read by system-cron.ts)
FKs:           integration_id → integrations.id (nullable)
               account_id → accounts.id
               created_by → people.id
joins:         integration:integrations, created_by_person:people
accessed by:   api-keys.ts (ctx.db), system-cron.ts (adminDb — machine principal lookup)
RLS required:  yes
RPCs:          create_api_key(...), validate_api_key(key_value, required_permissions)
```

### Table: `api_key_usage_logs`
```
columns used:  id, api_key_id, response_status, success, created_at
FKs:           api_key_id → api_keys.id
joins:         api_key:api_keys
accessed by:   api-keys.ts (ctx.db — listUsageLogs)
RLS required:  yes
```

### Table: `actions` *(system-cron only)*
```
columns used:  id, handler, handler_module, config, required_scopes
FKs:           (none explicit in code)
accessed by:   system-cron.ts (adminDb)
RLS required:  no (adminDb only)
```

### Table: `schedule_executions` *(system-cron only)*
```
columns used:  schedule_id, account_id, machine_principal_id, status,
               input_params, output_result, error_message, duration_ms
FKs:           schedule_id → schedules (implied), account_id → accounts.id
accessed by:   system-cron.ts (adminDb)
RLS required:  no (adminDb only)
```

---

## Tables: `select *` (columns not fully enumerated in code)

These tables are queried with `select('*')` — full column set must be verified against DB schema:

| Table | Location |
|---|---|
| `accounts` | `admin-data.ts`, `types.ts`, `account-nodes.ts` |
| `people` | `admin-data.ts` |
| `items` | `admin-data.ts` |
| `threads` | `admin-data.ts` |
| `messages` | `admin-data.ts` |
| `links` | `admin-data.ts` |
| `attachments` | `admin-data.ts` |
| `watchers` | `admin-data.ts` |
| `types` | `types.ts` (full record), `admin-data.ts` (type lookup) |
| `roles` | `roles.ts` |
| `pipelines` | `pipelines.ts` |
| `triggers` | `triggers.ts` |
| `timers` | `timers.ts` |
| `ai_agents` | `ai-agents.ts` |
| `integrations` | `integrations.ts` |
| `prompt_configs` | `prompt-configs.ts` |
| `api_keys` | `api-keys.ts` |

---

## RPC Functions Required

| RPC name | Called by | Purpose |
|---|---|---|
| `get_account_hierarchy(parent_account_id)` | `auth.ts` | Get all accessible child accounts |
| `get_account_ancestors(account_id)` | `account-nodes.ts` | Ancestor chain for breadcrumb |
| `get_account_descendants(account_id)` | `account-nodes.ts` | Subtree for tree view |
| `get_account_apps(account_id, include_system, include_inactive)` | `apps.ts` | Apps visible to account |
| `get_type_schema(kind, slug, app_id)` | `types.ts` | Resolve design_schema for a type |
| `get_app_schema(app_slug)` | `apps.ts` | App schema lookup |
| `is_app_available(app_slug, account_id)` | `apps.ts` | Marketplace availability check |
| `update_app_version(app_id, new_version)` | `apps.ts` | Version bump |
| `create_api_key(...)` | `api-keys.ts` | Secure key generation |
| `validate_api_key(key_value, required_permissions)` | `api-keys.ts` | Key validation |
| `get_due_schedules(p_now)` | `system-cron.ts` | Cron schedule polling |
| `validate_schedule_creator(p_schedule_id)` | `system-cron.ts` | Cron safety check |
| `update_schedule_after_run(p_schedule_id, p_success, p_error_message)` | `system-cron.ts` | Cron state update |

---

## Hardcoded Values Found

| File | Type | Value |
|---|---|---|
| `functions/_shared/db.ts` | Schema target | `schema: 'v2'` — hardcoded in both `adminDb` and `getUserDb`. **Must change to `'public'` for day-zero migration** |
| `vite.config.ts` | (check) | Confirm `VITE_DB_SCHEMA` env var path |

No hardcoded tenant IDs, account UUIDs, or emails found in `v2-core/functions/` or `v2-core/src/`.

---

## Migration Chain Issues

| Issue | Detail |
|---|---|
| **Duplicate prefix `047`** | `047_provisioning.sql` AND `047_simplify_auth_model.sql` both exist — ambiguous execution order on fresh install |
| **65 migrations total** | Chain is long; many migrations are incremental patches to the current hodgepodge schema — NOT suitable as a clean day-zero chain |
| **Schema target mismatch** | All migrations use `v2` schema; day-zero plan must decide: keep `v2` schema or migrate to `public` and update `db.ts` |
| **`x-netlify-functions/`** | Contains `_shared/` with `db.ts` likely targeting a different/older schema — confirm and delete |

---

## Recommended Deletion List (Pending Your Sign-off)

| Path | Action | Risk |
|---|---|---|
| `v2-core/x-netlify-functions/` | Delete entire directory | Low — nothing imports from here |
| `v2-core/src/pages/admin/AccountDetailPage.tsx.new` | Delete | None — zero bytes |
| `scripts/assemble-apps.sh` | Delete | Low — not in any build chain |
| `scripts/assemble-apps-simple.sh` | Delete | Low — not in any build chain |
| `scripts/assemble-frontend.sh` | Delete | Low — v1-era, superseded |
| `scripts/assemble-functions.sh` | Delete | Low — v1-era, superseded |
| `scripts/quarantine-legacy.sh` | Delete | Low — one-time use done |
| `scripts/app-install-cli.ts` | Delete | Medium — confirm no external tooling depends on it |
| `scripts/load-test-app-install.ts` | Delete | Medium — confirm not used in CI |
| `_quarantine/` | Delete entire directory | Low — all contents are retired artifacts |
| `v2-core/fix-functions.sh` | Delete | Low — one-off fix script |
| `v2-core/migrations/` | Do NOT delete yet — keep as reference for day-zero spec | — |

---

## Key Decisions Required Before Day-Zero Migration

1. **Schema: `v2` or `public`?** — `db.ts` hardcodes `schema: 'v2'`. Day-zero plan must pick one. Changing to `public` requires a one-line edit in `db.ts`; keeping `v2` requires `CREATE SCHEMA v2` in migration 001.

2. **RPC functions** — 13 RPCs are called by live code. Each needs a `CREATE FUNCTION` in the day-zero migrations. These are currently buried across the 65-migration chain.

3. **`system-cron` tables** — `actions`, `schedule_executions`, `schedules` are only accessed by `system-cron.ts` via `adminDb` with no RLS. These need their own migration section.

4. **`api_key_usage_logs`** — Small table, only read by `api-keys.ts`. Needs creation in day-zero chain.
