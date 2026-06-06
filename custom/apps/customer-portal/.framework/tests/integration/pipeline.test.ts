/// <reference types="node" />
/**
 * @module tests/integration/pipeline
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests: `runPipeline` end-to-end against the live DB.
 *
 * **Invariants guarded:**
 * - A pipeline with zero stages inserts a `pipeline_executions` row,
 *   returns `status: 'completed'`, a non-empty `executionId`, and
 *   `durationMs >= 0`.
 * - The written execution record has `status='completed'` and the
 *   correct `pipeline_id` FK.
 * - Calling `runPipeline` with a non-existent UUID throws
 *   `"Pipeline not found or inactive"`.
 *
 * `afterEach` cleans up created pipelines (and their executions) via
 * `cleanupPipelines`.
 *
 * Run with: `npm run test:integration`
 *
 * @seeAlso functions/_shared/pipeline-runner.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterEach } from 'vitest'
import { runPipeline } from '../../functions/_shared/index.ts'
import { makeTestCtx, adminDb, TEST_ACCOUNT_ID, cleanupPipelines } from './helpers.ts'

describe.skipIf(!TEST_ACCOUNT_ID)('runPipeline (integration)', () => {
  const createdPipelineIds: string[] = []

  afterEach(async () => {
    await cleanupPipelines(createdPipelineIds)
    createdPipelineIds.length = 0
  })

  it('executes a pipeline with no stages and records the execution', async () => {
    const ctx = makeTestCtx()

    const { data: pipeline, error: pErr } = await adminDb
      .from('pipelines')
      .insert({
        name: 'Integration Test Pipeline',
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        stages: []
      })
      .select()
      .single()

    if (pErr || !pipeline) throw new Error(`Could not create test pipeline: ${pErr?.message}`)
    createdPipelineIds.push(pipeline.id)

    const result = await runPipeline(pipeline.id, { test: true }, ctx)

    expect(result.status).toBe('completed')
    expect(result.pipelineId).toBe(pipeline.id)
    expect(result.executionId).toBeTruthy()
    expect(result.stages).toHaveLength(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    // Verify execution record was written
    const { data: exec } = await adminDb
      .from('pipeline_executions')
      .select('id, status, pipeline_id')
      .eq('id', result.executionId)
      .single()

    expect(exec?.status).toBe('completed')
    expect(exec?.pipeline_id).toBe(pipeline.id)
  })

  it('throws when pipeline id does not exist', async () => {
    const ctx = makeTestCtx()
    await expect(
      runPipeline('00000000-0000-0000-0000-000000000000', {}, ctx)
    ).rejects.toThrow('Pipeline not found or inactive')
  })
})
