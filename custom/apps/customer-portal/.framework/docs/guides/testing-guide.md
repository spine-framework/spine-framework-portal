# Testing Guide

Spine's test suite covers four surfaces: **unit**, **integration**, **API**, and **UI (Playwright)**.
All tests target the **public schema** (`DB_SCHEMA=public`). Results are persisted to
`public.test_runs` / `public.test_results` and surfaced in the admin UI at `/admin/testing`.

The primary purpose of running tests against the public schema is to discover **day-zero gaps** —
missing seed data, structural issues, or RLS mismatches that must be resolved before production.

---

## Running Tests

```bash
# All tests (unit + integration + api)
npm test

# Unit tests only (fast, no network)
npm run test:unit

# Integration tests (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SPINE_TEST_ACCOUNT_ID)
npm run test:integration

# API tests (requires dev server running + SPINE_DEV_JWT)
SPINE_DEV_JWT=<jwt> vitest run v2-core/tests/api

# UI sweep (requires dev server + playwright)
tsx v2-core/tests/ui/ui-sweep.ts
```

See `.windsurf/workflows/run-tests.md` for the full step-by-step workflow.

---

## Environment Setup

Integration, API, and UI tests need credentials in `v2-core/.xenv` or `v2-core/.xenv.test`:

```env
SUPABASE_URL=https://uyokuiibztwfasdprsov.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SPINE_TEST_ACCOUNT_ID=<uuid>
DB_SCHEMA=public
# For API tests:
SPINE_DEV_JWT=<user-jwt>
SPINE_DEV_URL=http://localhost:8888
```

---

## Test Suites

### Unit Tests (`v2-core/tests/unit/`)

Pure function tests — no network, no DB. Mock `db.ts` with `vi.mock`.

```ts
// v2-core/tests/unit/pipeline-runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPipeline } from '../../functions/_shared/pipeline-runner.ts'
import { SYSTEM_PRINCIPAL } from '../../functions/_shared/principal.ts'
import type { CoreContext } from '../../functions/_shared/middleware.ts'

// Mock adminDb
vi.mock('../../functions/_shared/db.ts', () => ({
  adminDb: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn()
  }
}))

function makeCtx(overrides: Partial<CoreContext> = {}): CoreContext {
  return {
    principal: SYSTEM_PRINCIPAL,
    accountId: 'test-account-id',
    db: {},  // mocked via vi.mock above
    requestId: 'test-request-id',
    ...overrides
  }
}
```

### Example unit test

```ts
describe('runPipeline', () => {
  it('throws when pipeline not found', async () => {
    const { adminDb } = await import('../../functions/_shared/db.ts')
    vi.mocked(adminDb.from('pipelines').select('*').eq('id', 'x').eq('is_active', true).single)
      .mockResolvedValue({ data: null, error: { message: 'Not found' } })

    await expect(
      runPipeline('nonexistent-id', {}, makeCtx())
    ).rejects.toThrow('Pipeline not found or inactive')
  })
})
```

---

## Integration Tests (`v2-core/tests/integration/`)

Run against the live Supabase public schema via `adminDb`. Failures are **day-zero gaps**.

Key files:
- `helpers.ts` — `adminDb`, `makeTestCtx()`, `TEST_ACCOUNT_ID`
- `admin-data-accounts.test.ts` — accounts table shape + HTTP endpoint
- `admin-data-people.test.ts` — people table shape + HTTP endpoint
- `schema-validation.test.ts` — `design_schema` completeness across all types
- `custom-integrity.test.ts` — public schema connectivity, RLS isolation, export surface

Tests use `describe.skipIf(!TEST_ACCOUNT_ID)` to skip gracefully when env is not configured.

```ts
describe.skipIf(!TEST_ACCOUNT_ID)('my integration test', () => {
  it('checks something in public schema', async () => {
    const { data, error } = await adminDb.from('types').select('*').limit(1)
    expect(error).toBeNull()
    // Gap warning pattern:
    if (!data?.length) console.warn('[gap] public.types is empty')
  })
})
```

---

## API Tests (`v2-core/tests/api/`)

HTTP fetch tests against the local dev server. Requires `SPINE_DEV_JWT`.

- `api-surface.test.ts` — auth matrix, CRUD lifecycle, error handling across all entities

```bash
SPINE_DEV_JWT=<jwt> vitest run v2-core/tests/api
```

---

## UI Tests (`v2-core/tests/ui/`)

Playwright sweep over all admin routes. Checks for zero console errors per page.

```bash
tsx v2-core/tests/ui/ui-sweep.ts
```

Results written to `public.test_runs` with `suite='ui'`.

---

## Result Reporter

`tests/reporter.ts` is a Vitest custom reporter that persists results to `public.test_runs`
and `public.test_results` after every test run. Also exports `writeRunResults()` for use
by non-Vitest runners (UI sweep, API tests).

It is registered in `vitest.config.ts`:
```ts
reporters: ['default', './v2-core/tests/reporter.ts']
```

View results in the admin UI at `/admin/testing`.

---

## Fixtures

```bash
# Seed test data into public schema (idempotent)
tsx v2-core/tests/fixtures/seed.ts

# Remove test-* rows from public schema
tsx v2-core/tests/fixtures/teardown.ts
```

---

## Gap Report

After running integration + API + UI tests, document every failure in
`v2-core/docs/dayzero-gap-report.md`:

```markdown
## Gap: public.types is empty
- **Test**: schema-validation.test.ts — "all active types have a non-empty design_schema"
- **Root cause**: `migrations_dayzero/007_seeds.sql` not yet applied to public schema
- **Fix**: Apply seeds or add missing type rows
```

---

## Testing Custom Code

Import from the stable `_shared` index:

```ts
import { runPipeline, adminDb, SYSTEM_PRINCIPAL, CoreContext } from '../../_shared/index.ts'
```

---

## Test File Structure

```
v2-core/tests/
  unit/
    pipeline-runner.test.ts
    permissions.test.ts
    schema-utils.test.ts
    principal.test.ts
  integration/
    auth.test.ts
    isolation.test.ts
    permissions.test.ts
    pipeline.test.ts
    machine-principal.test.ts
    cli-smoke.test.ts
    helpers.ts
```

---

## CI Integration

Tests run automatically in GitHub Actions via `.github/workflows/smoke-test.yml`. Unit tests run on every push; integration tests run on PRs against `main` using the Supabase staging branch credentials stored in GitHub Secrets.
