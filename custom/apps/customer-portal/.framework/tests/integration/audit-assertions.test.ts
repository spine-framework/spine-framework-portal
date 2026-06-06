/// <reference types="node" />
/**
 * @module tests/integration/audit-assertions
 * @audience core-contributor
 * @layer test-integration
 * @stability stable
 *
 * Integration tests: audit trail correctness.
 *
 * The `audit_logs` table is the ground truth for observability. These
 * tests verify that core runtime operations emit the expected audit
 * records to the live database — if an IDE change silences `emitAudit`,
 * these tests will catch it.
 *
 * **Invariants guarded:**
 * - A successful pipeline run writes a `pipeline.completed` audit row
 *   with `target_type='pipeline_execution'` and the correct
 *   `metadata.pipeline_id`.
 * - The audit row carries the correct `principal_id` (`'system'`) and
 *   `account_id` from the `CoreContext`.
 * - A failing pipeline run (bad stage) writes a `pipeline.failed` audit
 *   row with a non-empty `metadata.error`.
 * - Pipelines that never ran produce zero audit entries for a fabricated
 *   execution UUID.
 *
 * Uses the canary pipeline (`CANARY_PIPELINE_ID`) which must exist in
 * the live DB with zero stages. `afterEach` deletes created execution
 * rows; audit rows are left intact (append-only).
 *
 * @seeAlso functions/_shared/audit.ts
 * @seeAlso tests/integration/helpers.ts
 */

import { describe, it, expect, afterEach } from 'vitest'
import { runPipeline } from '../../functions/_shared/index.ts'
import { makeTestCtx, adminDb, TEST_ACCOUNT_ID, cleanupPipelines } from './helpers.ts'

const CANARY_PIPELINE_ID = '00000000-ca4a-4000-8000-000000000001'

describe.skipIf(!TEST_ACCOUNT_ID)('audit trail: pipeline execution', () => {
  const executionIds: string[] = []

  afterEach(async () => {
    if (executionIds.length) {
      // Audit logs are append-only — just clean up executions
      await adminDb.from('pipeline_executions').delete().in('id', executionIds)
      executionIds.length = 0
    }
  })

  it('emits a pipeline.completed audit record after successful execution', async () => {
    const ctx = makeTestCtx()
    const result = await runPipeline(CANARY_PIPELINE_ID, { source: 'audit_test' }, ctx)
    executionIds.push(result.executionId)

    expect(result.status).toBe('completed')

    // Audit log should have a pipeline.completed entry
    const q1: any = adminDb
      .from('logs')
      .select('message, metadata, account_id')
      .eq('source', 'audit')
      .like('message', 'pipeline.completed%')
      .filter('metadata->target->>id', 'eq', result.executionId)
      .order('created_at', { ascending: false })
      .limit(1)
    const { data: auditRows, error } = await q1

    expect(error).toBeNull()
    expect(auditRows).toHaveLength(1)
    expect((auditRows![0].metadata as any)?.target?.type).toBe('pipeline_execution')
    expect((auditRows![0].metadata as any)?.pipeline_id).toBe(CANARY_PIPELINE_ID)
  })

  it('audit record contains principal_id and account_id', async () => {
    const ctx = makeTestCtx()
    const result = await runPipeline(CANARY_PIPELINE_ID, { source: 'principal_audit_test' }, ctx)
    executionIds.push(result.executionId)

    const q2: any = adminDb
      .from('logs')
      .select('message, metadata, account_id')
      .eq('source', 'audit')
      .like('message', 'pipeline.completed%')
      .filter('metadata->target->>id', 'eq', result.executionId)
      .limit(1)
    const { data: auditRows } = await q2

    expect(auditRows).toHaveLength(1)
    // System principal id stored in metadata
    expect((auditRows![0].metadata as any)?.principal?.id).toBe('system')
    // Account id from ctx
    expect(auditRows![0].account_id).toBe(TEST_ACCOUNT_ID)
  })
})

describe.skipIf(!TEST_ACCOUNT_ID)('audit trail: failed pipeline', () => {
  const pipelineIds: string[] = []
  const executionIds: string[] = []

  afterEach(async () => {
    if (executionIds.length) {
      await adminDb.from('pipeline_executions').delete().in('id', executionIds)
      executionIds.length = 0
    }
    await cleanupPipelines(pipelineIds)
    pipelineIds.length = 0
  })

  it('emits pipeline.failed audit when a stage fails', async () => {
    const ctx = makeTestCtx()
    const slug = `audit-fail-test-${Date.now()}`

    // Pipeline with a stage that references a non-existent action
    const { data: pipeline, error: pErr } = await adminDb
      .from('pipelines')
      .insert({
        name: 'Audit Fail Test Pipeline',
        account_id: TEST_ACCOUNT_ID,
        is_active: true,
        stages: [{ stage_type: 'definitely_does_not_exist_action' }]
      })
      .select('id')
      .single()

    if (pErr || !pipeline) throw new Error(`Pipeline create failed: ${pErr?.message}`)
    pipelineIds.push(pipeline.id)

    const result = await runPipeline(pipeline.id, { source: 'audit_fail_test' }, ctx)
    executionIds.push(result.executionId)

    expect(result.status).toBe('failed')

    // Should have a pipeline.failed audit entry
    const q3: any = adminDb
      .from('logs')
      .select('message, metadata, account_id')
      .eq('source', 'audit')
      .like('message', 'pipeline.failed%')
      .filter('metadata->target->>id', 'eq', result.executionId)
      .limit(1)
    const { data: auditRows, error } = await q3

    expect(error).toBeNull()
    expect(auditRows).toHaveLength(1)
    expect((auditRows![0].metadata as any)?.pipeline_id).toBe(pipeline.id)
    expect((auditRows![0].metadata as any)?.error).toBeTruthy()
  })
})

describe.skipIf(!TEST_ACCOUNT_ID)('audit trail: no phantom entries', () => {
  it('does not create audit entries for pipelines that never ran', async () => {
    const fakePipelineId = '00000000-0000-0000-0000-ffffffffffff'
    const fakeExecId = '00000000-0000-0000-0000-eeeeeeeeeeee'

    const q4: any = adminDb
      .from('logs')
      .select('id')
      .eq('source', 'audit')
      .filter('metadata->target->>id', 'eq', fakeExecId)
    const { data: auditRows } = await q4

    expect(auditRows).toHaveLength(0)
  })
})
