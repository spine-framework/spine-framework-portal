# Spine v2 API Documentation

## Overview

This directory contains comprehensive API documentation for Spine v2, organized by domain and use case. All APIs follow the Spine v2 governance standards with consistent authentication, error handling, and data contracts.

## API Domains

### [Admin Data APIs](./admin-data.md)
Runtime record management for accounts, people, and items.
- **Accounts** - Account record management
- **People** - Person record management  
- **Items** - Item record management

### [Admin Configuration APIs](./admin-configs.md)
System configuration and definition management.
- **Types** - Type definitions (item/account/person)
- **Apps** - Application definitions
- **Pipelines** - Workflow automation
- **Triggers** - Event triggers
- **AI Agents** - AI agent configurations
- **Embeddings** - Embedding vector definitions
- **Timers** - Scheduled task definitions
- **Integrations** - External integrations
- **Roles** - Role and permission definitions
- **Prompt Configs** - AI prompt configurations

### [Runtime APIs](./runtime.md)
Application runtime operations.
- **Threads** - Conversation threads
- **Messages** - Thread messages
- **Attachments** - File attachments
- **Watchers** - Entity subscriptions
- **Links** - Polymorphic relationships
- **Link Types** - Relationship type definitions
- **Access Control** - People-accounts, people-roles
- **Account Nodes** - Account hierarchy traversal
- **System** - Logs, pipeline executions

### [Internal APIs](./internal.md)
System-level and service-to-service operations.
- **System Operations** - Logs, monitoring
- **Quarantined Endpoints** - v2-incompatible APIs
- **Service Patterns** - Background processing, maintenance

## API Standards

### Authentication
- **Public Reads**: Admin data and config endpoints allow public reads
- **Authenticated Mutations**: All write operations require valid session
- **Admin Guards**: Configuration mutations require admin role
- **Account Scoping**: Runtime endpoints respect account boundaries

### Response Format
```typescript
// Success Response
{
  data: T | T[]
}

// Error Response  
{
  error: "Human readable message",
  code?: "ERROR_CODE"
}

// Validation Error
{
  errors: {
    field: "field-specific error"
  }
}
```

### Common Features
- **Soft Delete**: All DELETE operations use `is_active=false`
- **Audit Logging**: Mutations emit audit logs with context
- **Pagination**: Default `page=1`, `itemsPerPage=20`
- **Search & Filter**: Text search and field filtering support
- **v2 Schema**: All endpoints use v2 schema exclusively

## Quick Reference

### Base URL
```
https://your-domain.netlify.app
```

### Endpoint Pattern
```
/.netlify/functions/{endpoint}
```

### Common Query Parameters
- `page` - Pagination page number
- `itemsPerPage` - Items per page
- `search` - Text search
- `id` - Single record ID
- Domain-specific filters (e.g., `type_id`, `app_id`)

### Authentication Headers
```typescript
// User Session
Authorization: Bearer {session_token}
X-Account-Id: {account_id}

// Service-to-Service
Authorization: Bearer {service_token}
```

## Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid or missing authentication |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid request data |
| `SYSTEM_ERROR` | Internal server error |
| `MAINTENANCE` | System under maintenance |

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Public Reads | 100 requests/minute |
| Authenticated | 500 requests/minute |
| Admin Operations | 200 requests/minute |
| Service-to-Service | 1000 requests/minute |

## SDK Integration

### JavaScript/TypeScript
```typescript
import { SpineAPI } from '@spine/sdk'

const api = new SpineAPI({
  baseURL: 'https://your-domain.netlify.app',
  token: 'your-session-token'
})

// List accounts
const accounts = await api.accounts.list()

// Create item
const item = await api.items.create({
  type_id: 'uuid',
  name: 'New Item'
})
```

### Python
```python
from spine_api import SpineClient

client = SpineClient(
    base_url='https://your-domain.netlify.app',
    token='your-session-token'
)

# List people
people = client.people.list()

# Create thread
thread = client.threads.create({
    'person_id': 'uuid',
    'title': 'New Thread',
    'thread_type': 'discussion'
})
```

## Development Tools

### API Testing
- Use Postman collection for endpoint testing
- Mock server available for development
- OpenAPI specification available

### Monitoring
- Real-time API metrics dashboard
- Error tracking and alerting
- Performance monitoring

### Debugging
- Request/response logging
- Stack trace capture
- Debug mode for detailed errors

## Migration Guide

### From v1 to v2
1. Update base URLs to use new endpoint patterns
2. Migrate authentication to new token format
3. Update request/response handling for new formats
4. Implement soft delete handling
5. Add account context headers

### Breaking Changes
- All endpoints now use v2 schema
- Soft delete semantics applied universally
- Authentication headers updated
- Response format standardized

## Support

### Documentation
- [API Governance Checklist](../api-governance.md)
- [Admin Route Inventory](../admin-routes.md)
- [UI-to-API Coverage Matrix](../ui-api-coverage.md)
- [DB Compatibility Audit](../v2-compatibility-audit.md)

### Getting Help
- Review error messages for specific guidance
- Check audit logs for operation details
- Contact support for system issues
- Community forums for development questions

## Changelog

### v2.0.0
- Complete API restructure for v2 schema
- Standardized response formats
- Added comprehensive documentation
- Implemented soft delete semantics
- Enhanced authentication and authorization

### v1.x.x
- Legacy API structure
- Mixed response formats
- Limited documentation
- Hard delete operations
