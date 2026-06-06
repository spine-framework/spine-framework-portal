# DB-First API Inventory (v2 Schema)

## Core Entity Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `accounts` | accounts.ts | admin-data | complete | Full CRUD with account scoping |
| `people` | people.ts | admin-data | complete | Full CRUD with account scoping |
| `items` | items.ts | admin-data | complete | Full CRUD with type validation |
| `types` | types.ts | admin-configs | complete | Unified for item/account/person types |
| `apps` | apps.ts | admin-configs | complete | App definitions with nav items |
| `roles` | roles.ts | admin-configs | complete | Role definitions and permissions |
| `links` | links.ts | runtime | complete | Polymorphic entity relationships |
| `link_types` | link_types.ts | admin-configs | complete | Link type definitions |

## Workflow & Automation Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `pipelines` | pipelines.ts | admin-configs | complete | Workflow automation pipelines |
| `pipeline_executions` | pipeline-executions.ts | runtime | complete | Pipeline execution history |
| `triggers` | triggers.ts | admin-configs | complete | Trigger definitions |
| `trigger_executions` | trigger_executions | runtime | RPC-only | Accessed via triggers.ts |
| `timers` | timers.ts | admin-configs | complete | Scheduled/delayed timers |

## Collaboration & Communication Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `threads` | threads.ts | runtime | complete | Conversation threads |
| `messages` | messages.ts | runtime | complete | Thread messages |
| `attachments` | attachments.ts | runtime | complete | File attachments |
| `watchers` | watchers.ts | runtime | complete | Entity watching/subscriptions |

## Integration & AI Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `integrations` | integrations.ts | admin-configs | complete | Integration instances |
| `embeddings` | embeddings.ts | admin-configs | complete | Embedding vectors |
| `ai_agents` | ai-agents.ts | admin-configs | complete | AI agent definitions |
| `prompt_configs` | prompt-configs.ts | admin-configs | complete | AI prompt configurations |

## Access Control Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `people_accounts` | people-accounts.ts | runtime | complete | People-Accounts junction |
| `people_roles` | people-roles.ts | runtime | complete | People-Roles junction |
| `account_paths` | account-nodes.ts | internal | RPC-only | Account hierarchy traversal |

## System & Logging Tables

| Table | Endpoint | Domain | Status | Notes |
|-------|----------|--------|--------|-------|
| `logs` | logs.ts | internal | complete | System and application logs |

## v2-Incompatible Endpoints (Require Remediation)

| Endpoint | Referenced Tables | Domain | Status | Action Required |
|----------|------------------|--------|--------|-----------------|
| ai-orchestrator.ts | `ai_orchestrator` | internal | v2-incompatible | Table does not exist in v2 schema |
| pending-actions.ts | `pending_actions` | internal | v2-incompatible | Table does not exist in v2 schema |
| apps-accounts.ts | `apps_accounts` | internal | v2-incompatible | Table does not exist in v2 schema |
| apps-integrations.ts | `apps_integrations` | internal | v2-incompatible | Table does not exist in v2 schema |
| impersonation.ts | `impersonation_sessions`, `impersonation_policies`, `impersonation_logs` | internal | v2-incompatible | Tables do not exist in v2 schema |
| integration-health.ts | `integration_sync_logs`, `oauth_connections`, `api_keys`, `api_key_usage_logs` | internal | v2-incompatible | Tables do not exist in v2 schema |
| thread-participants.ts | `thread_participants` | runtime | v2-incompatible | Table does not exist in v2 schema |
| outbox.ts | `outbox` | internal | v2-incompatible | Table does not exist in v2 schema |
| webhooks.ts | `webhooks` | internal | v2-incompatible | Table does not exist in v2 schema |

## Summary

### Complete Coverage: 18 tables
- All core entity tables have proper endpoints
- All workflow/automation tables are covered
- All collaboration tables are covered
- All integration/AI tables are covered
- Access control tables are covered
- System logging is covered

### v2-Incompatible: 9 endpoints
- These endpoints reference tables that don't exist in v2 schema
- Must be either rewritten to use existing v2 tables or quarantined
- Priority: High - these will cause runtime errors if called

### Missing Endpoints: 0 tables
- All v2 schema tables have corresponding endpoints
- Some tables are accessed via RPC rather than direct queries (trigger_executions, account_paths)

### Recommendations
1. Quarantine v2-incompatible endpoints immediately
2. Rewrite or remove incompatible endpoints
3. Consider if missing functionality should be implemented with existing v2 tables
4. Update any UI that might be calling incompatible endpoints
