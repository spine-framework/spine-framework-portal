/// <reference types="node" />
/**
 * @module tests/unit/permissions
 * @audience core-contributor
 * @layer test-unit
 * @stability stable
 *
 * Unit tests for `principal.ts` permission helpers.
 *
 * **Invariants guarded:**
 * - `isSystemAdmin` returns `true` only for humans with the `system_admin`
 *   role; returns `false` for machine principals regardless of scopes.
 * - `machineHasScope` matches exact scopes, wildcard resource scopes
 *   (`resource:*`), and the global wildcard (`*:*`); always returns `false`
 *   for human principals.
 * - `humanHasRole` returns `true` iff the exact role string is in the
 *   principal's `roles` array; always `false` for machine principals.
 *
 * **Fixture contract:** `db.ts` and `middleware.ts` are fully mocked so
 * no network or DB access is required.
 *
 * @seeAlso functions/_shared/principal.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../functions/_shared/db.ts', () => ({
  adminDb: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn()
  }
}))

vi.mock('../../functions/_shared/middleware.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../functions/_shared/middleware.ts')>()
  return { ...actual }
})

import type { Principal } from '../../functions/_shared/principal.ts'

function makePrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    id: 'user-123',
    type: 'human',
    accountId: 'account-123',
    roles: ['member'],
    provenance: {
      sourceType: 'jwt',
      createdBy: 'user-123',
      invokedAt: new Date().toISOString()
    },
    ...overrides
  }
}

function makeCtx(principal: Principal) {
  return {
    principal,
    accountId: principal.accountId,
    db: {},
    requestId: 'test-req-id'
  }
}

describe('isSystemAdmin', () => {
  it('returns true for system_admin role', async () => {
    const { isSystemAdmin } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ roles: ['admin', 'system_admin'] })
    expect(isSystemAdmin(principal)).toBe(true)
  })

  it('returns false for non-admin roles', async () => {
    const { isSystemAdmin } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ roles: ['admin', 'member'] })
    expect(isSystemAdmin(principal)).toBe(false)
  })

  it('returns false for machine principals', async () => {
    const { isSystemAdmin } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({
      type: 'machine',
      roles: undefined,
      scopes: ['*:*']
    })
    expect(isSystemAdmin(principal)).toBe(false)
  })
})

describe('machineHasScope', () => {
  it('matches exact scope', async () => {
    const { machineHasScope } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'machine', scopes: ['items:read', 'people:write'] })
    expect(machineHasScope(principal, 'items:read')).toBe(true)
    expect(machineHasScope(principal, 'items:write')).toBe(false)
  })

  it('matches wildcard resource scope', async () => {
    const { machineHasScope } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'machine', scopes: ['items:*'] })
    expect(machineHasScope(principal, 'items:read')).toBe(true)
    expect(machineHasScope(principal, 'items:write')).toBe(true)
    expect(machineHasScope(principal, 'people:read')).toBe(false)
  })

  it('matches global wildcard *:*', async () => {
    const { machineHasScope } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'machine', scopes: ['*:*'] })
    expect(machineHasScope(principal, 'items:read')).toBe(true)
    expect(machineHasScope(principal, 'anything:anything')).toBe(true)
  })

  it('returns false for human principals', async () => {
    const { machineHasScope } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'human', scopes: ['items:read'] })
    expect(machineHasScope(principal, 'items:read')).toBe(false)
  })

  it('returns false when no scopes assigned', async () => {
    const { machineHasScope } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'machine', scopes: [] })
    expect(machineHasScope(principal, 'items:read')).toBe(false)
  })
})

describe('humanHasRole', () => {
  it('returns true when role is present', async () => {
    const { humanHasRole } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ roles: ['admin', 'member'] })
    expect(humanHasRole(principal, 'admin')).toBe(true)
  })

  it('returns false when role is absent', async () => {
    const { humanHasRole } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ roles: ['member'] })
    expect(humanHasRole(principal, 'admin')).toBe(false)
  })

  it('returns false for machine principals', async () => {
    const { humanHasRole } = await import('../../functions/_shared/principal.ts')
    const principal = makePrincipal({ type: 'machine' })
    expect(humanHasRole(principal, 'admin')).toBe(false)
  })
})

describe('sanitizeRecordData — second surface (config objects)', () => {
  const configRecord = {
    id: 'cfg-1',
    slug: 'my-type',
    name: 'My Type',
    kind: 'item',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    _table: 'types'
  }

  it('system_admin receives full config record', async () => {
    const { sanitizeRecordData } = await import('../../functions/_shared/permissions.ts')
    const principal = makePrincipal({ roles: ['system_admin'] })
    const ctx = makeCtx(principal)
    const result = await sanitizeRecordData(ctx, configRecord, 'types')
    expect(result).toHaveProperty('slug')
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('kind')
  })

  it('machine principal with *:* receives full config record', async () => {
    const { sanitizeRecordData } = await import('../../functions/_shared/permissions.ts')
    const principal = makePrincipal({ type: 'machine', scopes: ['*:*'] })
    const ctx = makeCtx(principal)
    const result = await sanitizeRecordData(ctx, configRecord, 'types')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('slug')
  })

  it('non-admin human receives minimal stub from config record', async () => {
    const { sanitizeRecordData } = await import('../../functions/_shared/permissions.ts')
    const principal = makePrincipal({ roles: ['member'] })
    const ctx = makeCtx(principal)
    const result = await sanitizeRecordData(ctx, configRecord, 'types')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('created_at')
    expect(result).not.toHaveProperty('kind')
    expect(result).not.toHaveProperty('slug')
  })
})
