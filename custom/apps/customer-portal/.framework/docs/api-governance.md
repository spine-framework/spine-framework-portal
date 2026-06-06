# Spine v2 API Governance Checklist

## Universal API Ground Rules

### Response Format Standards
- **Success - List**: `{ data: [...], pagination?: { page, totalPages, totalItems, itemsPerPage } }`
- **Success - Single/Create/Update**: `{ data: {...} }`
- **Error**: `{ error: "Human readable message", code?: "ERROR_CODE" }`
- **Validation Error**: `{ errors: { field: "field-specific error" } }`

### Authentication & Context
- All APIs require valid session token (`Authorization: Bearer`)
- Account context via `X-Account-Id` header
- System admin can bypass account scoping
- Use `requireAuth` middleware for mutations
- Use `requireTenant` for account-scoped reads

### HTTP Patterns
- **GET /resource** - List (with query parameters)
- **GET /resource?id=uuid** - Single
- **POST /resource** - Create
- **PATCH /resource?id=uuid** - Update
- **DELETE /resource?id=uuid** - Soft delete

### Query Parameter Standards
- `page`, `itemsPerPage` - Pagination
- `search` - Text search
- `sort`, `direction` - Sorting
- `field=value` - Filtering
- `include=relation1,relation2` - Related data

### Data Constraints
- APIs return data only, never styling/UI components
- All endpoints enforce role-based permissions
- DELETE = soft delete (`is_active=false`), never hard deletes
- All mutations must emit audit logs via `emitLog`

## Permission Model

### Single Source of Truth
- type.schema defines what roles can do
- v2.people_accounts + v2.people_roles define who has roles
- No parallel permission systems

### Enforcement Points
- All first-surface APIs use shared permission resolver
- Field filtering on reads
- Field validation on writes
- Multi-role merge: highest effective permission wins

### System Admin Override
- Complete bypass of runtime restrictions
- Audit logs preserved
- Intended for admin operations only

### Error Handling
- Use consistent error format with descriptive messages
- Include error codes for programmatic handling
- Log errors appropriately with context
- Return 4xx for client errors, 5xx for server errors

### Pagination
- Default `page=1`, `itemsPerPage=20`
- Return total count for client-side calculations
- Support `search` and filtering in pagination queries
- Use `range()` for efficient DB queries

### Soft Delete Semantics
- Never use `DELETE FROM` statements
- Always set `is_active=false` with `updated_at`
- Filter active records with `is_active=true` by default
- Preserve audit trail before soft delete

### Database Constraints
- Use `public` schema only
- All queries must use `db.from('public.table')`
- Validate field names against actual schema
- Use parameterized queries to prevent injection

### Role Boundaries
- **Config endpoints** (`admin/configs/*`): admin-only mutations
- **Data endpoints** (`admin/data/*`): permissions by role/type schema
- **Runtime endpoints**: account-scoped with appropriate role checks
- **Internal endpoints**: system-only or service-to-service

## Code Patterns

### Handler Structure
```typescript
export const handler = createHandler(async (ctx, body) => {
  const method = ctx.query?.method || 'GET'
  switch (method) {
    case 'GET': return await list(ctx, body)
    case 'POST': return await create(ctx, body)
    case 'PATCH': return await update(ctx, body)
    case 'DELETE': return await remove(ctx, body)
    default: throw new Error(`Unsupported method: ${method}`)
  }
})
```

### Auth Patterns
```typescript
// Public reads
export const list = createHandler(async (ctx, body) => {
  // Account-scoped by default
})

// Authenticated mutations
export const create = requireAuth(createHandler(async (ctx, body) => {
  // Requires valid session
}))
```

### Audit Logging
```typescript
await emitLog(ctx, 'entity.created', 
  { type: 'entity', id: data.id }, 
  { after: data }
)
```

## Documentation Requirements

Each endpoint must include JSDoc comments with:
- Purpose and domain (data/config/runtime/internal)
- Auth requirements
- Account scoping rules
- Request parameters/body contract
- Response shape
- Soft delete behavior
- v2 table/RPC dependencies

## Review Checklist

- [ ] Response format matches standard
- [ ] Auth middleware applied appropriately
- [ ] Account context handled correctly
- [ ] Soft delete implemented (no hard deletes)
- [ ] Audit logs emitted for mutations
- [ ] Error handling consistent
- [ ] Pagination implemented for lists
- [ ] Query parameters validated
- [ ] v2 schema only (no public references)
- [ ] Role boundaries enforced
- [ ] Inline documentation complete
