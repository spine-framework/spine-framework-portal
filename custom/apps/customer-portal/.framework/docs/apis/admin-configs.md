# Admin Configuration APIs

## Overview

Admin Configuration APIs manage definitions and configurations for types, apps, pipelines, triggers, AI agents, embeddings, timers, and integrations. These endpoints require admin authentication for mutations.

## Types API

**Endpoint:** `/.netlify/functions/types`

**Domain:** admin-configs (type definitions)

**Operations:**
- `GET /functions/types` - List type definitions
- `GET /functions/types?id=uuid` - Get single type
- `POST /functions/types` - Create type definition
- `PATCH /functions/types?id=uuid` - Update type
- `DELETE /functions/types?id=uuid` - Soft delete type

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Types
```typescript
// Request
GET /functions/types?kind=item|account|person&page=1&itemsPerPage=20

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      kind: 'item' | 'account' | 'person',
      slug: string,
      name: string,
      description?: string,
      icon?: string,
      color?: string,
      schema: object,
      ui_schema?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string
    }
  ]
}
```

### Create Type
```typescript
// Request
POST /functions/types
{
  app_id: string,      // required
  kind: 'item' | 'account' | 'person', // required
  slug: string,        // required
  name: string,        // required
  description?: string,
  icon?: string,
  color?: string,
  schema: object,      // required
  ui_schema?: object
}

// Response
{
  data: { /* created type */ }
}
```

## Apps API

**Endpoint:** `/.netlify/functions/apps`

**Domain:** admin-configs (app definitions)

**Operations:**
- `GET /functions/apps` - List apps
- `GET /functions/apps?id=uuid` - Get single app
- `POST /functions/apps` - Create app
- `PATCH /functions/apps?id=uuid` - Update app
- `DELETE /functions/apps?id=uuid` - Soft delete app

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Apps
```typescript
// Request
GET /functions/apps?page=1&itemsPerPage=20&search=keyword

// Response
{
  data: [
    {
      id: string,
      slug: string,
      name: string,
      description?: string,
      icon?: string,
      color?: string,
      nav_items?: object[],
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string
    }
  ]
}
```

### Create App
```typescript
// Request
POST /functions/apps
{
  slug: string,        // required
  name: string,        // required
  description?: string,
  icon?: string,
  color?: string,
  nav_items?: object[]
}

// Response
{
  data: { /* created app */ }
}
```

## Pipelines API

**Endpoint:** `/.netlify/functions/pipelines`

**Domain:** admin-configs (workflow definitions)

**Operations:**
- `GET /functions/pipelines` - List pipelines
- `GET /functions/pipelines?id=uuid` - Get single pipeline
- `POST /functions/pipelines` - Create pipeline
- `PATCH /functions/pipelines?id=uuid` - Update pipeline
- `DELETE /functions/pipelines?id=uuid` - Soft delete pipeline

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Pipelines
```typescript
// Request
GET /functions/pipelines?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      person_id?: string,
      account_id?: string,
      name: string,
      description?: string,
      definition: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Pipeline
```typescript
// Request
POST /functions/pipelines
{
  app_id: string,      // required
  person_id?: string,
  account_id?: string,
  name: string,        // required
  description?: string,
  definition: object   // required
}

// Response
{
  data: { /* created pipeline */ }
}
```

## Triggers API

**Endpoint:** `/.netlify/functions/triggers`

**Domain:** admin-configs (trigger definitions)

**Operations:**
- `GET /functions/triggers` - List triggers
- `GET /functions/triggers?id=uuid` - Get single trigger
- `POST /functions/triggers` - Create trigger
- `PATCH /functions/triggers?id=uuid` - Update trigger
- `DELETE /functions/triggers?id=uuid` - Soft delete trigger

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Triggers
```typescript
// Request
GET /functions/triggers?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      person_id?: string,
      pipeline_id?: string,
      name: string,
      description?: string,
      trigger_type: string,
      config: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Trigger
```typescript
// Request
POST /functions/triggers
{
  app_id: string,      // required
  person_id?: string,
  pipeline_id?: string,
  name: string,        // required
  description?: string,
  trigger_type: string, // required
  config: object       // required
}

// Response
{
  data: { /* created trigger */ }
}
```

## AI Agents API

**Endpoint:** `/.netlify/functions/ai-agents`

**Domain:** admin-configs (AI agent definitions)

**Operations:**
- `GET /functions/ai-agents` - List AI agents
- `GET /functions/ai-agents?id=uuid` - Get single AI agent
- `POST /functions/ai-agents` - Create AI agent
- `PATCH /functions/ai-agents?id=uuid` - Update AI agent
- `DELETE /functions/ai-agents?id=uuid` - Soft delete AI agent

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List AI Agents
```typescript
// Request
GET /functions/ai-agents?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      person_id?: string,
      name: string,
      description?: string,
      agent_type: string,
      config: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create AI Agent
```typescript
// Request
POST /functions/ai-agents
{
  app_id: string,      // required
  person_id?: string,
  name: string,        // required
  description?: string,
  agent_type: string,  // required
  config: object       // required
}

// Response
{
  data: { /* created AI agent */ }
}
```

## Embeddings API

**Endpoint:** `/.netlify/functions/embeddings`

**Domain:** admin-configs (embedding definitions)

**Operations:**
- `GET /functions/embeddings` - List embeddings
- `GET /functions/embeddings?id=uuid` - Get single embedding
- `POST /functions/embeddings` - Create embedding
- `PATCH /functions/embeddings?id=uuid` - Update embedding
- `DELETE /functions/embeddings?id=uuid` - Soft delete embedding

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Embeddings
```typescript
// Request
GET /functions/embeddings?page=1&itemsPerPage=20

// Response
{
  data: [
    {
      id: string,
      name: string,
      description?: string,
      model: string,
      dimensions: number,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Embedding
```typescript
// Request
POST /functions/embeddings
{
  name: string,        // required
  description?: string,
  model: string,       // required
  dimensions: number   // required
}

// Response
{
  data: { /* created embedding */ }
}
```

## Timers API

**Endpoint:** `/.netlify/functions/timers`

**Domain:** admin-configs (timer definitions)

**Operations:**
- `GET /functions/timers` - List timers
- `GET /functions/timers?id=uuid` - Get single timer
- `POST /functions/timers` - Create timer
- `PATCH /functions/timers?id=uuid` - Update timer
- `DELETE /functions/timers?id=uuid` - Soft delete timer

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Timers
```typescript
// Request
GET /functions/timers?page=1&itemsPerPage=20&timer_type=schedule|delay|recurring|cron

// Response
{
  data: [
    {
      id: string,
      app_id?: string,
      person_id?: string,
      account_id?: string,
      pipeline_id?: string,
      name: string,
      description?: string,
      timer_type: 'schedule' | 'delay' | 'recurring' | 'cron',
      config: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Timer
```typescript
// Request
POST /functions/timers
{
  app_id?: string,
  person_id?: string,
  account_id?: string,
  pipeline_id?: string,
  name: string,                    // required
  description?: string,
  timer_type: 'schedule' | 'delay' | 'recurring' | 'cron', // required
  config: object                   // required
}

// Response
{
  data: { /* created timer */ }
}
```

## Integrations API

**Endpoint:** `/.netlify/functions/integrations`

**Domain:** admin-configs (integration definitions)

**Operations:**
- `GET /functions/integrations` - List integrations
- `GET /functions/integrations?id=uuid` - Get single integration
- `POST /functions/integrations` - Create integration
- `PATCH /functions/integrations?id=uuid` - Update integration
- `DELETE /functions/integrations?id=uuid` - Soft delete integration

**Authentication:**
- Reads: Public
- Mutations: Admin auth required

**Request/Response:**

### List Integrations
```typescript
// Request
GET /functions/integrations?page=1&itemsPerPage=20&app_id=uuid

// Response
{
  data: [
    {
      id: string,
      app_id: string,
      person_id?: string,
      account_id?: string,
      name: string,
      description?: string,
      integration_type: string,
      config: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string
    }
  ]
}
```

### Create Integration
```typescript
// Request
POST /functions/integrations
{
  app_id: string,           // required
  person_id?: string,
  account_id?: string,
  name: string,             // required
  description?: string,
  integration_type: string, // required
  config: object            // required
}

// Response
{
  data: { /* created integration */ }
}
```

## Common Features

### Admin Authentication
All configuration mutations require admin authentication:
- Valid session token required
- Admin role verification
- Account context respected

### Soft Delete
All DELETE operations use soft delete:
- Sets `is_active = false`
- Updates `updated_at` timestamp
- Preserves audit trail

### Audit Logging
All mutations emit audit logs with proper context:
- `entity.created` - On create
- `entity.updated` - On update  
- `entity.deleted` - On soft delete

### Schema Validation
- Types include JSON schema validation
- UI schema for form generation
- Runtime validation on mutations

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
