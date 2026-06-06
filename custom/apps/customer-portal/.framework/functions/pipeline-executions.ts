/**
 * @module pipeline-executions
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Lifecycle management API for the `pipeline_executions` table. Records
 * track individual pipeline runs: status progression (pending → running →
 * completed/failed/cancelled), timing, trigger data, and result payloads.
 *
 * **Routed by:** `GET/POST/PATCH /.netlify/functions/pipeline-executions`
 *
 * **Actions:**
 * | method | ?action  | handler    |
 * |--------|----------|------------|
 * | GET    | list     | list       |
 * | GET    | running  | getRunning |
 * | GET    | stats    | getStats   |
 * | POST   | cleanup  | cleanup    |
 * | GET    | ?id      | get        |
 * | GET    | (default)| list       |
 * | POST   | —        | create     |
 * | PATCH  | start    | start      |
 * | PATCH  | complete | complete   |
 * | PATCH  | cancel   | cancel     |
 *
 * **Status FSM:** pending → running → completed | failed | cancelled
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped to account).
 * Account context required.
 *
 * **Column reference:**
 * `id`, `pipeline_id`, `status`, `trigger_data`, `result`, `error_message`,
 * `started_at`, `completed_at`, `duration_ms`, `created_by`, `account_id`, `created_at`
 *
 * @seeAlso pipelines.ts (pipeline_id FK source)
 * @seeAlso pipeline-runner.ts (runPipeline — calls create/start/complete)
 * @seeAlso audit.ts (emitLog for pipeline_execution.* events)
 */

import { createHandler, json, error, parseBody } from './_shared/middleware'
import { emitLog } from './_shared/audit'

const SELECT_WITH_JOINS = `
  *,
  pipeline:pipelines(id, name, trigger_type),
  triggered_by_person:people!pipeline_executions_created_by_fkey(id, full_name, email)
`

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_LIST_1_0_0
 * @version     1.0.0
 * @hash        499006790777b78f0eb610474f6869e94869b5b244d1ecedbb0e216cf68bae70
 * @macro       Pipeline Executions List Handler
 * @micro       Lists pipeline executions with filtering and joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of execution records with pipeline and person joins
 * @depends-on  [createHandler, SELECT_WITH_JOINS]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries with joins]
 * @tags        pipeline-executions, list, crud, pagination
 */
export const list = createHandler(async (ctx, body) => {
  const { pipeline_id, status, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('pipeline_executions')
    .select(SELECT_WITH_JOINS)
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })

  if (pipeline_id) query = query.eq('pipeline_id', pipeline_id)
  if (status) query = query.eq('status', status)

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return data
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_GET_1_0_0
 * @version     1.0.0
 * @hash        b148fbec727984f7623d1fa94ae20dd0550056d5c886b0994651f119dbc68521
 * @macro       Pipeline Execution Get Handler
 * @micro       Returns single pipeline execution record with joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Execution record with pipeline and person joins
 * @depends-on  [createHandler, SELECT_WITH_JOINS]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query with joins]
 * @tags        pipeline-executions, get, crud, single-record
 */
export const get = createHandler(async (ctx, body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Execution ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .select(SELECT_WITH_JOINS)
    .eq('id', id)
    .single()

  if (err) throw err

  return data
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        fb1d51a8ca0e30e0d151147edde5516c01a51f2cfcad64105ff07937aa430924
 * @macro       Pipeline Execution Create Handler
 * @micro       Creates execution record in pending status with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — pipeline_id and optional trigger_data
 * @outputs     {execution_id: string} — ID of created execution
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing, pipeline-runner.ts]
 * @side-effects [DB insert, audit logging]
 * @tags        pipeline-executions, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { pipeline_id, trigger_data } = body

  if (!pipeline_id) {
    throw new Error('Pipeline ID is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .insert({
      pipeline_id,
      status: 'pending',
      trigger_data: trigger_data || {},
      created_by: ctx.principal?.id || null,
      account_id: ctx.accountId,
    })
    .select('id')
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline_execution.created',
    { type: 'pipeline_execution', id: data?.id },
    { after: { pipeline_id } }
  )

  return { execution_id: data?.id }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_START ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_START_1_0_0
 * @version     1.0.0
 * @hash        25eeada82be4fff26606dc6e784b6e0accaaebaee08514577368cdd146f39aaf
 * @macro       Pipeline Execution Start Handler
 * @micro       Transitions execution from pending to running with timestamp
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — execution id to start
 * @outputs     {success: true} — Confirmation of successful start
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing, pipeline-runner.ts]
 * @side-effects [DB update, audit logging]
 * @tags        pipeline-executions, start, state-transition, audit
 */
export const start = createHandler(async (ctx, body) => {
  const { id } = body

  if (!id) {
    throw new Error('Execution ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline_execution.started',
    { type: 'pipeline_execution', id },
    { after: { status: 'running' } }
  )

  return { success: true }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_START ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_COMPLETE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_COMPLETE_1_0_0
 * @version     1.0.0
 * @hash        088db36524718ec6d8d85e1051aa5d1c4fc31fb796f284bc1526c195d4686dff
 * @macro       Pipeline Execution Complete Handler
 * @micro       Transitions execution to completed/failed with duration calculation
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — id, output_data, and optional error_message
 * @outputs     {success: true} — Confirmation of successful completion
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing, pipeline-runner.ts]
 * @side-effects [DB read for started_at, DB update, audit logging]
 * @tags        pipeline-executions, complete, state-transition, audit
 */
export const complete = createHandler(async (ctx, body) => {
  const { id, output_data, error_message } = body

  if (!id) {
    throw new Error('Execution ID is required')
  }

  const now = new Date().toISOString()
  const finalStatus = error_message ? 'failed' : 'completed'

  // Fetch started_at to compute duration
  const { data: existing } = await ctx.db
    .from('pipeline_executions')
    .select('started_at')
    .eq('id', id)
    .single()

  const duration_ms = existing?.started_at
    ? Math.round(Date.now() - new Date(existing.started_at).getTime())
    : null

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .update({
      status: finalStatus,
      result: output_data || {},
      error_message: error_message || null,
      completed_at: now,
      duration_ms,
    })
    .eq('id', id)
    .select('id')
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline_execution.completed',
    { type: 'pipeline_execution', id },
    { after: { status: finalStatus, error_message } }
  )

  return { success: true }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_COMPLETE ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_CANCEL ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_CANCEL_1_0_0
 * @version     1.0.0
 * @hash        f45e336099afeb28cb3db099fa428d8637e07876dcabf7ec85de844c25b43d97
 * @macro       Pipeline Execution Cancel Handler
 * @micro       Cancels execution by setting status to cancelled with timestamp
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — execution id to cancel
 * @outputs     {success: true} — Confirmation of successful cancellation
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        pipeline-executions, cancel, state-transition, audit
 */
export const cancel = createHandler(async (ctx, body) => {
  const { id } = body

  if (!id) {
    throw new Error('Execution ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline_execution.cancelled',
    { type: 'pipeline_execution', id },
    { after: { status: 'cancelled' } }
  )

  return { success: true }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_CANCEL ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_GET_RUNNING ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_GET_RUNNING_1_0_0
 * @version     1.0.0
 * @hash        d43691d1d9063a7421eae3b32ede4bb603efa7b2faf635861f66178fde5641b6
 * @macro       Running Pipeline Executions Handler
 * @micro       Returns currently running executions with optional pipeline filter
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of running execution records with joins
 * @depends-on  [createHandler, SELECT_WITH_JOINS]
 * @depended-by [Netlify function routing]
 * @side-effects [DB query with joins]
 * @tags        pipeline-executions, running, status-filter, monitoring
 */
export const getRunning = createHandler(async (ctx, body) => {
  const { pipeline_id } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('pipeline_executions')
    .select(SELECT_WITH_JOINS)
    .eq('account_id', ctx.accountId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })

  if (pipeline_id) query = query.eq('pipeline_id', pipeline_id)

  const { data, error: err } = await query

  if (err) throw err

  return data
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_GET_RUNNING ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_GET_STATS ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_GET_STATS_1_0_0
 * @version     1.0.0
 * @hash        f80bc6b6b830d1bafcd7d02ecac50c78cab10ceef7441dc477b3193a7b29143e
 * @macro       Pipeline Executions Statistics Handler
 * @micro       Returns execution counts by status with filtering options
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     {total, completed, failed, running} — Status count statistics
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB count query, aggregation]
 * @tags        pipeline-executions, stats, analytics, monitoring
 */
export const getStats = createHandler(async (ctx, body) => {
  const { pipeline_id, date_from, date_to } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('pipeline_executions')
    .select('id, status')
    .eq('account_id', ctx.accountId)

  if (pipeline_id) query = query.eq('pipeline_id', pipeline_id)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to)

  const { data, error: err } = await query

  if (err) throw err

  const rows = data || []
  return {
    total: rows.length,
    completed: rows.filter((r: any) => r.status === 'completed').length,
    failed: rows.filter((r: any) => r.status === 'failed').length,
    running: rows.filter((r: any) => r.status === 'running').length,
  }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_GET_STATS ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_CLEANUP ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_CLEANUP_1_0_0
 * @version     1.0.0
 * @hash        713c36d875b9e210b16504c324491c66485681a47265ab8cd228c66be58386d4
 * @macro       Pipeline Executions Cleanup Handler
 * @micro       Deletes old execution records beyond retention period
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — days_to_keep (default 30) and optional status_filter
 * @outputs     {deleted_count: number} — Number of deleted execution records
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete by date, audit logging]
 * @tags        pipeline-executions, cleanup, retention, maintenance
 */
export const cleanup = createHandler(async (ctx, body) => {
  const { days_to_keep = 30, status_filter } = body

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - parseInt(days_to_keep.toString()))

  let query = ctx.db
    .from('pipeline_executions')
    .delete()
    .lt('created_at', cutoff.toISOString())

  if (status_filter) query = query.eq('status', status_filter)

  const { data, error: err } = await query.select('id')

  if (err) throw err

  await emitLog(ctx, 'pipeline_executions.cleaned',
    { type: 'system', id: 'cleanup' },
    { after: { deleted_count: (data || []).length } }
  )

  return { deleted_count: (data || []).length }
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_CLEANUP ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINE_EXECUTIONS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINE_EXECUTIONS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        d1ff32ebff977774775afb91952838530a5d628211a7ab7ac5c74aca2e7c77d2
 * @macro       Pipeline Executions Router
 * @micro       Routes HTTP methods and actions to appropriate pipeline execution handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/start/complete/cancel/getRunning/getStats/cleanup)
 * @depends-on  [createHandler, list, get, create, start, complete, cancel, getRunning, getStats, cleanup]
 * @depended-by [Netlify function routing, pipeline-runner.ts]
 * @side-effects [Delegates to appropriate handler]
 * @tags        pipeline-executions, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'list':
      if (method === 'GET') return await list(ctx, body)
      break
    case 'running':
      if (method === 'GET') return await getRunning(ctx, body)
      break
    case 'stats':
      if (method === 'GET') return await getStats(ctx, body)
      break
    case 'cleanup':
      if (method === 'POST') return await cleanup(ctx, body)
      break
    default:
      if (method === 'GET') {
        if (ctx.query?.id) {
          return await get(ctx, body)
        } else {
          return await list(ctx, body)
        }
      } else if (method === 'POST') {
        return await create(ctx, body)
      } else if (method === 'PATCH') {
        if (ctx.query?.action === 'start') return await start(ctx, body)
        else if (ctx.query?.action === 'complete') return await complete(ctx, body)
        else if (ctx.query?.action === 'cancel') return await cancel(ctx, body)
      }
  }

  throw new Error('Invalid action or method')
})
// ─── CHUNK_END: PIPELINE_EXECUTIONS_HANDLER ────────────────────────────────────────────────
