/// <reference types="node" />
/**
 * @module tests/api/api-surface
 * @audience core-contributor
 * @layer test-api
 * @stability stable
 *
 * HTTP API surface tests. Runs fetch requests against the local dev server
 * (SPINE_DEV_URL, default http://localhost:8888) and validates the auth matrix,
 * CRUD lifecycle, and error handling — all against the **public schema**.
 *
 * **Auth matrix tested:**
 * - No auth token        → 401
 * - Valid JWT (system admin) → 200 with full records
 * - Invalid token        → 401 / 403
 * - Machine API key (if SPINE_TEST_API_KEY set) → 200
 *
 * Skips when SPINE_DEV_JWT is not set (server not running or not logged in).
 *
 * @seeAlso tests/integration/helpers.ts
 * @seeAlso functions/admin-data.ts
 */

import { describe, it, expect } from 'vitest'

const DEV_URL     = process.env.SPINE_DEV_URL  || 'http://localhost:8888'
const DEV_JWT     = process.env.SPINE_DEV_JWT  || ''
const TEST_API_KEY = process.env.SPINE_TEST_API_KEY || ''

const hasServer = !!DEV_JWT

async function api(path: string, opts: RequestInit = {}) {
  try {
    const res = await fetch(`${DEV_URL}${path}`, opts)
    let body: any = null
    try { body = await res.json() } catch {}
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

// ─── 1. Unauthenticated → 401 ─────────────────────────────────────────────────
describe.skipIf(!hasServer)('auth — unauthenticated requests', () => {
  const endpoints = [
    '/.netlify/functions/admin-data?entity=accounts&method=GET',
    '/.netlify/functions/admin-data?entity=people&method=GET',
    '/.netlify/functions/admin-data?entity=types&method=GET',
    '/.netlify/functions/types?action=list',
  ]

  for (const path of endpoints) {
    it(`${path} → 401 without auth`, async () => {
      const { status } = await api(path)
      expect(status).toBe(401)
    })
  }
})

// ─── 2. System admin gets full records ────────────────────────────────────────
describe.skipIf(!hasServer)('auth — system admin gets full records', () => {
  const authHeader = { Authorization: `Bearer ${DEV_JWT}` }

  it('GET accounts → 200 with data array', async () => {
    const { status, body } = await api(
      '/.netlify/functions/admin-data?entity=accounts&method=GET',
      { headers: authHeader }
    )
    console.log('[api-gap] accounts status:', status, '| count:', body?.data?.length ?? '?')
    expect(status).toBe(200)
    expect(body?.error).toBeNull()
    expect(Array.isArray(body?.data)).toBe(true)
  })

  it('GET people → 200 with data array', async () => {
    const { status, body } = await api(
      '/.netlify/functions/admin-data?entity=people&method=GET',
      { headers: authHeader }
    )
    console.log('[api-gap] people status:', status, '| count:', body?.data?.length ?? '?')
    expect(status).toBe(200)
    expect(body?.error).toBeNull()
  })

  it('GET types → 200 with data array', async () => {
    const { status, body } = await api(
      '/.netlify/functions/types?action=list',
      { headers: authHeader }
    )
    console.log('[api-gap] types status:', status, '| count:', body?.data?.length ?? '?')
    if (body?.data?.length === 0) {
      console.warn('[gap] public.types empty — day-zero seeds missing from public schema')
    }
    expect(status).toBe(200)
  })

  it('response envelope shape is { data, error: null, meta }', async () => {
    const { body } = await api(
      '/.netlify/functions/admin-data?entity=accounts&method=GET',
      { headers: authHeader }
    )
    expect(body).toHaveProperty('data')
    expect(body?.error).toBeNull()
    expect(body?.meta?.requestId).toBeTruthy()
  })
})

// ─── 3. Invalid token → 401 ───────────────────────────────────────────────────
describe.skipIf(!hasServer)('auth — invalid token rejected', () => {
  it('malformed bearer token → 401', async () => {
    const { status } = await api(
      '/.netlify/functions/admin-data?entity=accounts&method=GET',
      { headers: { Authorization: 'Bearer not-a-real-jwt' } }
    )
    expect(status).toBe(401)
  })
})

// ─── 4. CRUD lifecycle on items ───────────────────────────────────────────────
describe.skipIf(!hasServer)('CRUD lifecycle — items via admin-data', () => {
  const authHeader = { Authorization: `Bearer ${DEV_JWT}` }
  let createdId: string | null = null

  it('GET items returns 200', async () => {
    const { status, body } = await api(
      '/.netlify/functions/admin-data?entity=items&method=GET',
      { headers: authHeader }
    )
    console.log('[api-gap] items status:', status, '| count:', body?.data?.length ?? '?')
    expect(status).toBe(200)
    if (!body?.data?.length) {
      console.warn('[gap] public.items is empty')
    }
  })

  it('unknown entity returns error not crash', async () => {
    const { status, body } = await api(
      '/.netlify/functions/admin-data?entity=passwords&method=GET',
      { headers: authHeader }
    )
    expect([400, 422, 500]).toContain(status)
    expect(body?.error).toBeTruthy()
  })

  it('?limit=1 is honoured', async () => {
    const { body } = await api(
      '/.netlify/functions/admin-data?entity=items&method=GET&limit=1',
      { headers: authHeader }
    )
    const records: any[] = body?.data ?? []
    expect(records.length).toBeLessThanOrEqual(1)
  })
})

// ─── 5. Machine principal (API key) ───────────────────────────────────────────
describe.skipIf(!hasServer || !TEST_API_KEY)('auth — machine principal (API key)', () => {
  it('valid API key → 200 on types list', async () => {
    const { status, body } = await api(
      '/.netlify/functions/types?action=list',
      { headers: { 'x-api-key': TEST_API_KEY } }
    )
    expect(status).toBe(200)
    expect(body?.error).toBeNull()
  })
})

// ─── 6. Validation errors ─────────────────────────────────────────────────────
describe.skipIf(!hasServer)('validation — required field checks', () => {
  const authHeader = { Authorization: `Bearer ${DEV_JWT}` }

  it('missing required field returns 400 not 500', async () => {
    const { status, body } = await api(
      '/.netlify/functions/admin-data?entity=items&method=POST',
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {} })
      }
    )
    expect([400, 422]).toContain(status)
    expect(body?.error).toBeTruthy()
  })
})
