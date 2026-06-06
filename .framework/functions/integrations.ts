/**
 * @module integrations
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `integrations` table. Integration records describe
 * third-party service connections (API credentials, provider, version,
 * configuration). Each integration is scoped to an account and optionally
 * to an app. `is_configured` tracks whether credentials have been set.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/integrations`
 *
 * **Standard CRUD — routes directly by HTTP method (no ?action switch):**
 * | method | condition | handler |
 * |--------|-----------|---------|
 * | GET    | ?id       | get     |
 * | GET    | (default) | list    |
 * | POST   | —         | create  |
 * | PATCH  | —         | update  |
 * | DELETE | —         | remove (soft) |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Authenticated
 * principal required for writes.
 *
 * INVARIANT: `remove` is a soft delete (sets `is_active = false`). Hard deletes
 *   are not supported to preserve audit trails on integration-linked data.
 * INVARIANT: `update` only patches the explicit allowlist of fields.
 *
 * @seeAlso api-keys.ts (api_keys belong to integrations)
 * @seeAlso trigger-engine.ts (integration webhooks trigger pipelines)
 * @seeAlso audit.ts (emitLog for integration.* events)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_LIST_1_0_0
 * @version     1.0.0
 * @hash        5faf0b7052d9aac5f764d1fc30ddde1485a0296ad2b209cd2e3a73c09061a1fc
 * @macro       Integrations List Handler
 * @micro       Lists integrations with filtering, pagination, and joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized integration records with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        integrations, list, crud, pagination
 */
export const list = createHandler(async (ctx, _body) => {
  const { integration_type, provider, is_active, is_configured, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('integrations')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .order('name')

  if (integration_type) {
    query = query.eq('integration_type', integration_type)
  }
  if (provider) {
    query = query.eq('provider', provider)
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }
  if (is_configured !== undefined) {
    query = query.eq('is_configured', is_configured === 'true')
  }

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  const sanitized = []
  for (const integration of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, integration, 'integration'))
  }

  return sanitized
})
// ─── CHUNK_END: INTEGRATIONS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_GET_1_0_0
 * @version     1.0.0
 * @hash        975126629cff24c75d2b74328d1ae08dd033ed451d3820d828c62b1f7a27413e
 * @macro       Integration Get Handler
 * @micro       Returns single integration record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized integration record with app/createdBy joins
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        integrations, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Integration ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('integrations')
    .select(`*, ${joins.app}, ${joins.createdBy}`)
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'integration')
})
// ─── CHUNK_END: INTEGRATIONS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        27d2242703930d7eeb33b49bbce4c22681ab891750c4c7a298c1c717a39870d7
 * @macro       Integration Create Handler
 * @micro       Creates integration record with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Integration data including name, integration_type, provider
 * @outputs     Inserted integration record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        integrations, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, name, description, integration_type, provider, version, config, credentials, metadata } = body

  if (!name || !integration_type || !provider) {
    throw new Error('name, integration_type, and provider are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const { data, error: err } = await ctx.db
    .from('integrations')
    .insert({
      app_id: app_id || null,
      account_id: ctx.accountId,
      name,
      description: description || null,
      integration_type,
      provider,
      version: version || '1.0.0',
      config: config || {},
      credentials: credentials || {},
      metadata: metadata || {},
      created_by: ctx.principal.id
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'integration.created', 
    { type: 'integration', id: data.id }, 
    { after: { name, integration_type, provider } }
  )

  return data
})
// ─── CHUNK_END: INTEGRATIONS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        ab5c8404ddec24ff912c55e7e52cd0ecdd220646b0e07f56a49a02ef3288f3e9
 * @macro       Integration Update Handler
 * @micro       Updates integration with field allowlist and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Integration updates including id
 * @outputs     Updated integration record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        integrations, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('Integration ID is required')
  }

  const allowed = ['name', 'description', 'integration_type', 'provider', 'version', 'config', 'credentials', 'metadata', 'is_active', 'is_configured']
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (updates[key] !== undefined) updateData[key] = updates[key]
  }

  const { data, error: err } = await ctx.db
    .from('integrations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'integration.updated', 
    { type: 'integration', id }, 
    { after: updateData }
  )

  return data
})
// ─── CHUNK_END: INTEGRATIONS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        a8b5f084d745d2ce69a1e29d74903832ed39647ccb779d0f651a99157777a08a
 * @macro       Integration Remove Handler
 * @micro       Soft-deletes integration with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for DELETE)
 * @outputs     Updated integration record with is_active: false
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB soft delete, audit logging]
 * @tags        integrations, remove, crud, audit
 */
export const remove = createHandler(async (ctx, _body) => {
  const id = ctx.query?.id

  if (!id) {
    throw new Error('Integration ID is required')
  }

  const { data: current } = await ctx.db
    .from('integrations')
    .select('id, name, provider')
    .eq('id', id)
    .single()

  if (!current) throw new Error('Integration not found')

  const { data, error: err } = await ctx.db
    .from('integrations')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'integration.deleted',
    { type: 'integration', id },
    { before: current, after: { is_active: false } }
  )

  return data
})
// ─── CHUNK_END: INTEGRATIONS_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: INTEGRATIONS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    INTEGRATIONS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        14c00f276a22287ed65c019efe327cbb513f860a408191e299864b05c641833c
 * @macro       Integrations Router
 * @micro       Routes HTTP methods to appropriate handlers (no action switch)
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove)
 * @depends-on  [createHandler, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        integrations, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const method = ctx.query?.method || 'GET'

  switch (method) {
    case 'GET':
      if (ctx.query?.id) {
        return await get(ctx, body)
      } else {
        return await list(ctx, body)
      }
    case 'POST':
      return await create(ctx, body)
    case 'PATCH':
      return await update(ctx, body)
    case 'DELETE':
      return await remove(ctx, body)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
})
// ─── CHUNK_END: INTEGRATIONS_HANDLER ────────────────────────────────────────────────
