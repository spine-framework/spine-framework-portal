# Guide 05: Testing Custom Code

## What this guide covers

How to test custom functions, components, and apps using the Spine test harness.

---

## Test commands

```bash
npm run test               # All tests
npm run test:unit          # Unit tests only (.framework/tests/unit/)
npm run test:core          # Core isolation test (no custom code required)
npm run test:integration   # Integration tests (requires running Supabase)
npm run test:boundary      # Architectural boundary check
```

---

## Testing a custom function

Use `makeTestContext` from the core testing utilities to create a mock `CoreContext`:

```typescript
// custom/tests/my-feature.test.ts
import { describe, it, expect } from 'vitest'
import { makeTestContext, mockPrincipal } from '@core/_shared/testing'

// Import your handler's logic (not the Netlify wrapper)
import { handler } from '../functions/custom_my-feature'

describe('custom_my-feature', () => {
  it('returns items for list action', async () => {
    const ctx = makeTestContext({
      principal: mockPrincipal({ roles: ['member'] }),
      query: { action: 'list' },
    })

    const result = await handler({} as any, ctx)
    expect(result.data).toBeDefined()
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    const ctx = makeTestContext({ principal: null })

    await expect(handler({} as any, ctx)).rejects.toThrow()
  })
})
```

---

## makeTestContext options

```typescript
makeTestContext({
  principal?: Principal | null,  // defaults to a mock member principal
  query?: Record<string, string>, // URL query params
  body?: any,                     // parsed request body
  db?: SupabaseClient,            // override with a real or mock DB client
})
```

---

## mockPrincipal options

```typescript
mockPrincipal({
  id?: string           // UUID, defaults to a stable test UUID
  account_id?: string   // UUID, defaults to a stable test UUID
  roles?: string[]      // defaults to ['member']
  permissions?: string[]
})
```

---

## Testing role-based access

```typescript
it('allows support role to access restricted data', async () => {
  const ctx = makeTestContext({
    principal: mockPrincipal({ roles: ['support'] }),
    query: { action: 'list' },
  })
  const result = await handler({} as any, ctx)
  expect(result.data).toBeDefined()
})

it('denies member role from restricted endpoint', async () => {
  const ctx = makeTestContext({
    principal: mockPrincipal({ roles: ['member'] }),
    query: { action: 'admin_list' },
  })
  await expect(handler({} as any, ctx)).rejects.toThrow('required')
})
```

---

## Boundary check

The boundary check verifies that core never imports from custom, and that custom apps use `@core` aliases (not relative paths to `.framework/`):

```bash
npm run test:boundary
# or
bash scripts/boundary-check.sh
```

Run this before any PR. The GitHub Actions CI also runs it automatically.

**What it checks:**
1. No `from 'custom/'` or `import @custom` in `.framework/`
2. No `from 'custom_'` module imports in `.framework/`
3. No relative paths to `.framework/` from `custom/` (must use `@core`)
4. No app-specific slugs hardcoded in `.framework/src/`

---

## Running core tests in isolation

Core tests must pass without any custom code present:

```bash
npm run test:core
```

This verifies the architectural boundary holds — if core tests fail, it means core has leaked a dependency on custom code.

---

## Integration tests

Integration tests require a running Supabase instance. Set your `.env` before running:

```bash
# .env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

npm run test:integration
```

---

## File locations

```
.framework/tests/
  unit/
    core-isolation.test.ts    ← core tests with no custom deps
    permissions.test.ts
    pipeline-runner.test.ts
  integration/
    admin-data-accounts.test.ts
    isolation.test.ts
    ...
  fixtures/
    seed.ts                   ← test data seeding
    teardown.ts

custom/tests/                 ← your custom tests go here (create this dir)
  my-feature.test.ts
```
