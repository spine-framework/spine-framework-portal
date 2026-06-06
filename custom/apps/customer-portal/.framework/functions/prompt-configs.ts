/**
 * @module prompt-configs
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `prompt_configs` table. Prompt configs define LLM inference
 * parameters: system prompts, context templates, model selection, temperature,
 * confidence thresholds, escalation rules, tool access, and knowledge sources.
 * They are referenced by AI agents at inference time via `agent-runner.ts`.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/prompt-configs`
 *
 * **Standard CRUD routing:**
 * | method | condition | handler |
 * |--------|-----------|---------|
 * | GET    | ?id       | get     |
 * | GET    | (default) | list    |
 * | POST   | —         | create  |
 * | PATCH  | —         | update  |
 * | DELETE | —         | remove  |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Account context
 * required for writes.
 *
 * INVARIANT: `remove` is a hard delete.
 * INVARIANT: `update` only patches the explicit allowlist of fields.
 * INVARIANT: `model` defaults to 'gpt-4o', `temperature` to 0.7,
 *   `max_tokens` to 4000 if not specified on create.
 *
 * @seeAlso agent-runner.ts (resolveAgentConfig reads prompt_configs)
 * @seeAlso ai-agents.ts (ai_agents reference prompt_config_id)
 * @seeAlso audit.ts (emitLog for prompt_config.* events)
 */

import { createHandler } from './_shared/middleware'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_LIST_1_0_0
 * @version     1.0.0
 * @hash        177c1ca02d205ad820b03fef84d2667ddde4eaa8a2aa82fbf3ee58d4f68890aa
 * @macro       Prompt Configs List Handler
 * @micro       Lists prompt configs with filtering and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized prompt_config records with app/createdBy joins
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        prompt-configs, list, crud, pagination
 */
export const list = createHandler(async (ctx, _body) => {
  const { model, is_active, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('prompt_configs')
    .select(`
      *,
      app:apps(id, slug, name),
      created_by_person:people!prompt_configs_created_by_fkey(id, full_name, email)
    `)
    .order('name')

  if (model) {
    query = query.eq('model', model)
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
  for (const config of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, config, 'prompt_config'))
  }

  return sanitized
})
// ─── CHUNK_END: PROMPT_CONFIGS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_GET_1_0_0
 * @version     1.0.0
 * @hash        234cc28b4e9fba9333a221ac01d175bafaf93681221f182d6925df84caf90348
 * @macro       Prompt Config Get Handler
 * @micro       Returns single prompt config record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized prompt_config record with app/createdBy joins
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        prompt-configs, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Config ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('prompt_configs')
    .select(`
      *,
      app:apps(id, slug, name),
      created_by_person:people!prompt_configs_created_by_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'prompt_config')
})
// ─── CHUNK_END: PROMPT_CONFIGS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        e4aeda63ad485550140a44aa281020c9a6fc966da444d135281d869e053c5e6c
 * @macro       Prompt Config Create Handler
 * @micro       Creates prompt config with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Prompt config data including name, slug, and optional fields
 * @outputs     Inserted prompt_config record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        prompt-configs, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, slug, system_prompt, context_template, model, temperature, max_tokens,
    is_multi_turn, max_history_messages, confidence_threshold, escalation_action, escalation_target,
    output_mode, output_field, requires_review, knowledge_sources, available_tools, tool_constraints,
    metadata } = body

  if (!name || !slug) {
    throw new Error('name and slug are required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { data, error: err } = await ctx.db
    .from('prompt_configs')
    .insert({
      app_id: app_id || null,
      account_id: ctx.accountId,
      name,
      slug,
      system_prompt: system_prompt || null,
      context_template: context_template || null,
      model: model || 'gpt-4o',
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4000,
      is_multi_turn: is_multi_turn ?? true,
      max_history_messages: max_history_messages ?? 20,
      confidence_threshold: confidence_threshold || null,
      escalation_action: escalation_action || null,
      escalation_target: escalation_target || null,
      output_mode: output_mode || null,
      output_field: output_field || null,
      requires_review: requires_review ?? false,
      knowledge_sources: knowledge_sources || [],
      available_tools: available_tools || [],
      tool_constraints: tool_constraints || {},
      metadata: metadata || {},
      created_by: ctx.principal?.id
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'prompt_config.created', 
    { type: 'prompt_config', id: data.id }, 
    { after: { name, slug, model: data.model } }
  )

  return data
})
// ─── CHUNK_END: PROMPT_CONFIGS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        32985018c871c4d8b6faf93f817c33e8b9f65e6dbae5cdb0df37fa16bf7b2db1
 * @macro       Prompt Config Update Handler
 * @micro       Updates prompt config with field allowlist and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Prompt config updates including id and updatable fields
 * @outputs     Updated prompt_config record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        prompt-configs, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('Config ID is required')
  }

  const allowed = ['name', 'slug', 'system_prompt', 'context_template', 'model', 'temperature',
    'max_tokens', 'is_multi_turn', 'max_history_messages', 'confidence_threshold',
    'escalation_action', 'escalation_target', 'output_mode', 'output_field', 'requires_review',
    'knowledge_sources', 'available_tools', 'tool_constraints', 'metadata', 'is_active']
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) updateData[key] = updates[key]
  }

  const { data, error: err } = await ctx.db
    .from('prompt_configs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'prompt_config.updated', 
    { type: 'prompt_config', id }, 
    { after: updateData }
  )

  return data
})
// ─── CHUNK_END: PROMPT_CONFIGS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        2d6cdf4f067fe7259c1fb3d07c5928df36a2395424772a85a7d474072d883b84
 * @macro       Prompt Config Remove Handler
 * @micro       Hard-deletes prompt config with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for DELETE)
 * @outputs     {success: true} — Confirmation of successful deletion
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete, audit logging]
 * @tags        prompt-configs, remove, delete, audit
 */
export const remove = createHandler(async (ctx, _body) => {
  const id = ctx.query?.id

  if (!id) {
    throw new Error('Config ID is required')
  }

  const { data: current } = await ctx.db
    .from('prompt_configs')
    .select('id, name, slug')
    .eq('id', id)
    .single()

  if (!current) throw new Error('Prompt config not found')

  const { error: err } = await ctx.db
    .from('prompt_configs')
    .delete()
    .eq('id', id)

  if (err) throw err

  await emitLog(ctx, 'prompt_config.deleted', 
    { type: 'prompt_config', id }, 
    { before: current }
  )

  return { success: true }
})
// ─── CHUNK_END: PROMPT_CONFIGS_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: PROMPT_CONFIGS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    PROMPT_CONFIGS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        a49f4917dd07295e0ba9815bf929cccc5cffcbe4dcf6852aa4bd84d6cba1b690
 * @macro       Prompt Configs Router
 * @micro       Routes HTTP methods to appropriate prompt config handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove)
 * @depends-on  [createHandler, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        prompt-configs, router, crud, netlify-function
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
// ─── CHUNK_END: PROMPT_CONFIGS_HANDLER ────────────────────────────────────────────────
