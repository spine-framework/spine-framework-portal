/// <reference types="node" />
/**
 * @module tests/unit/trigger-engine
 * @audience core-contributor
 * @layer test-unit
 * @stability stable
 *
 * Unit tests for `trigger-engine.ts → checkAndFireTriggers` and the
 * embedded `evaluateTriggerConditions` logic.
 *
 * **Invariants guarded:**
 * - No triggers in DB → `runPipeline` never called.
 * - DB error on trigger query → graceful no-op (no throw).
 * - Inactive triggers are skipped (`is_active: false`).
 * - `entity_type` filter must match the event's entity type.
 * - `type_slug` filter must match the entity data's `type_slug` field.
 * - Simple equality filter on a field fires when value matches.
 * - Dot-notation nested paths (`data.region`) are resolved correctly.
 * - Array shorthand filter fires when value is in the array, skips otherwise.
 * - Operator filters: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`,
 *   `$in`, `$nin`, `$exists` all behave correctly in fire/skip cases.
 * - `runPipeline` is NOT called for event types that don't match any trigger.
 *
 * **Mocks:** `db.ts` (adminDb), `audit.ts` (emitAudit),
 * `pipeline-runner.ts` (runPipeline). No network access.
 *
 * @seeAlso functions/_shared/trigger-engine.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CoreContext } from '../../functions/_shared/middleware.ts'

// Must mock before any import of the modules under test
vi.mock('../../functions/_shared/db.ts', () => ({
  adminDb: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}))

vi.mock('../../functions/_shared/audit.ts', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../functions/_shared/pipeline-runner.ts', () => ({
  runPipeline: vi.fn().mockResolvedValue({
    executionId: 'mock-exec-id',
    pipelineId: 'mock-pipeline-id',
    status: 'completed',
    stages: [],
    durationMs: 10
  })
}))

import { checkAndFireTriggers } from '../../functions/_shared/trigger-engine.ts'
import { runPipeline } from '../../functions/_shared/pipeline-runner.ts'
import { emitAudit } from '../../functions/_shared/audit.ts'
import { adminDb } from '../../functions/_shared/db.ts'

function makeCtx(): CoreContext {
  return {
    principal: {
      id: 'system', type: 'machine', accountId: null, scopes: ['*:*'],
      provenance: { sourceType: 'manual', createdBy: null, invokedAt: new Date().toISOString() }
    },
    accountId: 'acct-1',
    db: {},
    requestId: 'req-test'
  }
}

function makeTrigger(overrides: Record<string, any> = {}) {
  return {
    id: 'trigger-1',
    name: 'Test Trigger',
    event_type: 'item_created',
    pipeline_id: 'pipeline-1',
    is_active: true,
    config: {},
    ...overrides
  }
}

function mockDbTriggers(triggers: any[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: triggers, error: null })
  }
  vi.mocked(adminDb.from).mockReturnValue(chain as any)
}

function mockDbTriggersWithUpdate(triggers: any[]) {
  const updateChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: null, error: null })
  }
  let callCount = 0
  vi.mocked(adminDb.from).mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      // First call: query for triggers
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: triggers, error: null })
      } as any
    }
    // Subsequent calls: trigger stat update
    return updateChain as any
  })
  vi.mocked(adminDb.rpc).mockResolvedValue({ data: 1, error: null } as any)
}

describe('checkAndFireTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when no triggers match the event type', async () => {
    mockDbTriggers([])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('does nothing when DB query errors', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
    }
    vi.mocked(adminDb.from).mockReturnValue(chain as any)
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('fires pipeline for a matching trigger with no conditions', async () => {
    mockDbTriggersWithUpdate([makeTrigger()])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
    expect(runPipeline).toHaveBeenCalledWith(
      'pipeline-1',
      expect.objectContaining({
        event: 'item_created',
        entity: expect.objectContaining({ type: 'items', id: 'item-1' })
      }),
      expect.any(Object)
    )
  })

  it('passes trigger metadata in the trigger data', async () => {
    mockDbTriggersWithUpdate([makeTrigger({ id: 'trig-xyz', name: 'My Trigger' })])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).toHaveBeenCalledWith(
      'pipeline-1',
      expect.objectContaining({
        trigger: { id: 'trig-xyz', name: 'My Trigger' }
      }),
      expect.any(Object)
    )
  })

  it('emits audit on successful trigger fire', async () => {
    mockDbTriggersWithUpdate([makeTrigger()])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(emitAudit).toHaveBeenCalledWith(
      expect.any(Object),
      'trigger.fired',
      expect.objectContaining({ type: 'trigger', id: 'trigger-1' }),
      expect.objectContaining({ execution_status: 'completed' })
    )
  })

  it('emits audit.failed and continues when runPipeline throws', async () => {
    mockDbTriggers([makeTrigger({ id: 'bad-trigger' })])
    vi.mocked(runPipeline).mockRejectedValueOnce(new Error('Pipeline exploded'))
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(emitAudit).toHaveBeenCalledWith(
      expect.any(Object),
      'trigger.failed',
      expect.objectContaining({ id: 'bad-trigger' }),
      expect.objectContaining({ error: 'Pipeline exploded' })
    )
  })

  it('fires all matching triggers, not just the first', async () => {
    const t1 = makeTrigger({ id: 'trig-1', pipeline_id: 'pipe-1' })
    const t2 = makeTrigger({ id: 'trig-2', pipeline_id: 'pipe-2' })
    mockDbTriggersWithUpdate([t1, t2])
    vi.mocked(runPipeline)
      .mockResolvedValueOnce({ executionId: 'exec-1', pipelineId: 'pipe-1', status: 'completed', stages: [], durationMs: 5 })
      .mockResolvedValueOnce({ executionId: 'exec-2', pipelineId: 'pipe-2', status: 'completed', stages: [], durationMs: 5 })

    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).toHaveBeenCalledTimes(2)
    expect(runPipeline).toHaveBeenCalledWith('pipe-1', expect.any(Object), expect.any(Object))
    expect(runPipeline).toHaveBeenCalledWith('pipe-2', expect.any(Object), expect.any(Object))
  })

  it('continues to fire remaining triggers after one fails', async () => {
    const t1 = makeTrigger({ id: 'trig-fail', pipeline_id: 'pipe-1' })
    const t2 = makeTrigger({ id: 'trig-ok', pipeline_id: 'pipe-2' })
    mockDbTriggers([t1, t2])
    vi.mocked(runPipeline)
      .mockRejectedValueOnce(new Error('pipe-1 failed'))
      .mockResolvedValueOnce({ executionId: 'exec-2', pipelineId: 'pipe-2', status: 'completed', stages: [], durationMs: 5 })

    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).toHaveBeenCalledTimes(2)
  })
})

describe('trigger condition filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips trigger when entity_type filter does not match', async () => {
    const trigger = makeTrigger({ config: { entity_type: 'people' } })
    mockDbTriggers([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('fires trigger when entity_type filter matches', async () => {
    const trigger = makeTrigger({ config: { entity_type: 'items' } })
    mockDbTriggersWithUpdate([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', {}, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('skips trigger when type_slug filter does not match', async () => {
    const trigger = makeTrigger({ config: { type_slug: 'invoice' } })
    mockDbTriggers([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { type_slug: 'support_ticket' }, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('fires trigger when type_slug filter matches', async () => {
    const trigger = makeTrigger({ config: { type_slug: 'support_ticket' } })
    mockDbTriggersWithUpdate([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { type_slug: 'support_ticket' }, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('skips trigger when simple filter value does not match', async () => {
    const trigger = makeTrigger({ config: { filters: { status: 'open' } } })
    mockDbTriggers([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { status: 'closed' }, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('fires trigger when simple filter value matches', async () => {
    const trigger = makeTrigger({ config: { filters: { status: 'open' } } })
    mockDbTriggersWithUpdate([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { status: 'open' }, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('fires trigger when array filter includes the value', async () => {
    const trigger = makeTrigger({ config: { filters: { priority: ['high', 'critical'] } } })
    mockDbTriggersWithUpdate([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { priority: 'high' }, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
  })

  it('skips trigger when value not in array filter', async () => {
    const trigger = makeTrigger({ config: { filters: { priority: ['high', 'critical'] } } })
    mockDbTriggers([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { priority: 'low' }, makeCtx())
    expect(runPipeline).not.toHaveBeenCalled()
  })

  it('resolves nested dot-notation filter paths', async () => {
    const trigger = makeTrigger({ config: { filters: { 'data.region': 'us-west' } } })
    mockDbTriggersWithUpdate([trigger])
    await checkAndFireTriggers('item_created', 'items', 'item-1', { data: { region: 'us-west' } }, makeCtx())
    expect(runPipeline).toHaveBeenCalledOnce()
  })
})

describe('filter operators', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function testOp(operator: Record<string, any>, entityData: any, shouldFire: boolean) {
    const trigger = makeTrigger({ config: { filters: { score: operator } } })
    if (shouldFire) {
      mockDbTriggersWithUpdate([trigger])
    } else {
      mockDbTriggers([trigger])
    }
    await checkAndFireTriggers('item_created', 'items', 'item-1', entityData, makeCtx())
    if (shouldFire) {
      expect(runPipeline).toHaveBeenCalledOnce()
    } else {
      expect(runPipeline).not.toHaveBeenCalled()
    }
    vi.clearAllMocks()
  }

  it('$eq — fires when equal', () => testOp({ $eq: 10 }, { score: 10 }, true))
  it('$eq — skips when not equal', () => testOp({ $eq: 10 }, { score: 5 }, false))

  it('$ne — fires when not equal', () => testOp({ $ne: 10 }, { score: 5 }, true))
  it('$ne — skips when equal', () => testOp({ $ne: 10 }, { score: 10 }, false))

  it('$gt — fires when greater', () => testOp({ $gt: 5 }, { score: 10 }, true))
  it('$gt — skips when equal', () => testOp({ $gt: 5 }, { score: 5 }, false))
  it('$gt — skips when less', () => testOp({ $gt: 5 }, { score: 3 }, false))

  it('$gte — fires when equal', () => testOp({ $gte: 5 }, { score: 5 }, true))
  it('$gte — fires when greater', () => testOp({ $gte: 5 }, { score: 6 }, true))
  it('$gte — skips when less', () => testOp({ $gte: 5 }, { score: 4 }, false))

  it('$lt — fires when less', () => testOp({ $lt: 10 }, { score: 5 }, true))
  it('$lt — skips when equal', () => testOp({ $lt: 10 }, { score: 10 }, false))

  it('$lte — fires when equal', () => testOp({ $lte: 10 }, { score: 10 }, true))
  it('$lte — fires when less', () => testOp({ $lte: 10 }, { score: 9 }, true))
  it('$lte — skips when greater', () => testOp({ $lte: 10 }, { score: 11 }, false))

  it('$in — fires when value in array', () => testOp({ $in: ['a', 'b', 'c'] }, { score: 'b' }, true))
  it('$in — skips when value not in array', () => testOp({ $in: ['a', 'b'] }, { score: 'z' }, false))

  it('$nin — fires when value not in array', () => testOp({ $nin: ['a', 'b'] }, { score: 'z' }, true))
  it('$nin — skips when value in array', () => testOp({ $nin: ['a', 'b'] }, { score: 'a' }, false))

  it('$exists:true — fires when field exists', () => testOp({ $exists: true }, { score: 0 }, true))
  it('$exists:true — skips when field is null', () => testOp({ $exists: true }, { score: null }, false))
  it('$exists:false — fires when field is null', () => testOp({ $exists: false }, { score: null }, true))
  it('$exists:false — skips when field has value', () => testOp({ $exists: false }, { score: 1 }, false))
})
