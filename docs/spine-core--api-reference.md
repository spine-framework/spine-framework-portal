# Spine Core API Reference

## Overview

This document describes all APIs exposed by Spine Core that custom apps can consume. All APIs are served from the same origin when assembled, requiring no API keys — authentication is handled via Supabase Auth session cookies.

**Base URL:** `/.netlify/functions/{endpoint}`

**Authentication:** All endpoints (except noted) require authenticated Supabase session. The `createHandler` middleware extracts JWT from cookies and builds `ctx.principal`.

---

## Config APIs (Admin-Only Write)

These endpoints define system shapes and behaviors. Reads are available to all authenticated users; writes require system admin.

### 1. Types API (`types.ts`)

**Purpose:** CRUD for type definitions — the schemas that shape items, people, accounts, and links.

**Endpoints:**
```
GET    /.netlify/functions/types              (list)
GET    /.netlify/functions/types?id={uuid}    (get)
POST   /.netlify/functions/types              (create - admin only)
PATCH  /.netlify/functions/types?id={uuid}   (update - admin only)
DELETE /.netlify/functions/types?id={uuid}   (remove - admin only)
```

**Query Parameters:**
- `kind` — filter by type kind (entity, item, link, etc.)
- `app_id` — filter by parent app (use `null` for system types)
- `ownership` — filter by ownership (system, tenant, pack)
- `include_schema` — include design_schema in response

**Request Body (Create/Update):**
```json
{
  "slug": "support_ticket",
  "name": "Support Ticket",
  "kind": "item",
  "app_id": "uuid-or-null",
  "design_schema": { "fields": {}, "record_permissions": {} },
  "validation_schema": {}
}
```

**Expected Output:**
```json
{
  "id": "uuid",
  "slug": "support_ticket",
  "name": "Support Ticket",
  "kind": "item",
  "design_schema": { ... },
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

**How to Test:**
```bash
# List all types
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/types?kind=item

# Create type (admin only)
curl -X POST \
  -H "Cookie: sb-access-token=..." \
  -H "Content-Type: application/json" \
  -d '{"slug":"test","name":"Test","kind":"item"}' \
  /.netlify/functions/types
```

---

### 2. Apps API (`apps.ts`)

**Purpose:** CRUD for app definitions — installable units of functionality with nav configuration.

**Endpoints:**
```
GET    /.netlify/functions/apps              (list)
GET    /.netlify/functions/apps?id={uuid}    (get)
POST   /.netlify/functions/apps              (create - admin only)
PATCH  /.netlify/functions/apps?id={uuid}   (update - admin only)
DELETE /.netlify/functions/apps?id={uuid}   (remove - admin only)
```

**Query Parameters:**
- `include_system` — include system apps (default: true)
- `include_inactive` — include inactive apps
- `account_id` — scope to specific account

**Request Body (Create/Update):**
```json
{
  "slug": "my-app",
  "name": "My Application",
  "route_prefix": "/my-app",
  "renderer": "custom",
  "nav_items": [
    { "title": "Dashboard", "path": "/", "icon": "Layout" }
  ],
  "min_role": "admin"
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/apps?include_system=true
```

---

### 3. Roles API (`roles.ts`)

**Purpose:** CRUD for role definitions with permission sets.

**Endpoints:**
```
GET    /.netlify/functions/roles              (list)
GET    /.netlify/functions/roles?id={uuid}   (get)
POST   /.netlify/functions/roles              (create - admin only)
PATCH  /.netlify/functions/roles?id={uuid}   (update - admin only)
DELETE /.netlify/functions/roles?id={uuid}   (remove - admin only)
```

**Query Parameters:**
- `app_id` — filter by parent app
- `is_system` — filter system roles

**Request Body:**
```json
{
  "slug": "manager",
  "name": "Manager",
  "permissions": ["read", "write"],
  "is_system": false
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/roles?is_system=true
```

---

### 4. Pipelines API (`pipelines.ts`)

**Purpose:** CRUD for pipeline definitions — named stage sequences for workflow automation.

**Endpoints:**
```
GET    /.netlify/functions/pipelines              (list)
GET    /.netlify/functions/pipelines?action=by-trigger&trigger_type={type}
GET    /.netlify/functions/pipelines?action=executions&pipeline_id={id}
GET    /.netlify/functions/pipelines?id={uuid}   (get)
POST   /.netlify/functions/pipelines              (create)
POST   /.netlify/functions/pipelines?action=toggle&id={uuid}  (toggle active)
PATCH  /.netlify/functions/pipelines?id={uuid}   (update)
DELETE /.netlify/functions/pipelines?id={uuid}   (remove - hard delete)
```

**Request Body:**
```json
{
  "name": "Ticket Workflow",
  "trigger_type": "item_created",
  "stages": [
    { "name": "validate", "action": "validate_schema" },
    { "name": "notify", "action": "send_notification" }
  ]
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/pipelines?action=by-trigger&trigger_type=item_created
```

---

### 5. Triggers API (`triggers.ts`)

**Purpose:** CRUD for trigger definitions — event-to-pipeline bindings.

**Endpoints:**
```
GET    /.netlify/functions/triggers              (list)
GET    /.netlify/functions/triggers?action=by-event&event_type={type}
GET    /.netlify/functions/triggers?action=executions&trigger_id={id}
GET    /.netlify/functions/triggers?id={uuid}   (get)
POST   /.netlify/functions/triggers              (create)
POST   /.netlify/functions/triggers?action=toggle&id={uuid}  (toggle)
PATCH  /.netlify/functions/triggers?id={uuid}   (update)
DELETE /.netlify/functions/triggers?id={uuid}   (remove - soft delete)
```

**Request Body:**
```json
{
  "name": "On Ticket Created",
  "trigger_type": "event",
  "event_type": "item.created",
  "pipeline_id": "uuid-of-pipeline",
  "config": { "conditions": [] }
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/triggers?action=by-event&event_type=item.created
```

---

### 6. Timers API (`timers.ts`)

**Purpose:** CRUD for timer definitions — scheduled execution triggers.

**Endpoints:**
```
GET    /.netlify/functions/timers              (list)
GET    /.netlify/functions/timers?id={uuid}    (get)
POST   /.netlify/functions/timers              (create)
PATCH  /.netlify/functions/timers?id={uuid}   (update)
DELETE /.netlify/functions/timers?id={uuid}   (remove)
```

**Request Body:**
```json
{
  "name": "Daily Report",
  "timer_type": "cron",
  "config": { "cron": "0 9 * * *" },
  "pipeline_id": "uuid-of-pipeline"
}
```

---

### 7. AI Agents API (`ai-agents.ts`)

**Purpose:** CRUD for AI agent configurations — LLM-powered automation entities.

**Endpoints:**
```
GET    /.netlify/functions/ai-agents              (list)
GET    /.netlify/functions/ai-agents?id={uuid}   (get)
POST   /.netlify/functions/ai-agents              (create)
POST   /.netlify/functions/ai-agents?action=run&id={uuid}   (run inference)
PATCH  /.netlify/functions/ai-agents?id={uuid}   (update)
DELETE /.netlify/functions/ai-agents?id={uuid}   (remove)
```

**Request Body:**
```json
{
  "name": "Support Bot",
  "agent_type": "conversational",
  "model_config": { "model": "gpt-4", "temperature": 0.7 },
  "system_prompt": "You are a helpful support agent...",
  "tools": ["search_knowledge", "create_ticket"]
}
```

---

### 8. Prompt Configs API (`prompt-configs.ts`)

**Purpose:** CRUD for prompt template configurations.

**Endpoints:**
```
GET    /.netlify/functions/prompt-configs              (list)
GET    /.netlify/functions/prompt-configs?id={uuid}   (get)
POST   /.netlify/functions/prompt-configs              (create)
PATCH  /.netlify/functions/prompt-configs?id={uuid}   (update)
DELETE /.netlify/functions/prompt-configs?id={uuid}   (remove)
```

**Request Body:**
```json
{
  "name": "Ticket Summary",
  "slug": "ticket-summary",
  "system_prompt": "Summarize this ticket...",
  "model": "gpt-4",
  "temperature": 0.5
}
```

---

### 9. Integrations API (`integrations.ts`)

**Purpose:** CRUD for integration definitions — external service connections.

**Endpoints:**
```
GET    /.netlify/functions/integrations              (list)
GET    /.netlify/functions/integrations?id={uuid}   (get)
POST   /.netlify/functions/integrations              (create)
POST   /.netlify/functions/integrations?action=test&id={uuid}   (test connection)
PATCH  /.netlify/functions/integrations?id={uuid}   (update)
DELETE /.netlify/functions/integrations?id={uuid}   (remove)
```

**Request Body:**
```json
{
  "name": "Slack Connection",
  "integration_type": "slack",
  "provider": "slack",
  "config": { "workspace": "my-workspace" },
  "credentials": { "bot_token": "xoxb-..." }
}
```

---

### 10. API Keys API (`api-keys.ts`)

**Purpose:** CRUD for API key management — machine principal credentials.

**Endpoints:**
```
GET    /.netlify/functions/api-keys              (list)
GET    /.netlify/functions/api-keys?id={uuid}   (get)
POST   /.netlify/functions/api-keys              (create)
POST   /.netlify/functions/api-keys?action=rotate&id={uuid}   (rotate key)
PATCH  /.netlify/functions/api-keys?id={uuid}   (update)
DELETE /.netlify/functions/api-keys?id={uuid}   (revoke)
```

**Request Body:**
```json
{
  "name": "Service Account",
  "key_type": "service",
  "permissions": ["read", "write"],
  "scopes": ["items:read", "items:write"]
}
```

---

## Runtime APIs

These endpoints manage application-generated data. Full CRUD available to apps via RLS-scoped access.

### 11. Admin Data API (`admin-data.ts`)

**Purpose:** Generic CRUD for all runtime entities. Single endpoint covers 9 entity types.

**Endpoints:**
```
GET    /.netlify/functions/admin-data?entity={type}              (list)
GET    /.netlify/functions/admin-data?entity={type}&id={uuid}    (get)
POST   /.netlify/functions/admin-data?entity={type}              (create)
PATCH  /.netlify/functions/admin-data?entity={type}&id={uuid}   (update)
DELETE /.netlify/functions/admin-data?entity={type}&id={uuid}   (remove)
GET    /.netlify/functions/admin-data?entity={type}&action=stats (stats)
```

**Valid Entity Types:** `accounts`, `people`, `items`, `threads`, `messages`, `links`, `attachments`, `watchers`, `item_progress`

**Query Parameters:**
- `search` — text search in entity's display field
- `sort_field`, `sort_direction` — ordering
- `limit`, `offset` — pagination
- `type_slug` — filter items by type
- `view` — resolve view config from type schema

**Request Body (Create/Update):**
```json
{
  "type_id": "uuid-of-type",
  "title": "My Item",
  "data": { "custom_field": "value" }
}
```

**Expected Output:**
```json
{
  "id": "uuid",
  "type_id": "uuid",
  "title": "My Item",
  "data": { "custom_field": "value" },
  "design_schema": { ... },
  "created_at": "2024-01-01T00:00:00Z"
}
```

**How to Test:**
```bash
# List items of type "support_ticket"
curl -H "Cookie: sb-access-token=..." \
  "/.netlify/functions/admin-data?entity=items&type_slug=support_ticket"

# Create item
curl -X POST \
  -H "Cookie: sb-access-token=..." \
  -H "Content-Type: application/json" \
  -d '{"type_id":"uuid","title":"New Ticket","data":{"priority":"high"}}' \
  "/.netlify/functions/admin-data?entity=items"
```

---

### 12. Item Progress API (`item-progress.ts`)

**Purpose:** CRUD + upsert for per-person, per-item progress tracking.

**Endpoints:**
```
GET    /.netlify/functions/item-progress              (list)
GET    /.netlify/functions/item-progress?id={uuid}   (get)
POST   /.netlify/functions/item-progress              (create)
PATCH  /.netlify/functions/item-progress?id={uuid}   (update)
```

**Query Parameters:**
- `person_id` — filter by person
- `item_id` — filter by item
- `item_ids` — comma-separated list of items
- `status` — filter by status

**Request Body:**
```json
{
  "person_id": "uuid",
  "item_id": "uuid",
  "type_id": "uuid",
  "status": "in_progress",
  "score": 75
}
```

---

### 13. Pipeline Executions API (`pipeline-executions.ts`)

**Purpose:** Lifecycle management for pipeline run records.

**Endpoints:**
```
GET    /.netlify/functions/pipeline-executions              (list)
GET    /.netlify/functions/pipeline-executions?action=running   (active runs)
GET    /.netlify/functions/pipeline-executions?action=stats     (statistics)
GET    /.netlify/functions/pipeline-executions?id={uuid}      (get)
POST   /.netlify/functions/pipeline-executions                (create)
PATCH  /.netlify/functions/pipeline-executions?action=start&id={uuid}
PATCH  /.netlify/functions/pipeline-executions?action=complete&id={uuid}
PATCH  /.netlify/functions/pipeline-executions?action=cancel&id={uuid}
POST   /.netlify/functions/pipeline-executions?action=cleanup  (cleanup old)
```

**Status FSM:** `pending` → `running` → `completed` | `failed` | `cancelled`

**Query Parameters:**
- `pipeline_id` — filter by parent pipeline
- `status` — filter by execution status

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  "/.netlify/functions/pipeline-executions?pipeline_id={uuid}&status=running"
```

---

### 14. Embeddings API (`embeddings.ts`)

**Purpose:** CRUD and vector similarity search for embedding records.

**Endpoints:**
```
GET    /.netlify/functions/embeddings              (list)
GET    /.netlify/functions/embeddings?id={uuid}   (get)
POST   /.netlify/functions/embeddings              (create)
POST   /.netlify/functions/embeddings?action=batch-create     (batch insert)
POST   /.netlify/functions/embeddings?action=delete-document   (bulk delete)
POST   /.netlify/functions/embeddings?action=search-similar    (vector search)
POST   /.netlify/functions/embeddings?action=search-semantic  (text search)
POST   /.netlify/functions/embeddings?action=cleanup           (cleanup old)
GET    /.netlify/functions/embeddings?action=stats            (statistics)
PATCH  /.netlify/functions/embeddings?id={uuid}   (update)
```

**Query Parameters:**
- `model_id` — filter by embedding model
- `document_id` — filter by source document

**Request Body (Search):**
```json
{
  "query_embedding": [0.1, 0.2, ...],  // 1536-dim vector
  "limit": 10,
  "threshold": 0.8
}
```

**How to Test:**
```bash
# Search similar embeddings
curl -X POST \
  -H "Cookie: sb-access-token=..." \
  -H "Content-Type: application/json" \
  -d '{"query_embedding":[...],"limit":5}' \
  /.netlify/functions/embeddings?action=search-similar
```

---

### 15. Logs API (`logs.ts`)

**Purpose:** Read API for system logs plus write endpoint for external ingestion.

**Endpoints:**
```
GET    /.netlify/functions/logs?action=account    (list by account)
GET    /.netlify/functions/logs?action=target     (list by target entity)
GET    /.netlify/functions/logs?action=person     (list by person)
GET    /.netlify/functions/logs?action=stats     (statistics)
GET    /.netlify/functions/logs?action=search     (search with filters)
POST   /.netlify/functions/logs?action=cleanup    (cleanup old logs - admin)
POST   /.netlify/functions/logs                   (ingest external log)
```

**Query Parameters:**
- `event_type` — filter by event type
- `target_type`, `target_id` — filter by target entity
- `date_from`, `date_to` — date range
- `limit`, `offset` — pagination

**Request Body (Ingest):**
```json
{
  "level": "error",
  "message": "Something went wrong",
  "context": { "error_code": "E123" }
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  "/.netlify/functions/logs?action=account&event_type=item.created&date_from=2024-01-01"
```

---

## System APIs

### 16. Auth API (`auth.ts`)

**Purpose:** Returns authenticated user context including account hierarchy.

**Endpoints:**
```
GET /.netlify/functions/auth         (get context)
GET /.netlify/functions/auth?action=health  (health check - unauthenticated)
```

**Expected Output:**
```json
{
  "id": "person-uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "account_id": "account-uuid",
  "account": {
    "id": "account-uuid",
    "slug": "my-org",
    "display_name": "My Organization"
  },
  "roles": ["admin"],
  "permissions": ["read", "write", "admin"],
  "accessible_accounts": [
    { "id": "child-uuid", "slug": "child", "display_name": "Child Account" }
  ]
}
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/auth
```

---

### 17. System API (`system.ts`)

**Purpose:** System health and administrative operations.

**Endpoints:**
```
GET /.netlify/functions/system?action=health      (health check)
GET /.netlify/functions/system?action=version     (version info)
GET /.netlify/functions/system?action=status      (system status)
POST /.netlify/functions/system?action=ping       (ping test)
```

**How to Test:**
```bash
curl /.netlify/functions/system?action=health
```

---

### 18. Observability API (`observability.ts`)

**Purpose:** Aggregated metrics and analytics over logs.

**Endpoints:**
```
GET /.netlify/functions/observability?action=event_volume&from={ISO}&to={ISO}&bucket=hour
GET /.netlify/functions/observability?action=error_rate&from={ISO}&to={ISO}
GET /.netlify/functions/observability?action=latency_percentiles&from={ISO}&to={ISO}
GET /.netlify/functions/observability?action=pipeline_stats&from={ISO}&to={ISO}
GET /.netlify/functions/observability?action=top_actors&from={ISO}&to={ISO}
POST /.netlify/functions/observability?action=cleanup  (cleanup old - admin)
```

**Query Parameters:**
- `from`, `to` — required date range (ISO 8601)
- `bucket` — time bucket size (minute, hour, day)

**Expected Output (event_volume):**
```json
[
  { "bucket_time": "2024-01-01T00:00:00Z", "event_type": "item.created", "count": 42 },
  { "bucket_time": "2024-01-01T01:00:00Z", "event_type": "item.created", "count": 38 }
]
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  "/.netlify/functions/observability?action=event_volume&from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z&bucket=hour"
```

---

### 19. Tests API (`tests.ts`)

**Purpose:** Test run management and execution history.

**Endpoints:**
```
GET /.netlify/functions/tests              (list test runs)
GET /.netlify/functions/tests?id={uuid}     (get test run)
POST /.netlify/functions/tests              (create test run)
PATCH /.netlify/functions/tests?id={uuid}   (update test run)
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/tests
```

---

### 20. System Cron API (`system-cron.ts`)

**Purpose:** Cron job management and threshold-based alerting.

**Endpoints:**
```
GET /.netlify/functions/system-cron?action=list           (list jobs)
GET /.netlify/functions/system-cron?action=get&id={uuid}  (get job)
POST /.netlify/functions/system-cron                    (create job)
PATCH /.netlify/functions/system-cron?id={uuid}           (update job)
DELETE /.netlify/functions/system-cron?id={uuid}         (delete job)
POST /.netlify/functions/system-cron?action=run&id={uuid}  (trigger now)
POST /.netlify/functions/system-cron?action=evaluate    (evaluate thresholds)
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/system-cron?action=list
```

---

### 21. Account Nodes API (`account-nodes.ts`)

**Purpose:** Account hierarchy node management.

**Endpoints:**
```
GET /.netlify/functions/account-nodes              (list nodes)
GET /.netlify/functions/account-nodes?id={uuid}    (get node)
POST /.netlify/functions/account-nodes             (create node)
PATCH /.netlify/functions/account-nodes?id={uuid}  (update node)
DELETE /.netlify/functions/account-nodes?id={uuid} (delete node)
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/account-nodes
```

---

## Integration Routes API

### 22. Integration Routes API (`integration-routes.ts`)

**Purpose:** Dynamic routing and handler dispatch for integration webhook endpoints.

**Endpoints:**
```
GET    /.netlify/functions/integration-routes              (list routes)
GET    /.netlify/functions/integration-routes?id={uuid}    (get route)
POST   /.netlify/functions/integration-routes              (create route)
POST   /.netlify/functions/integration-routes?action=invoke&id={uuid}  (invoke handler)
PATCH  /.netlify/functions/integration-routes?id={uuid}   (update route)
DELETE /.netlify/functions/integration-routes?id={uuid}   (remove route)
```

**How to Test:**
```bash
curl -H "Cookie: sb-access-token=..." \
  /.netlify/functions/integration-routes
```

---

## Common Patterns

### Authentication
All endpoints (except health checks) require a valid Supabase Auth session. The `createHandler` middleware:
1. Extracts JWT from `sb-access-token` cookie
2. Validates and decodes the token
3. Builds `ctx.principal` with user identity
4. Creates `ctx.db` — an RLS-scoped Supabase client

### Error Responses
All errors follow this shape:
```json
{
  "error": "Human-readable error message",
  "statusCode": 400
}
```

### Pagination
List endpoints support:
- `limit` — max results (default varies: 50-100)
- `offset` — skip N results (default: 0)

### Response Format
Success responses return either:
- Single object for `get`, `create`, `update`
- Array for `list`
- Stats/metrics object for analytics endpoints

### Testing via CLI
Use the `spine` CLI for testing without browser cookies:
```bash
# The CLI uses service_role key internally
npx spine-framework items list --type support_ticket
npx spine-framework items get <uuid>
```

---

## Missing Runtime APIs (Not Yet Implemented)

The following runtime tables currently have **no API coverage**:

| Table | Status |
|-------|--------|
| `trigger_executions` | ❌ No API — planned for trigger-monitoring.ts |
| `schedule_executions` | ❌ No API — planned for schedule-monitoring.ts |
| `api_key_usage_logs` | ❌ No API — extend logs.ts or new api-usage.ts |

---

## Summary Table

| Endpoint | Config/Runtime | Purpose | Auth Required |
|----------|---------------|---------|---------------|
| `types` | Config | Schema definitions | Read: Any, Write: Admin |
| `apps` | Config | App definitions | Read: Any, Write: Admin |
| `roles` | Config | Role definitions | Read: Any, Write: Admin |
| `pipelines` | Config | Workflow definitions | Read: Any, Write: Auth |
| `triggers` | Config | Event bindings | Read: Any, Write: Auth |
| `timers` | Config | Scheduled triggers | Read: Any, Write: Auth |
| `ai-agents` | Config | AI configurations | Read: Any, Write: Auth |
| `prompt-configs` | Config | Prompt templates | Read: Any, Write: Auth |
| `integrations` | Config | External services | Read: Any, Write: Auth |
| `api-keys` | Config | Machine credentials | Read: Any, Write: Auth |
| `admin-data` | Runtime | Generic CRUD for 9 entities | Auth + RLS |
| `item-progress` | Runtime | Progress tracking | Auth + RLS |
| `pipeline-executions` | Runtime | Pipeline run logs | Auth + RLS |
| `embeddings` | Runtime | Vector storage/search | Auth + RLS |
| `logs` | Runtime | System audit logs | Auth + RLS |
| `observability` | Runtime | Metrics/analytics | Auth + RLS |
| `auth` | System | Session context | Auth |
| `system` | System | Health/status | Varies |
| `tests` | System | Test management | Auth |
| `system-cron` | System | Cron jobs | Auth |
| `account-nodes` | System | Hierarchy nodes | Auth + RLS |
| `integration-routes` | System | Webhook routing | Auth |

---

*Generated from v2-core source analysis. Last updated: 2026-05-26*
