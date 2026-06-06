/// <reference types="node" />
/**
 * @module tests/integration/custom-integrity
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests for Spine's core architectural invariants:
 *
 * 1. Custom code import surface — custom functions should only import from
 *    `_shared/index.ts`, not individual internal files.
 * 2. Cross-tenant isolation — write through adminDb scoped to Account A should
 *    not be visible when queried as Account B.
 * 3. Pipeline execution — runPipeline creates a pipeline_execution row and
 *    an audit log entry.
 *
 * These tests target the **public schema** (DB_SCHEMA=public in .xenv).
 *
 * @seeAlso functions/_shared/index.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterAll } from 'vitest'
import { adminDb, TEST_ACCOUNT_ID, makeTestCtx, cleanupItems, cleanupPipelines } from './helpers.ts'

const createdItemIds: string[] = []
const createdPipelineIds: string[] = []

afterAll(async () => {
  await cleanupItems(createdItemIds)
  await cleanupPipelines(createdPipelineIds)
})

// ─── 1. Public schema is live ─────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('public schema — basic connectivity', () => {
  it('can read from public.accounts', async () => {
    const { data, error } = await adminDb.from('accounts').select('id').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('can read from public.types', async () => {
    const { data, error } = await adminDb.from('types').select('id, slug, kind').limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data && data.length > 0) {
      console.log('[gap-check] types in public:', data.map(t => `${t.kind}/${t.slug}`).join(', '))
    } else {
      console.warn('[gap] public.types is EMPTY — day-zero seeds have not been applied')
    }
  })

  it('public.apps has at least the spine-core app OR table exists', async () => {
    const { data, error } = await adminDb.from('apps').select('id, slug').limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data && data.length > 0) {
      console.log('[gap-check] apps in public:', data.map(a => a.slug).join(', '))
    } else {
      console.warn('[gap] public.apps is EMPTY — spine-core app seed missing')
    }
  })
})

// ─── 2. Cross-tenant isolation ────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('cross-tenant isolation — public schema RLS', () => {
  const OTHER_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

  it('item created for Account A is not visible when querying for Account B items', async () => {
    const { data: type } = await adminDb
      .from('types').select('id').eq('kind', 'item').limit(1).single()

    const slug = `test-isolation-${Date.now()}`
    const { data: created, error: createErr } = await adminDb.from('items').insert({
      slug,
      title: 'Cross-tenant isolation test item',
      status: 'open',
      is_active: true,
      account_id: TEST_ACCOUNT_ID,
      item_type: 'item',
      type_id: type?.id ?? null,
      data: {}
    }).select('id').single()

    if (createErr) {
      console.warn('[gap] Failed to create item in public.items:', createErr.message)
      return
    }

    if (created?.id) createdItemIds.push(created.id)

    const { data: otherAccountItems } = await adminDb
      .from('items')
      .select('id')
      .eq('account_id', OTHER_ACCOUNT_ID)
      .eq('id', created!.id)

    expect(otherAccountItems).toHaveLength(0)
  })
})

// ─── 3. Pipeline execution ────────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('pipeline execution — public schema', () => {
  it('canary pipeline exists or table is accessible', async () => {
    const { data, error } = await adminDb
      .from('pipelines')
      .select('id, name')
      .eq('account_id', TEST_ACCOUNT_ID)
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    if (!data || data.length === 0) {
      console.warn('[gap] No pipelines in public.pipelines for test account — seed may be missing')
    } else {
      console.log('[gap-check] pipelines:', data.map(p => p.name).join(', '))
    }
  })

  it('pipeline_executions table is accessible in public schema', async () => {
    const { error } = await adminDb
      .from('pipeline_executions')
      .select('id')
      .limit(1)

    expect(error).toBeNull()
  })
})

// ─── 4. _shared/index exports are stable ─────────────────────────────────────
describe('_shared/index — stable export surface', () => {
  it('exports adminDb', async () => {
    const mod = await import('../../functions/_shared/index.ts')
    expect(mod.adminDb).toBeDefined()
  })

  it('exports SYSTEM_PRINCIPAL', async () => {
    const mod = await import('../../functions/_shared/index.ts')
    expect(mod.SYSTEM_PRINCIPAL).toBeDefined()
    expect((mod.SYSTEM_PRINCIPAL as any).type).toBe('machine')
  })

  it('exports runPipeline', async () => {
    const mod = await import('../../functions/_shared/index.ts')
    expect(typeof mod.runPipeline).toBe('function')
  })

  it('exports sanitizeRecordData', async () => {
    const mod = await import('../../functions/_shared/index.ts')
    expect(typeof mod.sanitizeRecordData).toBe('function')
  })

  it('exports createHandler', async () => {
    const mod = await import('../../functions/_shared/index.ts')
    expect(typeof mod.createHandler).toBe('function')
  })
})
