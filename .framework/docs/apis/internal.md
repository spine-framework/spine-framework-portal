# Internal APIs

## Overview

Internal APIs handle system-level operations, infrastructure tasks, and service-to-service communications. These endpoints are typically restricted to system administrators or automated processes.

## Roles API

**Endpoint:** `/.netlify/functions/roles`

**Domain:** admin-configs (role definitions)

**Operations:**
- `GET /functions/roles` - List roles
- `GET /functions/roles?id=uuid` - Get single role
- `POST /functions/roles` - Create role
- `PATCH /functions/roles?id=uuid` - Update role
- `DELETE /functions/roles?id=uuid` - Soft delete role

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Roles
```typescript
// Request
GET /functions/roles?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      name: string,
      description?: string,
      permissions: string[],
      min_role?: string,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string
    }
  ]
}
```

### Create Role
```typescript
// Request
POST /functions/roles
{
  app_id: string,        // required
  name: string,          // required
  description?: string,
  permissions: string[], // required
  min_role?: string
}

// Response
{
  data: { /* created role */ }
}
```

## Prompt Configs API

**Endpoint:** `/.netlify/functions/prompt-configs`

**Domain:** admin-configs (AI prompt configurations)

**Operations:**
- `GET /functions/prompt-configs` - List prompt configs
- `GET /functions/prompt-configs?id=uuid` - Get single prompt config
- `POST /functions/prompt-configs` - Create prompt config
- `PATCH /functions/prompt-configs?id=uuid` - Update prompt config
- `DELETE /functions/prompt-configs?id=uuid` - Soft delete prompt config

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Prompt Configs
```typescript
// Request
GET /functions/prompt-configs?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      name: string,
      description?: string,
      model: string,
      system_prompt: string,
      user_prompt_template?: string,
      temperature?: number,
      max_tokens?: number,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Prompt Config
```typescript
// Request
POST /functions/prompt-configs
{
  app_id: string,              // required
  name: string,               // required
  description?: string,
  model: string,              // required
  system_prompt: string,      // required
  user_prompt_template?: string,
  temperature?: number,
  max_tokens?: number
}

// Response
{
  data: { /* created prompt config */ }
}
```

## System Operations

### Logs API

**Endpoint:** `/.netlify/functions/logs`

**Domain:** internal (system logging)

**Operations:**
- `GET /functions/logs` - List system logs
- `GET /functions/logs?id=uuid` - Get single log entry

**Authentication:**
- Reads: Admin auth required
- System-level access only

**Request/Response:**

### List Logs
```typescript
// Request
GET /functions/logs?page=1&itemsPerPage=50&level=error|warn|info&service=string

// Response
{
  data: [
    {
      id: string,
      level: 'error' | 'warn' | 'info',
      message: string,
      service: string,
      metadata?: object,
      created_at: string,
      created_by?: string,
      account_id?: string,
      person?: {
        id: string,
        first_name: string,
        last_name: string
      },
      account?: {
        id: string,
        display_name: string
      }
    }
  ]
}
```

## Quarantined Endpoints

The following endpoints have been quarantined due to v2 schema incompatibility:

### v2-Incompatible Tables
These endpoints reference tables that don't exist in the v2 schema:

- `ai-orchestrator.ts` - References `ai_orchestrator` table
- `pending-actions.ts` - References `pending_actions` table
- `apps-accounts.ts` - References `apps_accounts` table
- `apps-integrations.ts` - References `apps_integrations` table
- `impersonation.ts` - References `impersonation_sessions`, `impersonation_policies`, `impersonation_logs`
- `integration-health.ts` - References `integration_sync_logs`, `oauth_connections`, `api_keys`, `api_key_usage_logs`
- `thread-participants.ts` - References `thread_participants` table
- `outbox.ts` - References `outbox` table
- `webhooks.ts` - References `webhooks` table

**Location:** `v2-core/functions/_quarantine/`

**Status:** These endpoints are disabled and will cause runtime errors if called.

## Internal Service Patterns

### Service-to-Service Communication
Internal APIs support:
- Service authentication via service tokens
- Rate limiting for automated processes
- Bulk operations for data synchronization
- Health check endpoints

### Background Processing
- Queue management for async operations
- Retry mechanisms for failed operations
- Dead letter queue handling
- Progress tracking and status updates

### System Maintenance
- Database health monitoring
- Performance metrics collection
- Cache invalidation
- Session cleanup

## Security Considerations

### Access Control
- Internal endpoints require elevated permissions
- Service authentication bypasses user sessions
- IP restrictions for sensitive operations
- Audit logging for all internal operations

### Rate Limiting
- Higher rate limits for service accounts
- Burst handling for bulk operations
- Throttling for resource-intensive tasks
- Circuit breaker patterns for external services

### Data Privacy
- PII filtering in log outputs
- Encrypted payload transmission
- Secure key management
- Data retention policies

## Error Handling

### System Errors
```typescript
// System Error Response
{
  error: "System maintenance in progress",
  code: "SYSTEM_MAINTENANCE",
  retry_after: 300
}

// Service Unavailable
{
  error: "External service unavailable",
  code: "SERVICE_UNAVAILABLE",
  service: "payment_processor"
}
```

### Validation Errors
```typescript
// Configuration Error
{
  errors: {
    app_id: "Invalid application ID",
    permissions: "Invalid permission format"
  }
}
```

## Performance Optimization

### Caching Strategies
- Redis caching for frequently accessed data
- CDN caching for static configurations
- Application-level caching for role permissions
- Database query result caching

### Batch Operations
- Bulk insert/update operations
- Parallel processing for independent tasks
- Streaming for large datasets
- Pagination for memory efficiency

### Monitoring
- Response time tracking
- Error rate monitoring
- Resource usage metrics
- Custom dashboards for system health
