# v2 Schema Compatibility Audit

## Core Entity Endpoints

### accounts.ts
- **v2 Schema**: `accounts` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `types` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### people.ts
- **v2 Schema**: `people` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `types` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### items.ts
- **v2 Schema**: `items` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `types` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### types.ts
- **v2 Schema**: `types` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

## Configuration Endpoints

### apps.ts
- **v2 Schema**: `apps` table exists
- **Fields**: All referenced fields match v2 schema
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### roles.ts
- **v2 Schema**: `roles` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### pipelines.ts
- **v2 Schema**: `pipelines` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps`, `people`, `accounts` relations valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### triggers.ts
- **v2 Schema**: `triggers` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps`, `people`, `pipelines` relations valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### ai-agents.ts
- **v2 Schema**: `ai_agents` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps`, `people` relations valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### embeddings.ts
- **v2 Schema**: `embeddings` table exists
- **Fields**: All referenced fields match v2 schema
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### timers.ts
- **v2 Schema**: `timers` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps`, `people`, `pipelines` relations valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### integrations.ts
- **v2 Schema**: `integrations` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps`, `people`, `accounts` relations valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### prompt-configs.ts
- **v2 Schema**: `prompt_configs` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

## Runtime Endpoints

### threads.ts
- **v2 Schema**: `threads` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### messages.ts
- **v2 Schema**: `messages` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `threads`, `people` relations valid
- **Status**: PASS

### attachments.ts
- **v2 Schema**: `attachments` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

### watchers.ts
- **v2 Schema**: `watchers` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people` relation valid
- **Status**: PASS

### links.ts
- **v2 Schema**: `links` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `link_types`, `people` relations valid
- **Status**: PASS

### link_types.ts
- **v2 Schema**: `link_types` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `apps` relation valid
- **Soft Delete**: Uses `is_active=false` correctly
- **Status**: PASS

## Access Control Endpoints

### people-accounts.ts
- **v2 Schema**: `people_accounts` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people`, `accounts`, `roles` relations valid
- **Status**: PASS

### people-roles.ts
- **v2 Schema**: `people_roles` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people`, `roles` relations valid
- **Status**: PASS

### account-nodes.ts
- **v2 Schema**: `accounts` table exists
- **RPC Usage**: Uses `get_account_ancestors`, `get_account_descendants`
- **Status**: PASS

## System Endpoints

### logs.ts
- **v2 Schema**: `logs` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `people`, `accounts` relations valid
- **Status**: PASS

### pipeline-executions.ts
- **v2 Schema**: `pipeline_executions` table exists
- **Fields**: All referenced fields match v2 schema
- **Joins**: `pipelines` relation valid
- **Status**: PASS

## v2-Incompatible Endpoints

### ai-orchestrator.ts
- **Issue**: References `ai_orchestrator` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### pending-actions.ts
- **Issue**: References `pending_actions` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### apps-accounts.ts
- **Issue**: References `apps_accounts` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### apps-integrations.ts
- **Issue**: References `apps_integrations` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### impersonation.ts
- **Issue**: References `impersonation_sessions`, `impersonation_policies`, `impersonation_logs` (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### integration-health.ts
- **Issue**: References `integration_sync_logs`, `oauth_connections`, `api_keys`, `api_key_usage_logs` (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### thread-participants.ts
- **Issue**: References `thread_participants` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### outbox.ts
- **Issue**: References `outbox` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

### webhooks.ts
- **Issue**: References `webhooks` table (not in v2)
- **Status**: FAIL
- **Action**: Quarantine or rewrite

## Summary

### PASS: 18 endpoints
All core v2 schema endpoints are compatible and properly implemented.

### FAIL: 9 endpoints
These endpoints reference tables that don't exist in v2 schema and will cause runtime errors.

### Immediate Actions Required
1. Quarantine all v2-incompatible endpoints
2. Update any routing that might call these endpoints
3. Determine if functionality should be reimplemented with existing v2 tables
