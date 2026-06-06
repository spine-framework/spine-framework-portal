/// <reference types="node" />
/**
 * @module tests/integration/isolation
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests: tenant data isolation.
 *
 * Verifies that data scoped to one account is not visible when querying
 * under a different `account_id`, and that such cross-account queries
 * return empty results (not errors or cross-tenant leakage).
 *
 * **Invariants guarded:**
 * - An item created under `TEST_ACCOUNT_ID` is invisible when queried
 *   under `FAKE_ACCOUNT_ID` (`00000000-…-000000000001`); the query
 *   returns `[]` with `error: null` (not a DB error).
 * - The same item IS visible when queried under the correct
 *   `TEST_ACCOUNT_ID`, and its `title` matches the inserted value.
 *
 * `afterEach` deletes all items created during each test via
 * `cleanupItems`.
 *
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { adminDb, TEST_ACCOUNT_ID, makeTestCtx, cleanupItems } from './helpers.ts'

const FAKE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001'

describe.skipIf(!TEST_ACCOUNT_ID)('tenant isolation', () => {
  const createdItemIds: string[] = []
  let itemTypeId: string

  beforeAll(async () => {
    const { data } = await adminDb.from('types').select('id').eq('kind', 'item').eq('is_active', true).limit(1).single()
    itemTypeId = data?.id ?? ''
  })

  afterEach(async () => {
    await cleanupItems(createdItemIds)
    createdItemIds.length = 0
  })

  it('items from one account are not visible when querying another account', async () => {
    // Create an item in the test account
    const { data: item, error: iErr } = await adminDb
      .from('items')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        type_id: itemTypeId,
        title: 'Isolation Test Item',
        is_active: true
      })
      .select('id')
      .single()

    if (iErr || !item) throw new Error(`Could not create test item: ${iErr?.message}`)
    createdItemIds.push(item.id)

    // Query from a completely different (non-existent) account
    const { data, error } = await adminDb
      .from('items')
      .select('id')
      .eq('account_id', FAKE_ACCOUNT_ID)
      .eq('id', item.id)

    // Should return empty result, NOT an error
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('querying items for the correct account returns them', async () => {
    const { data: item, error: iErr } = await adminDb
      .from('items')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        type_id: itemTypeId,
        title: 'Visibility Test Item',
        is_active: true
      })
      .select('id')
      .single()

    if (iErr || !item) throw new Error(`Could not create test item: ${iErr?.message}`)
    createdItemIds.push(item.id)

    const { data, error } = await adminDb
      .from('items')
      .select('id, title')
      .eq('account_id', TEST_ACCOUNT_ID)
      .eq('id', item.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].title).toBe('Visibility Test Item')
  })
})
