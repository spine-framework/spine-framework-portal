/// <reference types="node" />
/**
 * @module tests/integration/admin-data-people
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests for the `admin-data` function's `people` entity,
 * targeting the **public schema**. Mirrors admin-data-accounts.test.ts.
 *
 * Two surfaces:
 * 1. DB-layer — queries public.people directly via adminDb.
 * 2. HTTP endpoint — hits /api/admin-data?entity=people (skipped without DEV_JWT).
 *
 * Failures surface day-zero gaps in public.people (missing columns, no seed data).
 *
 * @seeAlso functions/admin-data.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterAll } from 'vitest'
import { adminDb, TEST_ACCOUNT_ID } from './helpers.ts'

const DEV_URL = process.env.SPINE_DEV_URL || 'http://localhost:8888'
const DEV_JWT  = process.env.SPINE_DEV_JWT || ''

const createdPeopleIds: string[] = []

afterAll(async () => {
  if (createdPeopleIds.length) {
    await adminDb.from('people').delete().in('id', createdPeopleIds)
  }
})

const EXPECTED_PEOPLE_FIELDS = [
  'id', 'full_name', 'email', 'status', 'is_active',
  'account_id', 'type_id', 'data', 'design_schema', 'created_at', 'updated_at'
]

// ─── DB-layer ─────────────────────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('people — DB direct (public schema)', () => {

  it('public.people table is accessible', async () => {
    const { data, error } = await adminDb
      .from('people')
      .select('*')
      .limit(5)

    console.log('[gap-check] people count:', data?.length ?? 0)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    if (!data || data.length === 0) {
      console.warn('[gap] public.people is EMPTY — day-zero seed may be missing')
    }
  })

  it('people record has expected field shape', async () => {
    const { data, error } = await adminDb
      .from('people')
      .select('*')
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()

    if (!data) {
      console.warn('[gap] No people records to validate field shape')
      return
    }

    const missing = EXPECTED_PEOPLE_FIELDS.filter(f => !(f in data))
    if (missing.length > 0) {
      console.warn('[gap] people missing fields:', missing.join(', '))
    }
    expect(missing).toHaveLength(0)
  })

  it('people.is_active is boolean', async () => {
    const { data } = await adminDb
      .from('people').select('is_active').limit(1).maybeSingle()
    if (!data) return
    expect(typeof data.is_active).toBe('boolean')
  })

  it('people.id is a valid UUID', async () => {
    const { data } = await adminDb
      .from('people').select('id').limit(1).maybeSingle()
    if (!data) return
    expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('can create and retrieve a person in public.people', async () => {
    const { data: type } = await adminDb
      .from('types').select('id').eq('kind', 'person').limit(1).maybeSingle()

    const slug = `test-person-crud-${Date.now()}`
    const { data: created, error: createErr } = await adminDb.from('people').insert({
      slug,
      full_name: 'Test CRUD Person',
      email: `${slug}@spine.test`,
      status: 'active',
      is_active: true,
      account_id: TEST_ACCOUNT_ID,
      type_id: type?.id ?? null,
      data: {}
    }).select('id, slug, full_name').single()

    if (createErr) {
      console.warn('[gap] Failed to insert into public.people:', createErr.message)
      return
    }

    if (created?.id) createdPeopleIds.push(created.id)

    expect(created).toHaveProperty('slug', slug)
    expect(created).toHaveProperty('full_name', 'Test CRUD Person')

    const { data: fetched } = await adminDb
      .from('people').select('id, slug').eq('id', created!.id).single()
    expect(fetched?.slug).toBe(slug)
  })
})

// ─── HTTP endpoint ─────────────────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID || !DEV_JWT)('people — HTTP endpoint', () => {

  async function callAdminData(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${DEV_URL}/.netlify/functions/admin-data?${qs}`, {
      headers: { 'Authorization': `Bearer ${DEV_JWT}` }
    })
    return { status: res.status, body: await res.json() }
  }

  it('returns 200 for people entity', async () => {
    const { status } = await callAdminData({ entity: 'people', method: 'GET' })
    expect(status).toBe(200)
  })

  it('response has { data, error: null, meta } envelope', async () => {
    const { body } = await callAdminData({ entity: 'people', method: 'GET' })
    expect(body.error).toBeNull()
    expect(body.data).toBeDefined()
    expect(body.meta?.requestId).toBeTruthy()
  })

  it('actual fields include core identity fields', async () => {
    const { body } = await callAdminData({ entity: 'people', method: 'GET', limit: '1' })
    const record = body.data?.[0]
    if (!record) {
      console.warn('[gap] No people returned from HTTP endpoint')
      return
    }
    for (const field of ['id', 'full_name', 'email', 'is_active']) {
      expect(record, `field "${field}" missing from API people response`).toHaveProperty(field)
    }
  })
})
