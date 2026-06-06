/**
 * @module triggers
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `triggers` table, plus execution history access.
 * Triggers bind event types to pipelines. When an event fires, the trigger
 * engine evaluates active triggers via `_shared/trigger-engine.ts`.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/triggers`
 *
 * **Actions:**
 * | method | ?action    | handler       |
 * |--------|------------|---------------|
 * | GET    | by-event   | listByEvent   |
 * | GET    | executions | getExecutions |
 * | POST   | toggle     | toggle        |
 * | GET    | ?id        | get           |
 * | GET    | (default)  | list          |
 * | POST   | —          | create        |
 * | PATCH  | —          | update        |
 * | DELETE | —          | remove (soft) |
 *
 * **Authorization:** `create` requires system admin OR first-surface `canCreate`
 * permission. All other operations use `ctx.db` RLS.
 *
 * Also exports `AGENT_EVENT_TYPES` constant and `getAgentEventTypes()` helper
 * for referencing well-known agent event slugs in trigger configuration.
 *
 * @seeAlso trigger-engine.ts (checkAndFireTriggers — runtime evaluation)
 * @seeAlso pipelines.ts (pipeline_id FK on triggers)
 * @seeAlso audit.ts (emitLog for trigger.* events)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { PermissionEngine, sanitizeRecordData } from './_shared/permissions'

const permissions = PermissionEngine as any

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

/**
 * Well-known agent event type slugs for use in trigger `event_type` config.
 * These are emitted by `agent-runner.ts` during inference, tool dispatch,
 * and escalation workflows.
 */
export const AGENT_EVENT_TYPES = {
  // Inference events
  INFERENCE_COMPLETED: 'agent.inference.completed',
  INFERENCE_FAILED: 'agent.inference.failed',
  LOW_CONFIDENCE: 'agent.inference.low_confidence',
  
  // Tool events
  TOOL_CALLED: 'agent.tool.called',
  TOOL_COMPLETED: 'agent.tool.completed',
  TOOL_FAILED: 'agent.tool.failed',
  
  // Conversation events
  MESSAGE_RECEIVED: 'agent.message.received',
  MESSAGE_SENT: 'agent.message.sent',
  THREAD_CREATED: 'agent.thread.created',
  
  // Escalation events
  ESCALATION_TRIGGERED: 'agent.escalation.triggered',
  ESCALATION_RESOLVED: 'agent.escalation.resolved',
  HUMAN_HANDOFF: 'agent.human.handoff'
} as const

// ─── CHUNK_START: TRIGGERS_GET_AGENT_EVENT_TYPES ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_GET_AGENT_EVENT_TYPES_1_0_0
 * @version     1.0.0
 * @hash        ef90bc655886f31a4417d82b5bac35cfece4ba4e03770d71a449fc36e4cecb24
 * @macro       Agent Event Types Helper
 * @micro       Returns array of all agent event type slugs for UI dropdowns
 * @inputs      None
 * @outputs     string[] — All AGENT_EVENT_TYPES values
 * @depends-on  [AGENT_EVENT_TYPES constant]
 * @depended-by [UI components, trigger configuration forms]
 * @side-effects [None]
 * @tags        triggers, helper, event-types, ui
 */
export function getAgentEventTypes(): string[] {
  return Object.values(AGENT_EVENT_TYPES)
}
// ─── CHUNK_END: TRIGGERS_GET_AGENT_EVENT_TYPES ────────────────────────────────────────────────

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_LIST_BY_EVENT ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_LIST_BY_EVENT_1_0_0
 * @version     1.0.0
 * @hash        c6d2127dc2ced6d0618b338d227d8823b699b86977fc14ce455a27a29a2b1fa5
 * @macro       Triggers by Event List Handler
 * @micro       Lists triggers filtered by event type with sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of sanitized trigger records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        triggers, list, event-type, crud
 */
export const listByEvent = createHandler(async (ctx, body) => {
  const { event_type, app_id, include_inactive } = ctx.query || {}

  if (!event_type) {
    throw new Error('event_type is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('triggers')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('event_type', event_type)
    .order('name')

  if (app_id) {
    query = query.eq('app_id', app_id)
  }
  if (include_inactive !== 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error: err } = await query

  if (err) throw err

  // Sanitize each record based on role permissions
  const sanitized = []
  for (const trigger of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, trigger, 'trigger'))
  }

  return sanitized
})
// ─── CHUNK_END: TRIGGERS_LIST_BY_EVENT ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_LIST_1_0_0
 * @version     1.0.0
 * @hash        b65a861b2a1b7c63a6a2bbe395dfb6138fe00e0517a0eb40f012c2317fbcf45f
 * @macro       Triggers List Handler
 * @micro       Lists triggers with filtering and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of sanitized trigger records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        triggers, list, crud, filtering
 */
export const list = createHandler(async (ctx, body) => {
  const { app_id, event_type, include_inactive } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  // RLS automatically filters to accessible accounts
  let query = ctx.db
    .from('triggers')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .order('name')

  if (app_id) {
    query = query.eq('app_id', app_id)
  }
  if (event_type) {
    query = query.eq('event_type', event_type)
  }
  if (include_inactive !== 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error: err } = await query

  if (err) throw err

  // Sanitize each record based on role permissions
  const sanitized = []
  for (const trigger of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, trigger, 'trigger'))
  }

  return sanitized
})
// ─── CHUNK_END: TRIGGERS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_GET_1_0_0
 * @version     1.0.0
 * @hash        106ae81cd0528145f976f7c8e0cc16cacaf32468d0e2950a16b8f167bb88143d
 * @macro       Trigger Get Handler
 * @micro       Returns single trigger record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Sanitized trigger record with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        triggers, get, crud, single-record
 */
export const get = createHandler(async (ctx, body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Trigger ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('triggers')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('id', id)
    .single()

  if (err) throw err

  // Sanitize based on role permissions
  return await sanitizeRecordData(ctx, data, 'trigger')
})
// ─── CHUNK_END: TRIGGERS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        4411a0111e10158d29446e4b989fbccaf1e55057b4f809129eed33f93ee21901
 * @macro       Trigger Create Handler
 * @micro       Creates trigger with permission validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Trigger data including name, trigger_type, and optional fields
 * @outputs     Inserted trigger record
 * @depends-on  [createHandler, PermissionEngine, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, permission validation, audit logging]
 * @tags        triggers, create, crud, permissions, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, description, trigger_type, event_type, config, pipeline_id, metadata, is_active } = body

  if (!name || !trigger_type) {
    throw new Error('name and trigger_type are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Check create permissions
  if (!permissions.isSystemAdmin(ctx)) {
    const perms = await permissions.resolveFirstSurfacePermissions(
      ctx.principal.id,
      ctx.accountId!,
      'trigger',
      'create'
    )
    
    if (!perms.canCreate) {
      throw new Error('Insufficient permissions to create triggers')
    }
  }

  const { data, error: err } = await ctx.db
    .from('triggers')
    .insert({
      app_id,
      name,
      description,
      trigger_type,
      event_type,
      config: config || {},
      pipeline_id: pipeline_id || null,
      metadata: metadata || {},
      is_active: is_active ?? true,
      created_by: ctx.principal.id,
      account_id: ctx.accountId
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'trigger.created', 
    { type: 'trigger', id: data.id }, 
    { after: data }
  )

  return data
})
// ─── CHUNK_END: TRIGGERS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        8c7ee9556f7e18c9b63746baaf49ae73a4526735227a828bc77aaf518d4796fb
 * @macro       Trigger Update Handler
 * @micro       Updates trigger with audit logging and before/after state
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Trigger updates including id and updatable fields
 * @outputs     Updated trigger record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        triggers, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, app_id, name, description, trigger_type, event_type, config, pipeline_id, metadata, is_active } = body || {}

  if (!id) {
    throw new Error('Trigger ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible triggers
  const { data: current } = await ctx.db
    .from('triggers')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Trigger not found')
  }

  const { data, error: err } = await ctx.db
    .from('triggers')
    .update({
      app_id,
      name,
      description,
      trigger_type,
      event_type,
      config,
      pipeline_id,
      metadata,
      is_active,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'trigger.updated', 
    { type: 'trigger', id }, 
    { before: current, after: data }
  )

  return data
})
// ─── CHUNK_END: TRIGGERS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        d25952bb0f5bcd15fb5272f6d54a975b8a0f1cc6b85bc514b0e91df2fcb35ad5
 * @macro       Trigger Remove Handler
 * @micro       Soft-deletes trigger with audit logging and before/after state
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Trigger id for deletion
 * @outputs     Updated trigger record with is_active: false
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB soft delete, audit logging]
 * @tags        triggers, remove, soft-delete, audit
 */
export const remove = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id

  if (!id) {
    throw new Error('Trigger ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible triggers
  const { data: current } = await ctx.db
    .from('triggers')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Trigger not found')
  }

  const { data, error: err } = await ctx.db
    .from('triggers')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'trigger.deleted',
    { type: 'trigger', id },
    { before: current, after: data }
  )

  return data
})
// ─── CHUNK_END: TRIGGERS_REMOVE ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_TOGGLE ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_TOGGLE_1_0_0
 * @version     1.0.0
 * @hash        56add34659ac69c93b3570eb63f3bc3072d6a15083f79eaa7a9926f40f275373
 * @macro       Trigger Toggle Handler
 * @micro       Activates or deactivates trigger with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Trigger id and is_active boolean
 * @outputs     Updated trigger record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        triggers, toggle, state-transition, audit
 */
export const toggle = createHandler(async (ctx, body) => {
  const { id, is_active } = body

  if (!id || is_active === undefined) {
    throw new Error('Trigger ID and is_active are required')
  }

  const { data, error: err } = await ctx.db
    .from('triggers')
    .update({
      is_active,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'trigger.toggled', 
    { type: 'trigger', id }, 
    { after: { is_active } }
  )

  return data
})
// ─── CHUNK_END: TRIGGERS_TOGGLE ────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_GET_EXECUTIONS ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_GET_EXECUTIONS_1_0_0
 * @version     1.0.0
 * @hash        cf649749d76cd4d5909f96eb9193fd791f30f1e6268e1a0e6cb35ee4676d3071
 * @macro       Trigger Executions Handler
 * @micro       Returns paginated execution history for a trigger
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of trigger_executions rows ordered by triggered_at desc
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, pagination]
 * @tags        triggers, executions, history, pagination
 */
export const getExecutions = createHandler(async (ctx, body) => {
  const { trigger_id, limit = 50, offset = 0 } = ctx.query || {}

  if (!trigger_id) {
    throw new Error('Trigger ID is required')
  }

  const parsedLimit = parseInt(limit.toString())
  const parsedOffset = parseInt(offset.toString())

  const { data, error: err } = await ctx.db
    .from('trigger_executions')
    .select('*')
    .eq('trigger_id', trigger_id)
    .order('triggered_at', { ascending: false })
    .range(parsedOffset, parsedOffset + parsedLimit - 1)

  if (err) throw err

  return data
})
// ─── CHUNK_END: TRIGGERS_GET_EXECUTIONS ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: TRIGGERS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    TRIGGERS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        4efc53a8d92acf3346a939c519e3fbd0d64be57f4ee65a81ee213c5aba24e2ce
 * @macro       Triggers Router
 * @micro       Routes HTTP methods and actions to appropriate trigger handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH/DELETE operations
 * @outputs     Varies — Depends on routed handler (listByEvent/getExecutions/toggle/list/get/create/update/remove)
 * @depends-on  [createHandler, listByEvent, getExecutions, toggle, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        triggers, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'by-event':
      if (method === 'GET') {
        return await listByEvent(ctx, body)
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
// ─── CHUNK_END: TRIGGERS_HANDLER ────────────────────────────────────────────────
