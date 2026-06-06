# Runtime APIs

## Overview

Runtime APIs handle application runtime operations including threads, messages, attachments, watchers, links, and access control. These endpoints support real-time collaboration and system operations.

## Threads API

**Endpoint:** `/.netlify/functions/threads`

**Domain:** runtime (conversation threads)

**Operations:**
- `GET /functions/threads` - List threads
- `GET /functions/threads?id=uuid` - Get single thread
- `POST /functions/threads` - Create thread
- `PATCH /functions/threads?id=uuid` - Update thread
- `DELETE /functions/threads?id=uuid` - Soft delete thread

**Authentication:**
- Reads: Account-scoped with field-level permission filtering
- Mutations: Auth required with schema-driven permissions

**Authorization:**
- Mixed Surface Operations: User messages (first surface), AI agent messages (second surface)
- Thread access: First surface (user permissions)
- Field filtering applied based on type.schema

**Audit Trail:**
- System operations record ctx.triggeredBy
- User operations record ctx.personId
- System admin actions are logged but bypass checks

**Request/Response:**

### List Threads
```typescript
// Request
GET /functions/threads?page=1&itemsPerPage=20&search=keyword&person_id=uuid

// Response
{
  data: [
    {
      id: string,
      person_id: string,
      title: string,
      description?: string,
      thread_type: string,
      metadata?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      person: {
        id: string,
        first_name: string,
        last_name: string
      }
    }
  ]
}
```

### Create Thread
```typescript
// Request
POST /functions/threads
{
  person_id: string,   // required
  title: string,       // required
  description?: string,
  thread_type: string, // required
  metadata?: object
}

// Response
{
  data: { /* created thread */ }
}
```

## Messages API

**Endpoint:** `/.netlify/functions/messages`

**Domain:** runtime (thread messages)

**Operations:**
- `GET /functions/messages` - List messages
- `GET /functions/messages?id=uuid` - Get single message
- `POST /functions/messages` - Create message
- `PATCH /functions/messages?id=uuid` - Update message
- `DELETE /functions/messages?id=uuid` - Soft delete message

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

**Request/Response:**

### List Messages
```typescript
// Request
GET /functions/messages?thread_id=uuid&page=1&itemsPerPage=50

// Response
{
  data: [
    {
      id: string,
      thread_id: string,
      person_id: string,
      content: string,
      message_type: string,
      metadata?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      person: {
        id: string,
        first_name: string,
        last_name: string
      },
      thread: {
        id: string,
        title: string
      }
    }
  ]
}
```

### Create Message
```typescript
// Request
POST /functions/messages
{
  thread_id: string,   // required
  content: string,     // required
  message_type: string, // required
  metadata?: object
}

// Response
{
  data: { /* created message */ }
}
```

## Attachments API

**Endpoint:** `/.netlify/functions/attachments`

**Domain:** runtime (file attachments)

**Operations:**
- `GET /functions/attachments` - List attachments
- `GET /functions/attachments?id=uuid` - Get single attachment
- `POST /functions/attachments` - Create attachment
- `PATCH /functions/attachments?id=uuid` - Update attachment
- `DELETE /functions/attachments?id=uuid` - Soft delete attachment

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

**Request/Response:**

### List Attachments
```typescript
// Request
GET /functions/attachments?page=1&itemsPerPage=20&thread_id=uuid

// Response
{
  data: [
    {
      id: string,
      person_id: string,
      thread_id?: string,
      filename: string,
      file_type: string,
      file_size: number,
      file_url: string,
      metadata?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      person: {
        id: string,
        first_name: string,
        last_name: string
      }
    }
  ]
}
```

### Create Attachment
```typescript
// Request
POST /functions/attachments
{
  person_id: string,   // required
  thread_id?: string,
  filename: string,    // required
  file_type: string,   // required
  file_size: number,   // required
  file_url: string,    // required
  metadata?: object
}

// Response
{
  data: { /* created attachment */ }
}
```

## Watchers API

**Endpoint:** `/.netlify/functions/watchers`

**Domain:** runtime (entity subscriptions)

**Operations:**
- `GET /functions/watchers` - List watchers
- `GET /functions/watchers?id=uuid` - Get single watcher
- `POST /functions/watchers` - Create watcher
- `DELETE /functions/watchers?id=uuid` - Delete watcher (hard delete)

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

**Request/Response:**

### List Watchers
```typescript
// Request
GET /functions/watchers?page=1&itemsPerPage=20&person_id=uuid&entity_type=string

// Response
{
  data: [
    {
      id: string,
      person_id: string,
      entity_type: string,
      entity_id: string,
      watch_type: string,
      created_at: string,
      person: {
        id: string,
        first_name: string,
        last_name: string
      }
    }
  ]
}
```

### Create Watcher
```typescript
// Request
POST /functions/watchers
{
  person_id: string,    // required
  entity_type: string,  // required
  entity_id: string,    // required
  watch_type: string    // required
}

// Response
{
  data: { /* created watcher */ }
}
```

## Links API

**Endpoint:** `/.netlify/functions/links`

**Domain:** runtime (polymorphic entity relationships)

**Operations:**
- `GET /functions/links` - List links
- `GET /functions/links?id=uuid` - Get single link
- `POST /functions/links` - Create link
- `DELETE /functions/links?id=uuid` - Delete link (hard delete)

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

**Request/Response:**

### List Links
```typescript
// Request
GET /functions/links?page=1&itemsPerPage=20&source_type=string&source_id=uuid

// Response
{
  data: [
    {
      id: string,
      link_type_id: string,
      person_id: string,
      source_type: string,
      source_id: string,
      target_type: string,
      target_id: string,
      metadata?: object,
      created_at: string,
      created_by: string,
      account_id: string,
      link_type: {
        id: string,
        name: string,
        forward_label: string,
        reverse_label: string
      },
      person: {
        id: string,
        first_name: string,
        last_name: string
      }
    }
  ]
}
```

### Create Link
```typescript
// Request
POST /functions/links
{
  link_type_id: string, // required
  source_type: string,  // required
  source_id: string,    // required
  target_type: string,  // required
  target_id: string,    // required
  metadata?: object
}

// Response
{
  data: { /* created link */ }
}
```

## Link Types API

**Endpoint:** `/.netlify/functions/link-types`

**Domain:** runtime (link type definitions)

**Operations:**
- `GET /functions/link-types` - List link types
- `GET /functions/link-types?id=uuid` - Get single link type
- `POST /functions/link-types` - Create link type
- `PATCH /functions/link-types?id=uuid` - Update link type
- `DELETE /functions/link-types?id=uuid` - Soft delete link type

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Link Types
```typescript
// Request
GET /functions/link-types?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      name: string,
      description?: string,
      forward_label: string,
      reverse_label: string,
      source_types: string[],
      target_types: string[],
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Link Type
```typescript
// Request
POST /functions/link-types
{
  app_id: string,           // required
  name: string,             // required
  description?: string,
  forward_label: string,    // required
  reverse_label: string,    // required
  source_types: string[],   // required
  target_types: string[]    // required
}

// Response
{
  data: { /* created link type */ }
}
```

## Access Control APIs

### People-Accounts API

**Endpoint:** `/.netlify/functions/people-accounts`

**Domain:** runtime (people-accounts junction)

**Operations:**
- `GET /functions/people-accounts` - List people-accounts relationships
- `POST /functions/people-accounts` - Add person to account
- `DELETE /functions/people-accounts?id=uuid` - Remove person from account

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

### People-Roles API

**Endpoint:** `/.netlify/functions/people-roles`

**Domain:** runtime (people-roles junction)

**Operations:**
- `GET /functions/people-roles` - List people-roles relationships
- `POST /functions/people-roles` - Assign role to person
- `DELETE /functions/people-roles?id=uuid` - Remove role from person

**Authentication:**
- Reads: Account-scoped
- Mutations: Auth required

### Account Nodes API

**Endpoint:** `/.netlify/functions/account-nodes`

**Domain:** internal (account hierarchy traversal)

**Operations:**
- `GET /functions/account-nodes?id=uuid&include=ancestors|descendants` - Get account hierarchy

**Authentication:**
- Reads: Account-scoped
- Uses RPC functions for hierarchy traversal

## System APIs

### Logs API

**Endpoint:** `/.netlify/functions/logs`

**Domain:** internal (system logs)

**Operations:**
- `GET /functions/logs` - List system logs
- `GET /functions/logs?id=uuid` - Get single log entry

**Authentication:**
- Reads: Admin auth required

### Pipeline Executions API

**Endpoint:** `/.netlify/functions/pipeline-executions`

**Domain:** runtime (pipeline execution history)

**Operations:**
- `GET /functions/pipeline-executions` - List pipeline executions
- `GET /functions/pipeline-executions?id=uuid` - Get single execution

**Authentication:**
- Reads: Account-scoped

## Common Features

### Account Scoping
- All runtime endpoints respect account boundaries
- Account context via `X-Account-Id` header
- System admin can bypass scoping

### Real-time Operations
- Support for WebSocket notifications
- Event-driven updates
- Optimistic locking for concurrent updates

### Audit Trail
- All mutations create audit logs
- Immutable history preservation
- Person attribution for all changes

### Error Handling
```typescript
// Success Response
{
  data: T
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

### Pagination
- Default: `page=1`, `itemsPerPage=20`
- Higher limits for message threads (50)
- Supports filtering and search
