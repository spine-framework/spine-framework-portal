/**
 * @module ai-agents
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `ai_agents` table. AI agent records define the configuration
 * for agentic inference workloads: model settings, system prompts, available
 * tools, capabilities, and constraints. The runtime execution is handled by
 * `_shared/agent-runner.ts`.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/ai-agents`
 *
 * **Actions (standard CRUD only):**
 * | method | condition | handler |
 * |--------|-----------|---------|
 * | GET    | ?id       | get     |
 * | GET    | (default) | list    |
 * | POST   | —         | create  |
 * | PATCH  | —         | update  |
 * | DELETE | —         | remove  |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Authenticated
 * principal required for writes.
 *
 * INVARIANT: `remove` is a hard delete.
 * INVARIANT: `update` only patches allowed fields: name, description,
 *   model_config, system_prompt, tools, capabilities, constraints, metadata,
 *   is_active.
 *
 * @seeAlso agent-runner.ts (runAgent — runtime execution using these configs)
 * @seeAlso prompt-configs.ts (prompt_configs referenced by agent configs)
 * @seeAlso audit.ts (emitLog for ai_agent.* events)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { PermissionEngine, sanitizeRecordData } from './_shared/permissions'

const permissions = PermissionEngine as any

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_LIST_1_0_0
 * @version     1.0.0
 * @hash        237972d65e86f5d432f55b602ac5e6f2dcfaefa83c662c10b7d3437ac906ff0d
 * @macro       AI Agents List Handler
 * @micro       Lists AI agents with filtering and pagination
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized AI agent records
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        ai-agents, list, crud, pagination
 */
export const list = createHandler(async (ctx, _body) => {
  const { agent_type, is_active, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  // RLS automatically filters to accessible accounts
  let query = ctx.db
    .from('ai_agents')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .order('name')

  if (agent_type) {
    query = query.eq('agent_type', agent_type)
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  const sanitized = []
  for (const agent of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, agent, 'ai_agent'))
  }

  return sanitized
})
// ─── CHUNK_END: AI_AGENTS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_GET_1_0_0
 * @version     1.0.0
 * @hash        62f283668d9a90ff81e2cbf8c437298206b355d2dd96fb559b2848fc4ffbc5cd
 * @macro       AI Agent Get Handler
 * @micro       Returns a single AI agent by UUID with joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized AI agent record with app and createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        ai-agents, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Agent ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('ai_agents')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'ai_agent')
})
// ─── CHUNK_END: AI_AGENTS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        355c8ceb1f33e033616480827141a2f33cde8e18fa4e9f9d94f4866af6fe66f6
 * @macro       AI Agent Create Handler
 * @micro       Creates new AI agent configuration with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Agent configuration data
 * @outputs     Inserted AI agent record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        ai-agents, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, description, agent_type, model_config, system_prompt, tools, capabilities, constraints, metadata } = body

  if (!name || !agent_type) {
    throw new Error('name and agent_type are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const { data, error: err } = await ctx.db
    .from('ai_agents')
    .insert({
      app_id: app_id || null,
      account_id: ctx.accountId,
      name,
      description: description || null,
      agent_type,
      model_config: model_config || {},
      system_prompt: system_prompt || null,
      tools: tools || [],
      capabilities: capabilities || [],
      constraints: constraints || {},
      metadata: metadata || {},
      created_by: ctx.principal.id
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'ai_agent.created', 
    { type: 'ai_agent', id: data.id }, 
    { after: { name, agent_type } }
  )

  return data
})
// ─── CHUNK_END: AI_AGENTS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        07e173626958a0ef032cc4c80719c49df5990756e08ecdb70a4168ab73544f10
 * @macro       AI Agent Update Handler
 * @micro       Updates AI agent with field validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Agent updates including id
 * @outputs     Updated AI agent record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        ai-agents, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('Agent ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const allowed = ['name', 'description', 'model_config', 'system_prompt', 'tools', 'capabilities', 'constraints', 'metadata', 'is_active']
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) updateData[key] = updates[key]
  }

  const { data, error: err } = await ctx.db
    .from('ai_agents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'ai_agent.updated', 
    { type: 'ai_agent', id }, 
    { after: updateData }
  )

  return data
})
// ─── CHUNK_END: AI_AGENTS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        7d990350b55b85945cc2148908618d6cd1dad27d1fc8343eab6966bedd9d84fa
 * @macro       AI Agent Remove Handler
 * @micro       Hard-deletes AI agent with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for DELETE)
 * @outputs     {success: true} — Success confirmation
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete, audit logging]
 * @tags        ai-agents, remove, crud, audit
 */
export const remove = createHandler(async (ctx, _body) => {
  const id = ctx.query?.id

  if (!id) {
    throw new Error('Agent ID is required')
  }

  const { data: current } = await ctx.db
    .from('ai_agents')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!current) throw new Error('Agent not found')

  const { error: err } = await ctx.db
    .from('ai_agents')
    .delete()
    .eq('id', id)

  if (err) throw err

  await emitLog(ctx, 'ai_agent.deleted', 
    { type: 'ai_agent', id }, 
    { before: current }
  )

  return { success: true }
})
// ─── CHUNK_END: AI_AGENTS_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: AI_AGENTS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    AI_AGENTS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        a49f4917dd07295e0ba9815bf929cccc5cffcbe4dcf6852aa4bd84d6cba1b690
 * @macro       AI Agents Router
 * @micro       Routes HTTP methods to appropriate CRUD handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove)
 * @depends-on  [createHandler, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        ai-agents, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
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
// ─── CHUNK_END: AI_AGENTS_HANDLER ────────────────────────────────────────────────
