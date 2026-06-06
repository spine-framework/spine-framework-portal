/// <reference types="node" />
/**
 * @module tests/integration/schema-validation
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests for schema-driven validation and field stripping.
 * Tests that design_schema is correctly stamped on records in the public schema
 * and that validation_schema is consistent with the design.
 *
 * These tests target the **public schema** (DB_SCHEMA=public in .xenv).
 * Failures indicate day-zero gaps (e.g. missing design_schema on types).
 *
 * @seeAlso functions/_shared/schema-utils.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect } from 'vitest'
import { adminDb, TEST_ACCOUNT_ID } from './helpers.ts'
import { generateValidationSchema } from '../../functions/_shared/schema-utils.ts'

// ─── Types table schema validation ────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('public.types — design_schema integrity', () => {
  it('all active types have a non-empty design_schema', async () => {
    const { data, error } = await adminDb
      .from('types')
      .select('id, slug, kind, design_schema')
      .eq('is_active', true)

    expect(error).toBeNull()

    if (!data || data.length === 0) {
      console.warn('[gap] public.types is EMPTY — no types to validate')
      return
    }

    const missing = data.filter(t => !t.design_schema || Object.keys(t.design_schema).length === 0)
    if (missing.length > 0) {
      console.warn('[gap] Types with empty design_schema:', missing.map(t => `${t.kind}/${t.slug}`).join(', '))
    }

    expect(missing).toHaveLength(0)
  })

  it('all active types have fields key in design_schema', async () => {
    const { data, error } = await adminDb
      .from('types')
      .select('id, slug, kind, design_schema')
      .eq('is_active', true)

    expect(error).toBeNull()
    if (!data || data.length === 0) return

    const noFields = data.filter(t => !t.design_schema?.fields)
    if (noFields.length > 0) {
      console.warn('[gap] Types missing design_schema.fields:', noFields.map(t => `${t.kind}/${t.slug}`).join(', '))
    }
    expect(noFields).toHaveLength(0)
  })

  it('all active types have default_list view in design_schema', async () => {
    const { data } = await adminDb
      .from('types')
      .select('slug, kind, design_schema')
      .eq('is_active', true)
      .eq('ownership', 'pack')

    if (!data || data.length === 0) return

    const noListView = data.filter(t => !t.design_schema?.views?.default_list)
    if (noListView.length > 0) {
      console.warn('[gap] Types missing default_list view:', noListView.map(t => `${t.kind}/${t.slug}`).join(', '))
    }
    expect(noListView).toHaveLength(0)
  })

  it('all active types have default_detail view in design_schema', async () => {
    const { data } = await adminDb
      .from('types')
      .select('slug, kind, design_schema')
      .eq('is_active', true)
      .eq('ownership', 'pack')

    if (!data || data.length === 0) return

    const noDetailView = data.filter(t => !t.design_schema?.views?.default_detail)
    if (noDetailView.length > 0) {
      console.warn('[gap] Types missing default_detail view:', noDetailView.map(t => `${t.kind}/${t.slug}`).join(', '))
    }
    expect(noDetailView).toHaveLength(0)
  })

  it('generateValidationSchema does not throw for any type design_schema', async () => {
    const { data } = await adminDb
      .from('types')
      .select('slug, kind, design_schema')
      .eq('is_active', true)

    if (!data || data.length === 0) return

    for (const type of data) {
      expect(() => generateValidationSchema(type.design_schema ?? {})).not.toThrow()
    }
  })
})

// ─── Runtime records have design_schema stamped ────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('public runtime records — design_schema stamped', () => {
  const tables = ['accounts', 'people', 'items']

  for (const table of tables) {
    it(`${table}: all active records have design_schema set`, async () => {
      const { data, error } = await adminDb
        .from(table)
        .select('id, design_schema')
        .eq('is_active', true)
        .limit(20)

      expect(error).toBeNull()

      if (!data || data.length === 0) {
        console.warn(`[gap] public.${table} has no active records`)
        return
      }

      const unset = data.filter(r => !r.design_schema || Object.keys(r.design_schema).length === 0)
      if (unset.length > 0) {
        console.warn(`[gap] ${table}: ${unset.length} records missing design_schema`)
      }
      expect(unset).toHaveLength(0)
    })
  }
})

// ─── Required system columns ───────────────────────────────────────────────────
describe.skipIf(!TEST_ACCOUNT_ID)('public accounts — required columns present', () => {
  const REQUIRED = ['id', 'slug', 'display_name', 'is_active', 'type_id', 'data', 'design_schema', 'validation_schema', 'created_at', 'updated_at']

  it('accounts table has all required columns', async () => {
    const { data, error } = await adminDb
      .from('accounts')
      .select('*')
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()

    if (!data) {
      console.warn('[gap] public.accounts is EMPTY — cannot verify column shape')
      return
    }

    const missing = REQUIRED.filter(col => !(col in data))
    if (missing.length > 0) {
      console.warn('[gap] accounts missing columns:', missing.join(', '))
    }
    expect(missing).toHaveLength(0)
  })
})
