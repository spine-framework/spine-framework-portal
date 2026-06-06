/**
 * @module pipelines
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `pipelines` table, plus execution history access.
 * Pipelines are named lists of stages that execute sequentially via `runPipeline`
 * in `_shared/pipeline-runner.ts`.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/pipelines`
 *
 * **Actions:**
 * | method | ?action      | handler         |
 * |--------|--------------|-----------------|
 * | GET    | by-trigger   | listByTrigger   |
 * | GET    | executions   | getExecutions   |
 * | POST   | toggle       | toggle          |
 * | GET    | ?id          | get             |
 * | GET    | (default)    | list            |
 * | POST   | —            | create          |
 * | PATCH  | —            | update          |
 * | DELETE | —            | remove (hard)   |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Authenticated
 * principal required for writes.
 *
 * INVARIANT: `remove` is a hard delete (no soft delete for pipelines).
 * INVARIANT: `toggle` is a dedicated POST action — use instead of PATCH for
 *   is_active changes to ensure proper audit logging.
 *
 * @seeAlso pipeline-runner.ts (runPipeline — actual execution engine)
 * @seeAlso trigger-engine.ts (calls runPipeline when triggers fire)
 * @seeAlso audit.ts (emitLog for pipeline.* events)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_LIST_BY_TRIGGER ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_LIST_BY_TRIGGER_1_0_0
 * @version     1.0.0
 * @hash        eb5df34b2c5f7b954260202a14cbfbd84967ab03db335bd94894bf66a956a49a
 * @macro       Pipelines by Trigger List Handler
 * @micro       Lists pipelines filtered by trigger type with sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized pipeline records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        pipelines, list, trigger-type, crud
 */
export const listByTrigger = createHandler(async (ctx, _body) => {
  const { trigger_type, app_id, include_inactive } = ctx.query || {}

  if (!trigger_type) {
    throw new Error('trigger_type is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('pipelines')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('trigger_type', trigger_type)

  if (app_id) {
    query = query.eq('app_id', app_id)
  }
  if (include_inactive !== 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error: err } = await query.order('name')

  if (err) throw err

  const sanitized = []
  for (const pipeline of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, pipeline, 'pipeline'))
  }

  return sanitized
})
// ─── CHUNK_END: PIPELINES_LIST_BY_TRIGGER ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_LIST_1_0_0
 * @version     1.0.0
 * @hash        af2b426b38e99a1907d3113a5b0b776204be0e51a897974573fb5ebc63b85892
 * @macro       Pipelines List Handler
 * @micro       Lists all pipelines with optional filtering and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of sanitized pipeline records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        pipelines, list, crud, pagination
 */
export const list = createHandler(async (ctx, body) => {
  const { app_id, include_inactive } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  // RLS automatically filters to accessible accounts
  let query = ctx.db
    .from('pipelines')
    .select(`*, ${joins.app}, ${joins.createdBy}`)

  if (app_id) {
    query = query.eq('app_id', app_id)
  }

  const { data, error: err } = await query.order('name')

  if (err) throw err

  // Sanitize each record based on role permissions
  const sanitized = []
  for (const pipeline of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, pipeline, 'pipeline'))
  }

  return sanitized
})
// ─── CHUNK_END: PIPELINES_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_GET ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_GET_1_0_0
 * @version     1.0.0
 * @hash        27a956f4dfe17b93c89170d8f3a9f3f792e4b264b48d13017a52d08014008033
 * @macro       Pipeline Get Handler
 * @micro       Returns single pipeline record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Sanitized pipeline record with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        pipelines, get, crud, single-record
 */
export const get = createHandler(async (ctx, body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Pipeline ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('pipelines')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('id', id)
    .single()

  if (err) throw err

  // Sanitize based on role permissions
  return await sanitizeRecordData(ctx, data, 'pipeline')
})
// ─── CHUNK_END: PIPELINES_GET ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_CREATE_1_0_0
 * @version     1.0.0
 * @hash        b39ec2f696a5d4a9589b7fce769eb0e174d5b0b17b7f4155dc10b5fe70c09252
 * @macro       Pipeline Create Handler
 * @micro       Creates pipeline record with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Pipeline data including name, trigger_type, stages
 * @outputs     Inserted pipeline record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        pipelines, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, description, trigger_type, config, stages, metadata } = body

  if (!name || !trigger_type || !stages) {
    throw new Error('name, trigger_type, and stages are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const { data, error: err } = await ctx.db
    .from('pipelines')
    .insert({
      app_id: app_id || null,
      account_id: ctx.accountId,
      name,
      description: description || null,
      trigger_type,
      config: config || {},
      stages,
      metadata: metadata || {},
      created_by: ctx.principal.id
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline.created', 
    { type: 'pipeline', id: data.id }, 
    { after: { name, trigger_type } }
  )

  return data
})
// ─── CHUNK_END: PIPELINES_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        309910d5389fffcdc6b97b33dfd76f2217bb89e26469f73e4e792f9c41977a8f
 * @macro       Pipeline Update Handler
 * @micro       Updates pipeline with field allowlist and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Pipeline updates including id and updatable fields
 * @outputs     Updated pipeline record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        pipelines, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, name, description, config, stages, metadata } = body || {}

  if (!id) {
    throw new Error('Pipeline ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible pipelines
  const { data: current } = await ctx.db
    .from('pipelines')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Pipeline not found')
  }

  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updateData.name = name
  if (description !== undefined) updateData.description = description
  if (config !== undefined) updateData.config = config
  if (stages !== undefined) updateData.stages = stages
  if (metadata !== undefined) updateData.metadata = metadata

  const { data, error: err } = await ctx.db
    .from('pipelines')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline.updated', 
    { type: 'pipeline', id }, 
    { before: current, after: updateData }
  )

  return data
})
// ─── CHUNK_END: PIPELINES_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_TOGGLE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_TOGGLE_1_0_0
 * @version     1.0.0
 * @hash        4167ca4a65e675a0e37d0237000acf0fe5fdb23699495ff9f46b39f1a4e93884
 * @macro       Pipeline Toggle Handler
 * @micro       Activates or deactivates pipeline with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Pipeline id and is_active boolean
 * @outputs     Updated pipeline record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        pipelines, toggle, state-transition, audit
 */
export const toggle = createHandler(async (ctx, body) => {
  const { id, is_active } = body

  if (!id || is_active === undefined) {
    throw new Error('Pipeline ID and is_active are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible pipelines
  const { data: current } = await ctx.db
    .from('pipelines')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Pipeline not found')
  }

  const { data, error: err } = await ctx.db
    .from('pipelines')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'pipeline.toggled', 
    { type: 'pipeline', id }, 
    { before: { is_active: current.is_active }, after: { is_active } }
  )

  return data
})
// ─── CHUNK_END: PIPELINES_TOGGLE ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_GET_EXECUTIONS ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_GET_EXECUTIONS_1_0_0
 * @version     1.0.0
 * @hash        92b0d0a8f3c7ab12144950a0e1dd614a0d92fb6f5e3451542e396018bd5f783d
 * @macro       Pipeline Executions History Handler
 * @micro       Returns paginated execution history for a pipeline
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of pipeline_executions rows ordered newest-first
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB query with pagination]
 * @tags        pipelines, executions, history, pagination
 */
export const getExecutions = createHandler(async (ctx, _body) => {
  const { pipeline_id, limit = 50, offset = 0 } = ctx.query || {}

  if (!pipeline_id) {
    throw new Error('Pipeline ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('pipeline_executions')
    .select('*')
    .eq('pipeline_id', pipeline_id)
    .order('created_at', { ascending: false })
    .range(
      parseInt(offset.toString()),
      parseInt(offset.toString()) + parseInt(limit.toString()) - 1
    )

  if (err) throw err

  return data
})
// ─── CHUNK_END: PIPELINES_GET_EXECUTIONS ────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        8d87b1d6e7613f6fbaa77eb100c72359456f4bc38d8c435ac412d414d71e21be
 * @macro       Pipeline Remove Handler
 * @micro       Hard-deletes pipeline with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for DELETE)
 * @outputs     {success: true} — Confirmation of successful deletion
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete, audit logging]
 * @tags        pipelines, remove, delete, audit
 */
export const remove = createHandler(async (ctx, _body) => {
  const id = ctx.query?.id

  if (!id) {
    throw new Error('Pipeline ID is required')
  }

  const { data: current } = await ctx.db
    .from('pipelines')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!current) throw new Error('Pipeline not found')

  const { error: err } = await ctx.db
    .from('pipelines')
    .delete()
    .eq('id', id)

  if (err) throw err

  await emitLog(ctx, 'pipeline.deleted', 
    { type: 'pipeline', id }, 
    { before: current }
  )

  return { success: true }
})
// ─── CHUNK_END: PIPELINES_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: PIPELINES_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    PIPELINES_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        6a2509eb1d183c23578cea419e1d53b579876dc8f8778a9b5577427365da7a68
 * @macro       Pipelines Router
 * @micro       Routes HTTP methods and actions to appropriate pipeline handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (listByTrigger/getExecutions/toggle/list/get/create/update/remove)
 * @depends-on  [createHandler, listByTrigger, getExecutions, toggle, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        pipelines, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'by-trigger':
      if (method === 'GET') {
        return await listByTrigger(ctx, body)
      }
      break
    case 'executions':
      if (method === 'GET') {
        return await getExecutions(ctx, body)
      }
      break
    case 'toggle':
      if (method === 'POST') {
        return await toggle(ctx, body)
      }
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
        return await update(ctx, body)
      } else if (method === 'DELETE') {
        return await remove(ctx, body)
      }
  }

  throw new Error('Invalid action or method')
})
// ─── CHUNK_END: PIPELINES_HANDLER ────────────────────────────────────────────────
