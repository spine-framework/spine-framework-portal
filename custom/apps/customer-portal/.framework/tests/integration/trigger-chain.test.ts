/// <reference types="node" />
/**
 * @module tests/integration/trigger-chain
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests: pipeline → trigger → downstream pipeline chain.
 *
 * Key question: "did my change kill a downstream automation?"
 * These tests create real DB rows (pipelines + triggers), fire
 * `checkAndFireTriggers` against the live Supabase instance, then
 * assert the full execution chain is reflected in `pipeline_executions`.
 *
 * **Invariants guarded:**
 * - **Canary pipeline** — the zero-stage heartbeat pipeline
 *   (`CANARY_PIPELINE_ID = 00000000-ca4a-4000-8000-000000000001`) must
 *   exist in the live DB; executes to `'completed'` and persists a row
 *   with the correct `trigger_data.source`.
 * - **Trigger fires** — when `checkAndFireTriggers` is called with an
 *   event type and `type_slug` that exactly matches a trigger's config,
 *   the downstream pipeline runs and its execution is persisted with
 *   `status='completed'` and `trigger_data.event='item_created'`.
 * - **Trigger skips** — when `type_slug` in the event data does not
 *   match the trigger's `config.type_slug`, no execution row is written.
 *
 * `afterEach` cleans up in order: executions → triggers → pipelines.
 *
 * @seeAlso functions/_shared/trigger-engine.ts
 * @seeAlso functions/_shared/pipeline-runner.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterEach } from 'vitest'
import { runPipeline, checkAndFireTriggers } from '../../functions/_shared/index.ts'
import { makeTestCtx, adminDb, TEST_ACCOUNT_ID, cleanupPipelines } from './helpers.ts'

const CANARY_PIPELINE_ID = '00000000-ca4a-4000-8000-000000000001'

describe.skipIf(!TEST_ACCOUNT_ID)('canary pipeline', () => {
  it('executes the heartbeat canary and records a completed execution', async () => {
    const ctx = makeTestCtx()
    const result = await runPipeline(CANARY_PIPELINE_ID, { source: 'integration_test' }, ctx)

    expect(result.status).toBe('completed')
    expect(result.pipelineId).toBe(CANARY_PIPELINE_ID)
    expect(result.stages).toHaveLength(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)

    // Verify execution record persisted
    const { data: exec, error } = await adminDb
      .from('pipeline_executions')
      .select('id, status, trigger_data')
      .eq('id', result.executionId)
      .single()

    expect(error).toBeNull()
    expect(exec?.status).toBe('completed')
    expect((exec?.trigger_data as any)?.source).toBe('integration_test')

    // Cleanup
    await adminDb.from('pipeline_executions').delete().eq('id', result.executionId)
  })
})

describe.skipIf(!TEST_ACCOUNT_ID)('pipeline → trigger → pipeline chain', () => {
  const createdPipelineIds: string[] = []
  const createdTriggerIds: string[] = []
  const createdExecutionIds: string[] = []

  afterEach(async () => {
    // Cleanup in order: executions → triggers → pipelines
    if (createdExecutionIds.length) {
      await adminDb.from('pipeline_executions').delete().in('id', createdExecutionIds)
      createdExecutionIds.length = 0
    }
    if (createdTriggerIds.length) {
      await adminDb.from('triggers').delete().in('id', createdTriggerIds)
      createdTriggerIds.length = 0
    }
    await cleanupPipelines(createdPipelineIds)
    createdPipelineIds.length = 0
  })

  it('trigger fires downstream pipeline when item_created event matches conditions', async () => {
    const ctx = makeTestCtx()
    const slug = `integration-chain-${Date.now()}`

    // Create a downstream pipeline (zero stages)
    const { data: downstream, error: pErr } = await adminDb
      .from('pipelines')
      .insert({
        name: 'Chain Test Downstream',
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        stages: []
      })
      .select('id')
      .single()

    if (pErr || !downstream) throw new Error(`Downstream pipeline create failed: ${pErr?.message}`)
    createdPipelineIds.push(downstream.id)

    // Create a trigger: fires on item_created where type_slug = 'integration_test_canary'
    const { data: trigger, error: tErr } = await adminDb
      .from('triggers')
      .insert({
        name: 'Chain Test Trigger',
        trigger_type: 'event',
        event_type: 'item_created',
        pipeline_id: downstream.id,
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        config: {
          type_slug: 'integration_test_canary'
        }
      })
      .select('id')
      .single()

    if (tErr || !trigger) throw new Error(`Trigger create failed: ${tErr?.message}`)
    createdTriggerIds.push(trigger.id)

    // Fire the trigger via checkAndFireTriggers
    await checkAndFireTriggers(
      'item_created',
      'items',
      'fake-item-id-for-test',
      { type_slug: 'integration_test_canary', title: 'Test Item' },
      ctx
    )

    // Verify the downstream pipeline has an execution record
    const { data: execs, error: eErr } = await adminDb
      .from('pipeline_executions')
      .select('id, status, trigger_data')
      .eq('pipeline_id', downstream.id)
      .order('started_at', { ascending: false })
      .limit(1)

    expect(eErr).toBeNull()
    expect(execs).toHaveLength(1)
    expect(execs![0].status).toBe('completed')
    expect((execs![0].trigger_data as any)?.event).toBe('item_created')

    createdExecutionIds.push(execs![0].id)
  })

  it('trigger does NOT fire when type_slug filter does not match', async () => {
    const ctx = makeTestCtx()
    const slug = `integration-nomatch-${Date.now()}`

    const { data: pipeline, error: pErr } = await adminDb
      .from('pipelines')
      .insert({
        name: 'No-match Test Pipeline',
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        stages: []
      })
      .select('id')
      .single()

    if (pErr || !pipeline) throw new Error(`Pipeline create failed: ${pErr?.message}`)
    createdPipelineIds.push(pipeline.id)

    const { data: trigger, error: tErr } = await adminDb
      .from('triggers')
      .insert({
        name: 'No-match Test Trigger',
        trigger_type: 'event',
        event_type: 'item_created',
        pipeline_id: pipeline.id,
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        config: { type_slug: 'expected_type' }
      })
      .select('id')
      .single()

    if (tErr || !trigger) throw new Error(`Trigger create failed: ${tErr?.message}`)
    createdTriggerIds.push(trigger.id)

    // Fire with a DIFFERENT type_slug — trigger should not fire
    await checkAndFireTriggers(
      'item_created',
      'items',
      'fake-item-id',
      { type_slug: 'wrong_type' },
      ctx
    )

    const { data: execs } = await adminDb
      .from('pipeline_executions')
      .select('id')
      .eq('pipeline_id', pipeline.id)

    expect(execs).toHaveLength(0)
  })
})
