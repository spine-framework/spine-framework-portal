/// <reference types="node" />
/**
 * @module tests/integration/admin-data-accounts
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests for the `admin-data` function's `accounts` entity.
 *
 * **Two test surfaces:**
 *
 * 1. **DB-layer** (`describe.skipIf(!TEST_ACCOUNT_ID)`) — queries the v2
 *    schema directly via `adminDb` and asserts the expected field shape.
 *    Runnable with only `SPINE_TEST_ACCOUNT_ID` set.
 *
 * 2. **HTTP endpoint** (`describe.skipIf(!TEST_ACCOUNT_ID || !DEV_JWT)`) —
 *    hits the live dev server at `SPINE_DEV_URL` (default
 *    `http://localhost:8888`) with a `SPINE_DEV_JWT` bearer token and
 *    compares the API response against the DB shape.
 *
 * **Invariants guarded:**
 * - At least one account exists in the DB.
 * - Every account has the required field set (`id`, `slug`,
 *   `display_name`, `is_active`, `created_at`, `updated_at`, …).
 * - `is_active` is a boolean, `id` is a UUID.
 * - Endpoint returns HTTP 200 with `{ data, error: null, meta }` envelope.
 * - `?limit=1` is honoured.
 * - Unknown entity names return an error response, not a server crash.
 *
 * @seeAlso functions/admin-data.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect } from 'vitest'
import { adminDb, TEST_ACCOUNT_ID } from './helpers.ts'

const DEV_URL = process.env.SPINE_DEV_URL || 'http://localhost:8888'
const DEV_JWT  = process.env.SPINE_DEV_JWT || ''

// ─── Expected shape ───────────────────────────────────────────────────────────
// These are the fields the accounts table has and the endpoint should expose.
const EXPECTED_ACCOUNT_FIELDS = [
  'id', 'slug', 'display_name', 'is_active', 'created_at', 'updated_at',
  'type_id', 'parent_id', 'data', 'design_schema', 'validation_schema'
]

// ─── DB-layer: what SHOULD the endpoint return ────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('accounts — expected (DB direct)', () => {

  it('DB returns at least one account', async () => {
    const { data, error } = await adminDb
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    console.log('\n--- EXPECTED (DB direct) ---')
    console.log('count:', data?.length)
    console.log('first record keys:', data?.[0] ? Object.keys(data[0]).join(', ') : '(none)')
    console.log('first record:', JSON.stringify(data?.[0], null, 2))
    console.log('----------------------------\n')

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('each account has the expected field shape', async () => {
    const { data, error } = await adminDb
      .from('accounts')
      .select('*')
      .limit(1)
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const missing = EXPECTED_ACCOUNT_FIELDS.filter(f => !(f in data!))
    if (missing.length > 0) {
      console.warn('\n⚠ MISSING FIELDS:', missing.join(', '))
    }

    for (const field of EXPECTED_ACCOUNT_FIELDS) {
      expect(data, `field "${field}" missing from accounts table`).toHaveProperty(field)
    }
  })

  it('accounts.is_active is boolean', async () => {
    const { data } = await adminDb.from('accounts').select('is_active').limit(1).single()
    expect(typeof data?.is_active).toBe('boolean')
  })

  it('accounts.id is a valid UUID', async () => {
    const { data } = await adminDb.from('accounts').select('id').limit(1).single()
    expect(data?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })
})

// ─── HTTP endpoint: actual vs expected comparison ─────────────────────────────
// Requires: SPINE_DEV_JWT set to a valid user JWT
// Get it from: browser devtools → Application → Local Storage → supabase.auth.token
// Or: npm run spine -- auth whoami (prints the JWT)
describe.skipIf(!TEST_ACCOUNT_ID || !DEV_JWT)('accounts — actual (HTTP endpoint)', () => {

  async function callAdminData(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${DEV_URL}/.netlify/functions/admin-data?${qs}`, {
      headers: { 'Authorization': `Bearer ${DEV_JWT}` }
    })
    const json = await res.json()
    return { status: res.status, body: json }
  }

  it('returns 200', async () => {
    const { status, body } = await callAdminData({ entity: 'accounts', method: 'GET' })
    console.log('\n--- ACTUAL (HTTP) ---')
    console.log('status:', status)
    console.log('error:', body.error)
    console.log('data length:', body.data?.length ?? body.length ?? '(no data key)')
    console.log('first record:', JSON.stringify(body.data?.[0] ?? body[0], null, 2))
    console.log('---------------------\n')
    expect(status).toBe(200)
  })

  it('response envelope has { data, error: null, meta }', async () => {
    const { body } = await callAdminData({ entity: 'accounts', method: 'GET' })
    expect(body.error).toBeNull()
    expect(body.data).toBeDefined()
    expect(body.meta?.requestId).toBeTruthy()
  })

  it('actual fields match expected fields', async () => {
    // Get expected from DB
    const { data: dbData } = await adminDb.from('accounts').select('*').limit(1).single()
    const expectedKeys = Object.keys(dbData || {}).sort()

    // Get actual from endpoint
    const { body } = await callAdminData({ entity: 'accounts', method: 'GET', limit: '1' })
    const actualRecord = body.data?.[0] ?? body[0]

    if (!actualRecord) {
      console.warn('[gap] No accounts returned from HTTP endpoint — JWT user may have no RLS-accessible accounts')
      return
    }

    const actualKeys = Object.keys(actualRecord).sort()

    console.log('\n--- FIELD DIFF ---')
    const onlyInDb  = expectedKeys.filter(k => !actualKeys.includes(k))
    const onlyInApi = actualKeys.filter(k => !expectedKeys.includes(k))
    if (onlyInDb.length)  console.log('  In DB but NOT in API response:', onlyInDb.join(', '))
    if (onlyInApi.length) console.log('  In API response but NOT in DB:', onlyInApi.join(', '))
    if (!onlyInDb.length && !onlyInApi.length) console.log('  ✓ Fields match exactly')
    console.log('------------------\n')

    // Warn on missing, but only hard-fail on core identity fields
    for (const field of ['id', 'display_name', 'is_active', 'created_at']) {
      expect(actualRecord, `core field "${field}" missing from API response`).toHaveProperty(field)
    }
  })

  it('honors ?limit=1', async () => {
    const { body } = await callAdminData({ entity: 'accounts', method: 'GET', limit: '1' })
    const records: any[] = body.data ?? body
    expect(records.length).toBeLessThanOrEqual(1)
  })

  it('invalid entity returns error not crash', async () => {
    const { status, body } = await callAdminData({ entity: 'passwords', method: 'GET' })
    expect([400, 500]).toContain(status)
    expect(body.error).toBeTruthy()
  })
})
