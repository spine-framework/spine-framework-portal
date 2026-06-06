# Guide 02: Create a Custom Function

## What this guide covers

How to write a custom Netlify function that uses core authentication, database access, and middleware.

---

## Naming convention

Custom functions live in `custom/functions/` and must be prefixed `custom_`:

```
custom/functions/custom_my-feature.ts
```

After assembly, this becomes `.netlify/functions/custom_my-feature` and is callable at:
```
GET /api/custom_my-feature?action=list
```

---

## Step 1: Create the function file

```typescript
// custom/functions/custom_my-feature.ts
import { createHandler } from '@core/_shared'

export const handler = createHandler(async (event, ctx) => {
  const action = ctx.query?.action || 'list'

  switch (action) {
    case 'list': {
      const { data, error } = await ctx.db
        .from('items')
        .select('*')
        .eq('type_slug', 'my_type')

      if (error) throw error
      return { data }
    }

    case 'get': {
      const id = ctx.query?.id
      if (!id) throw new Error('id is required')

      const { data, error } = await ctx.db
        .from('items')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return { data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
})
```

---

## What createHandler gives you

`createHandler` wraps your function with:
- **Authentication** — rejects unauthenticated requests with 401
- **Authorization** — `ctx.principal` has the user's roles and permissions
- **Database** — `ctx.db` is a Supabase client scoped to the user's account via RLS
- **Logging** — `ctx.logger` for structured logs
- **Error handling** — uncaught errors become 500 responses with safe messages

```typescript
interface CoreContext {
  db: SupabaseClient        // RLS-scoped to authenticated user's account
  principal: Principal      // { id, account_id, roles, permissions }
  query: Record<string, string>  // parsed query string
  body: any                 // parsed request body
  logger: Logger            // structured logging
}
```

---

## Accessing the authenticated user

```typescript
export const handler = createHandler(async (event, ctx) => {
  const { principal } = ctx

  console.log(principal.id)          // user UUID
  console.log(principal.account_id)  // tenant account UUID
  console.log(principal.roles)       // e.g. ['member', 'support']

  // Check role
  if (!principal.roles.includes('support')) {
    throw new Error('Support role required')
  }

  return { data: 'ok' }
})
```

---

## Admin database access

`ctx.db` is RLS-scoped (safe for user-facing data). For admin operations use `adminDb`:

```typescript
import { createHandler, adminDb } from '@core/_shared'

export const handler = createHandler(async (event, ctx) => {
  // adminDb bypasses RLS — use with care
  const { data } = await adminDb
    .from('accounts')
    .select('*')

  return { data }
})
```

---

## Calling your function from the frontend

```typescript
import { apiFetch } from '@core/lib/api'

// apiFetch handles auth headers and the /api → /.netlify/functions proxy
const response = await apiFetch('/api/custom_my-feature?action=list')
const { data } = await response.json()
```

---

## Step 2: Assemble and test

```bash
npm run assemble:functions
# Functions reload automatically in netlify dev

# Test directly
curl http://localhost:8888/api/custom_my-feature?action=list \
  -H "Authorization: Bearer <your-jwt>"
```

---

## POST requests

```typescript
export const handler = createHandler(async (event, ctx) => {
  if (event.httpMethod === 'POST') {
    const payload = ctx.body  // already parsed JSON

    const { data, error } = await ctx.db
      .from('items')
      .insert({ ...payload, account_id: ctx.principal.account_id })
      .select()
      .single()

    if (error) throw error
    return { data }
  }

  throw new Error('Method not allowed')
})
```

---

## Next steps

- [03-create-a-component.md](./03-create-a-component.md) — Build UI components for your app
- [04-webhook-handlers.md](./04-webhook-handlers.md) — React to system events
