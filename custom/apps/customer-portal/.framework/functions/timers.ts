/**
 * @module timers
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `timers` table. Timers are scheduled pipeline triggers
 * (cron-style). They are evaluated and fired by `system-cron.ts` on each
 * scheduled invocation.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/timers`
 *
 * **Actions:**
 * | method | ?action  | handler  |
 * |--------|----------|----------|
 * | POST   | toggle   | toggle   |
 * | GET    | ?id      | get      |
 * | GET    | (default)| list     |
 * | POST   | —        | create   |
 * | PATCH  | —        | update   |
 * | DELETE | —        | remove (hard) |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Authenticated
 * principal required for writes.
 *
 * INVARIANT: `remove` is a hard delete.
 * INVARIANT: `update` only patches allowed fields: name, description, config,
 *   pipeline_id, metadata, is_active.
 *
 * @seeAlso system-cron.ts (fires timers on schedule)
 * @seeAlso pipelines.ts (pipeline_id FK on timers)
 * @seeAlso audit.ts (emitLog for timer.* events)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_LIST_1_0_0
 * @version     1.0.0
 * @hash        151a2403c9d974004a34303443368921966ea3adeada07e5f63b9a20ad3f08a1
 * @macro       Timers List Handler
 * @micro       Lists timers with filtering and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized timer records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        timers, list, crud, filtering
 */
export const list = createHandler(async (ctx, _body) => {
  const { app_id, timer_type, is_active } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('timers')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .order('name')

  if (app_id) {
    query = query.eq('app_id', app_id)
  }
  if (timer_type) {
    query = query.eq('timer_type', timer_type)
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }

  const { data, error: err } = await query

  if (err) throw err

  const sanitized = []
  for (const timer of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, timer, 'timer'))
  }

  return sanitized
})
// ─── CHUNK_END: TIMERS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_GET_1_0_0
 * @version     1.0.0
 * @hash        8bbf46bb1410299eb881680ba4b508093157000a7fe525f7380e96ff0a241f32
 * @macro       Timer Get Handler
 * @micro       Returns single timer record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized timer record with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        timers, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Timer ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('timers')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'timer')
})
// ─── CHUNK_END: TIMERS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        b655ea396b23dac3548323612decef91b712c0a2b42bc5c7bc0f79aee4d11af4
 * @macro       Timer Create Handler
 * @micro       Creates timer with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Timer data including name, timer_type, and optional fields
 * @outputs     Inserted timer record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        timers, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, description, timer_type, config, pipeline_id, metadata } = body

  if (!name || !timer_type) {
    throw new Error('name and timer_type are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const { data, error: err } = await ctx.db
    .from('timers')
    .insert({
      app_id: app_id || null,
      account_id: ctx.accountId,
      name,
      description: description || null,
      timer_type,
      config: config || {},
      pipeline_id: pipeline_id || null,
      metadata: metadata || {},
      created_by: ctx.principal.id
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'timer.created', 
    { type: 'timer', id: data.id }, 
    { after: { name, timer_type } }
  )

  return data
})
// ─── CHUNK_END: TIMERS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        3c53499205d63b8643e28671b397b97b344976e88ea561860e2e394ca246942d
 * @macro       Timer Update Handler
 * @micro       Updates timer with field allowlist and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Timer updates including id and updatable fields
 * @outputs     Updated timer record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        timers, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('Timer ID is required')
  }

  const allowed = ['name', 'description', 'config', 'pipeline_id', 'metadata', 'is_active']
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) updateData[key] = updates[key]
  }

  const { data, error: err } = await ctx.db
    .from('timers')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'timer.updated', 
    { type: 'timer', id }, 
    { after: updateData }
  )

  return data
})
// ─── CHUNK_END: TIMERS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_TOGGLE ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_TOGGLE_1_0_0
 * @version     1.0.0
 * @hash        5db82e7a94fbdb9a0e3452c63a044789a993ed8881033d9372b86778c50a2d8c
 * @macro       Timer Toggle Handler
 * @micro       Activates or deactivates timer with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Timer id and is_active boolean
 * @outputs     Updated timer record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        timers, toggle, state-transition, audit
 */
export const toggle = createHandler(async (ctx, body) => {
  const { id, is_active } = body

  if (!id || is_active === undefined) {
    throw new Error('Timer ID and is_active are required')
  }

  const { data, error: err } = await ctx.db
    .from('timers')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'timer.toggled', 
    { type: 'timer', id }, 
    { after: { is_active } }
  )

  return data
})
// ─── CHUNK_END: TIMERS_TOGGLE ────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        2d999f6948d616925eaa36be8b39b2fd23de364bf242d4fb0ff3304e1ff9f275
 * @macro       Timer Remove Handler
 * @micro       Hard-deletes timer with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for DELETE)
 * @outputs     {success: true} — Confirmation of successful deletion
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete, audit logging]
 * @tags        timers, remove, delete, audit
 */
export const remove = createHandler(async (ctx, _body) => {
  const id = ctx.query?.id

  if (!id) {
    throw new Error('Timer ID is required')
  }

  const { data: current } = await ctx.db
    .from('timers')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!current) throw new Error('Timer not found')

  const { error: err } = await ctx.db
    .from('timers')
    .delete()
    .eq('id', id)

  if (err) throw err

  await emitLog(ctx, 'timer.deleted', 
    { type: 'timer', id }, 
    { before: current }
  )

  return { success: true }
})
// ─── CHUNK_END: TIMERS_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: TIMERS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    TIMERS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        e890b54a4f767885a6e9d54b4ab19b968e09f6fc2f8db840d5b60df1e3cd2ba3
 * @macro       Timers Router
 * @micro       Routes HTTP methods and actions to appropriate timer handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH/DELETE operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove/toggle)
 * @depends-on  [createHandler, list, get, create, update, remove, toggle]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        timers, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
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
// ─── CHUNK_END: TIMERS_HANDLER ────────────────────────────────────────────────
