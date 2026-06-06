/// <reference types="node" />
/**
 * @module tests/unit/pipeline-runner
 * @audience core-contributor
 * @layer test-unit
 * @stability stable
 *
 * Unit tests for `pipeline-runner.ts → runPipeline`.
 *
 * **Invariants guarded:**
 * - `runPipeline` throws `"Pipeline not found or inactive"` for unknown IDs.
 * - Execution record creation failure propagates correctly.
 * - A pipeline with zero stages completes and returns `status: 'completed'`.
 * - Stage success marks the stage `status: 'success'`.
 * - Stage failure marks `status: 'failed'`; pipeline result is `'failed'`.
 * - `continue_on_error: true` stages do not abort the run on failure.
 * - `update_item` handler returns `{ success: true }` on successful DB write.
 * - `create_record` handler throws when `entity` or `data` is missing.
 * - `send_notification` handler succeeds with zero recipients (no-op).
 * - `run_pipeline` handler throws when `pipeline_id` is absent.
 * - `run_pipeline` prevents self-recursion via `config._pipelineId` guard.
 * - Unknown `handler_module` marks the stage `status: 'failed'` with
 *   `"Unknown handler module"` error.
 * - `emitAudit` is called with `pipeline.completed` / `pipeline.failed`.
 *
 * **Mocks:** `db.ts` (adminDb), `audit.ts` (emitAudit). No network access.
 *
 * @seeAlso functions/_shared/pipeline-runner.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CoreContext } from '../../functions/_shared/middleware.ts'

vi.mock('../../functions/_shared/db.ts', () => ({
  adminDb: { from: vi.fn(), rpc: vi.fn() }
}))

vi.mock('../../functions/_shared/audit.ts', () => ({
  emitAudit: vi.fn().mockResolvedValue(undefined)
}))

import { adminDb } from '../../functions/_shared/db.ts'
import { emitAudit } from '../../functions/_shared/audit.ts'
import { runPipeline } from '../../functions/_shared/pipeline-runner.ts'

function makeCtx(overrides: Partial<CoreContext> = {}): CoreContext {
  return {
    principal: {
      id: 'system', type: 'machine', accountId: null, scopes: ['*:*'],
      provenance: { sourceType: 'manual', createdBy: null, invokedAt: new Date().toISOString() }
    },
    accountId: 'acct-test',
    db: {},
    requestId: 'req-test',
    ...overrides
  }
}

const EXEC_ID = 'exec-abc'

/** Wire up adminDb.from to return pipeline + execution records */
function mockPipeline(stages: any[]) {
  vi.mocked(adminDb.from).mockImplementation((table: string) => {
    if (table === 'pipelines') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'pipe-1', stages, is_active: true },
          error: null
        })
      } as any
    }
    if (table === 'pipeline_executions') {
      return {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
      } as any
    }
    // Default: actions table or others
    return {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any
  })
}

function mockAction(handlerName: string, extras: Record<string, any> = {}) {
  return {
    id: 'action-1',
    slug: handlerName,
    handler: handlerName,
    handler_module: 'functions',
    config: {},
    is_active: true,
    ...extras
  }
}

/** Wire actions table to return the given action record */
function mockPipelineWithAction(stages: any[], action: any) {
  vi.mocked(adminDb.from).mockImplementation((table: string) => {
    if (table === 'pipelines') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages, is_active: true }, error: null })
      } as any
    }
    if (table === 'pipeline_executions') {
      return {
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
      } as any
    }
    if (table === 'actions') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: action, error: null })
      } as any
    }
    return {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'r-1' }, error: null })
    } as any
  })
}

describe('runPipeline — lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when pipeline is not found', async () => {
    vi.mocked(adminDb.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'No rows' } })
    } as any)
    await expect(runPipeline('bad-id', {}, makeCtx())).rejects.toThrow('Pipeline not found or inactive')
  })

  it('throws when pipeline exists but is_active is null', async () => {
    vi.mocked(adminDb.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null })
    } as any)
    await expect(runPipeline('inactive-id', {}, makeCtx())).rejects.toThrow('Pipeline not found or inactive')
  })

  it('throws when execution record cannot be created', async () => {
    vi.mocked(adminDb.from).mockImplementation((table: string) => {
      if (table === 'pipelines') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages: [], is_active: true }, error: null })
        } as any
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
      } as any
    })
    await expect(runPipeline('pipe-1', {}, makeCtx())).rejects.toThrow('Failed to create execution')
  })

  it('returns completed with zero stages and correct shape', async () => {
    mockPipeline([])
    const result = await runPipeline('pipe-1', { x: 1 }, makeCtx())
    expect(result.status).toBe('completed')
    expect(result.executionId).toBe(EXEC_ID)
    expect(result.pipelineId).toBe('pipe-1')
    expect(result.stages).toHaveLength(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeUndefined()
  })

  it('emits pipeline.completed audit on success', async () => {
    mockPipeline([])
    await runPipeline('pipe-1', {}, makeCtx())
    expect(emitAudit).toHaveBeenCalledWith(
      expect.any(Object),
      'pipeline.completed',
      expect.objectContaining({ type: 'pipeline_execution', id: EXEC_ID }),
      expect.objectContaining({ pipeline_id: 'pipe-1' })
    )
  })
})

describe('runPipeline — stage execution', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns failed status and error when action not found', async () => {
    const stages = [{ stage_type: 'ghost_action' }]
    vi.mocked(adminDb.from).mockImplementation((table: string) => {
      if (table === 'pipelines') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages, is_active: true }, error: null })
        } as any
      }
      if (table === 'pipeline_executions') {
        return {
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
        } as any
      }
      // actions not found
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
      } as any
    })

    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.status).toBe('failed')
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/Action not found/)
    expect(result.error).toMatch(/Stage 0.*failed/)
  })

  it('returns failed status and emits pipeline.failed audit on stage failure', async () => {
    const stages = [{ stage_type: 'bad_action' }]
    vi.mocked(adminDb.from).mockImplementation((table: string) => {
      if (table === 'pipelines') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages, is_active: true }, error: null })
        } as any
      }
      if (table === 'pipeline_executions') {
        return {
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } })
      } as any
    })

    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.status).toBe('failed')
    expect(emitAudit).toHaveBeenCalledWith(
      expect.any(Object),
      'pipeline.failed',
      expect.objectContaining({ id: EXEC_ID }),
      expect.any(Object)
    )
  })

  it('continues past a failed stage when continue_on_error is true', async () => {
    const stages = [
      { stage_type: 'bad_one', continue_on_error: true },
      { stage_type: 'good_one' }
    ]
    vi.mocked(adminDb.from).mockImplementation((table: string) => {
      if (table === 'pipelines') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages, is_active: true }, error: null })
        } as any
      }
      if (table === 'pipeline_executions') {
        return {
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
        } as any
      }
      if (table === 'actions') {
        let actionCall = 0
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => {
            actionCall++
            return {
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue(
                actionCall === 1
                  ? { data: null, error: { message: 'bad action' } }
                  : { data: mockAction('good_one'), error: null }
              )
            }
          })
        } as any
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'r-1' }, error: null })
      } as any
    })

    const result = await runPipeline('pipe-1', {}, makeCtx())
    // First stage failed but pipeline continued — will fail on second stage too (unknown handler 'good_one')
    // but the important thing is both stages were attempted
    expect(result.stages).toHaveLength(2)
    expect(result.stages[0].status).toBe('failed')
  })
})

describe('built-in stage handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('update_item: throws when entity or record_id missing', async () => {
    const stages = [{ stage_type: 'update_item', config: {} }]
    mockPipelineWithAction(stages, mockAction('update_item'))
    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/entity and record_id are required/)
  })

  it('update_item: succeeds when entity + record_id + data provided', async () => {
    const stages = [{ stage_type: 'update_item', config: { entity: 'items', record_id: 'item-1', data: { status: 'done' } } }]
    mockPipelineWithAction(stages, mockAction('update_item'))
    // items.update chain will return the default mock: { data: { id: 'r-1' }, error: null }
    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('success')
    expect(result.stages[0].output).toMatchObject({ success: true })
  })

  it('create_record: throws when entity or data missing', async () => {
    const stages = [{ stage_type: 'create_record', config: { entity: 'items' } }]
    mockPipelineWithAction(stages, mockAction('create_record'))
    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/entity and data are required/)
  })

  it('send_notification: succeeds with empty recipients (no-op)', async () => {
    const stages = [{ stage_type: 'send_notification', config: { message: 'Hello', recipients: [] } }]
    mockPipelineWithAction(stages, mockAction('send_notification'))
    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('success')
    expect(result.stages[0].output).toMatchObject({ success: true, notified_count: 0 })
  })

  it('run_pipeline: throws when pipeline_id missing', async () => {
    const stages = [{ stage_type: 'run_pipeline', config: {} }]
    mockPipelineWithAction(stages, mockAction('run_pipeline'))
    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/pipeline_id is required/)
  })

  it('run_pipeline: prevents self-recursion', async () => {
    // Stage config._pipelineId === pipeline_id — recursion guard should fire
    const stages = [{ stage_type: 'run_pipeline', config: { pipeline_id: 'pipe-1' } }]
    mockPipelineWithAction(stages, mockAction('run_pipeline'))
    const result = await runPipeline('pipe-1', {}, makeCtx())
    // config._pipelineId gets injected as 'pipe-1' by runPipeline itself
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/Recursive pipeline execution prevented/)
  })

  it('throws for unknown handler module', async () => {
    const stages = [{ stage_type: 'mystery_stage' }]
    vi.mocked(adminDb.from).mockImplementation((table: string) => {
      if (table === 'pipelines') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'pipe-1', stages, is_active: true }, error: null })
        } as any
      }
      if (table === 'pipeline_executions') {
        return {
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: { id: EXEC_ID }, error: null })
        } as any
      }
      if (table === 'actions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'a-1', handler: 'mystery', handler_module: 'alien', config: {} },
            error: null
          })
        } as any
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }) } as any
    })

    const result = await runPipeline('pipe-1', {}, makeCtx())
    expect(result.stages[0].status).toBe('failed')
    expect(result.stages[0].error).toMatch(/Unknown handler module/)
  })
})
