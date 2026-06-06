# Admin Data APIs

## Overview

Admin Data APIs manage runtime records for accounts, people, and items. These endpoints support full CRUD operations with proper authentication and account scoping.

## Accounts API

**Endpoint:** `/.netlify/functions/accounts`

**Domain:** admin-data (runtime account records)

**Operations:**
- `GET /functions/accounts` - List all active accounts
- `GET /functions/accounts?id=uuid` - Get single account
- `POST /functions/accounts` - Create new account
- `PATCH /functions/accounts?id=uuid` - Update account
- `DELETE /functions/accounts?id=uuid` - Soft delete account

**Authentication:**
- Reads: Account-scoped with field-level permission filtering
- Mutations: Auth required with schema-driven permissions

**Authorization:**
- First Surface Operations: User permissions evaluated against type.schema
- Role-based access from v2.people_accounts + v2.people_roles
- Field-level permissions respected on reads and writes
- System admin bypasses all restrictions

**Examples:**
- Customer can only see their own items (read: "own")
- Master support can see all client items (read: "all") 
- Field overrides control specific field access

**Request/Response:**

### List Accounts
```typescript
// Request
GET /functions/accounts?page=1&itemsPerPage=20&search=keyword&type_id=uuid

// Response
{
  data: [
    {
      id: string,
      type_id: string,
      slug: string,
      display_name: string,
      description?: string,
      metadata?: object,
      parent_id?: string,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      type: {
        id: string,
        slug: string,
        name: string,
        icon?: string,
        color?: string
      }
    }
  ]
}
```

### Create Account
```typescript
// Request
POST /functions/accounts
{
  type_id: string,      // required
  slug: string,         // required
  display_name: string, // required
  description?: string,
  metadata?: object,
  parent_id?: string
}

// Response
{
  data: { /* created account */ }
}
```

## People API

**Endpoint:** `/.netlify/functions/people`

**Domain:** admin-data (runtime person records)

**Operations:**
- `GET /functions/people` - List all active people
- `GET /functions/people?id=uuid` - Get single person
- `POST /functions/people` - Create new person
- `PATCH /functions/people?id=uuid` - Update person
- `DELETE /functions/people?id=uuid` - Soft delete person

**Authentication:**
- Reads: Public (account-scoped)
- Mutations: Auth required

**Request/Response:**

### List People
```typescript
// Request
GET /functions/people?page=1&itemsPerPage=20&search=keyword&type_id=uuid

// Response
{
  data: [
    {
      id: string,
      type_id: string,
      first_name: string,
      last_name: string,
      email?: string,
      phone?: string,
      metadata?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      type: {
        id: string,
        slug: string,
        name: string,
        icon?: string,
        color?: string
      }
    }
  ]
}
```

### Create Person
```typescript
// Request
POST /functions/people
{
  type_id: string,         // required
  first_name: string,      // required
  last_name: string,       // required
  email?: string,
  phone?: string,
  metadata?: object
}

// Response
{
  data: { /* created person */ }
}
```

## Items API

**Endpoint:** `/.netlify/functions/items`

**Domain:** admin-data (runtime item records)

**Operations:**
- `GET /functions/items` - List all active items
- `GET /functions/items?id=uuid` - Get single item
- `POST /functions/items` - Create new item
- `PATCH /functions/items?id=uuid` - Update item
- `DELETE /functions/items?id=uuid` - Soft delete item

**Authentication:**
- Reads: Public (account-scoped)
- Mutations: Auth required

**Request/Response:**

### List Items
```typescript
// Request
GET /functions/items?page=1&itemsPerPage=20&search=keyword&type_id=uuid

// Response
{
  data: [
    {
      id: string,
      type_id: string,
      name: string,
      description?: string,
      metadata?: object,
      is_active: true,
      created_at: string,
      updated_at: string,
      created_by: string,
      account_id: string,
      type: {
        id: string,
        slug: string,
        name: string,
        icon?: string,
        color?: string
      }
    }
  ]
}
```

### Create Item
```typescript
// Request
POST /functions/items
{
  type_id: string,      // required
  name: string,         // required
  description?: string,
  metadata?: object
}

// Response
{
  data: { /* created item */ }
}
```

## Common Features

### Soft Delete
All DELETE operations use soft delete:
- Sets `is_active = false`
- Updates `updated_at` timestamp
- Preserves audit trail
- Never hard deletes records

### Account Scoping
- System admin can bypass account scoping
- Regular users only see records from their account
- Account context via `X-Account-Id` header

### Audit Logging
All mutations emit audit logs:
- `entity.created` - On create
- `entity.updated` - On update
- `entity.deleted` - On soft delete

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
- Supports `search` parameter
- Supports filtering by `type_id`
- Returns array of records
