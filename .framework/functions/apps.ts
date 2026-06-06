/**
 * @module apps
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `apps` table. Apps are the installable units of functionality
 * in Spine v2. They group types, roles, integrations, and nav configuration.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/apps`
 *
 * **Authorization model:**
 * - `list` / `get` / `getSchema` / `checkAvailability`: any authenticated principal
 *   (RLS-scoped via `ctx.db`). Returns sanitized records.
 * - `create`: requires `isSystemAdmin` or first-surface `canCreate` permission.
 * - `update` / `remove`: requires authenticated principal + field-level permission
 *   check via `validateUpdatePermissions`.
 * - `updateVersion`: authenticated principal via RPC.
 *
 * INVARIANT: app slugs are globally unique across the `apps` table.
 * INVARIANT: `is_system` apps can only be manipulated by system admins.
 *
 * @seeAlso middleware.ts (createHandler)
 * @seeAlso permissions.ts (PermissionEngine, sanitizeRecordData)
 * @seeAlso audit.ts (emitLog for app.created / app.updated / app.deleted)
 * @seeAlso types.ts (types reference apps via app_id)
 */

import { createHandler } from './_shared/middleware'
import { joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { PermissionEngine, sanitizeRecordData } from './_shared/permissions'

const permissions = PermissionEngine as any

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: APPS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_LIST_1_0_0
 * @version     1.0.0
 * @hash        8eaac3c01786fadeb3c4acb34c9725378f2055766213493859835cadf2bb3963
 * @macro       Apps List Handler
 * @micro       Lists accessible apps via RPC with filtering and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of sanitized app records
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [RPC call, permission sanitization]
 * @tags        apps, list, crud, rpc
 */
export const list = createHandler(async (ctx, body) => {
  const { include_system, include_inactive, account_id } = ctx.query || {}

  const targetAccountId = account_id || ctx.accountId

  if (!targetAccountId) {
    throw new Error('Account context required')
  }

  // RLS automatically filters to accessible accounts
  const { data, error: err } = await ctx.db
    .rpc('get_account_apps', {
      account_id: targetAccountId,
      include_system: include_system !== 'false',
      include_inactive: include_inactive === 'true'
    })

  if (err) throw err

  // Sanitize each record based on role permissions
  const sanitized = []
  for (const app of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, app, 'app'))
  }

  return sanitized
})
// ─── CHUNK_END: APPS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_GET_1_0_0
 * @version     1.0.0
 * @hash        5449bb3ac8726775412df541e1f2abf2400fb18751e3c9aad5f0aafb09cc7f60
 * @macro       App Get Handler
 * @micro       Returns single app by ID or slug with owner account join
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Sanitized app record with ownerAccount join
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        apps, get, crud, single-record
 */
export const get = createHandler(async (ctx, body) => {
  const { id, slug } = ctx.query || {}
  
  if (!id && !slug) {
    throw new Error('App ID or slug is required')
  }

  let query = ctx.db
    .from('apps')
    .select(`*, ${joins.ownerAccount}`)
    .eq('is_active', true)

  if (id) {
    query = query.eq('id', id)
  } else {
    query = query.eq('slug', slug)
  }

  const { data, error: err } = await query.single()

  if (err) throw err

  // Sanitize based on role permissions
  return await sanitizeRecordData(ctx, data, 'app')
})
// ─── CHUNK_END: APPS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_GET_SCHEMA ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_GET_SCHEMA_1_0_0
 * @version     1.0.0
 * @hash        8b6b7bb419114cbb699ad841dc4ba760ff36a626e8a9513de24715229e5a064b
 * @macro       App Schema Handler
 * @micro       Returns full app schema via RPC with types, roles, views, integrations
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     App schema object with complete configuration
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [RPC call for schema retrieval]
 * @tags        apps, schema, rpc, configuration
 */
export const getSchema = createHandler(async (ctx, body) => {
  const { slug } = ctx.query || {}

  if (!slug) {
    throw new Error('App slug is required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_app_schema', { app_slug: slug })

  if (err) throw err

  return data
})
// ─── CHUNK_END: APPS_GET_SCHEMA ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        f440efbf4a020b2d0d21ed7d90c5995538dd76d631f1b16fc53c1f2e9a1e4f91
 * @macro       App Create Handler
 * @micro       Creates new app with permission validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — App configuration data including slug and name
 * @outputs     Inserted app record
 * @depends-on  [createHandler, permissions, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, permission checks, audit logging]
 * @tags        apps, create, crud, permissions, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { slug, name, description, icon, color, version, app_type, source, owner_account_id, config, nav_items, min_role, integration_deps, metadata, route_prefix, renderer } = body

  if (!slug || !name) {
    throw new Error('slug and name are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Check create permissions
  if (!permissions.isSystemAdmin(ctx)) {
    const perms = await permissions.resolveFirstSurfacePermissions(
      ctx.principal.id,
      ctx.accountId!,
      'app',
      'create'
    )
    
    if (!perms.canCreate) {
      throw new Error('Insufficient permissions to create apps')
    }
  }

  // Check if slug is unique
  const { data: existing } = await ctx.db
    .from('apps')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    throw new Error('App slug already exists')
  }

  const { data, error: err } = await ctx.db
    .from('apps')
    .insert({
      slug,
      name,
      description,
      icon,
      color,
      version: version || '1.0.0',
      app_type: app_type || 'custom',
      source: source || 'custom',
      owner_account_id: owner_account_id || ctx.accountId,
      config: config || {},
      nav_items: nav_items || [],
      min_role: min_role || 'member',
      integration_deps: integration_deps || [],
      metadata: metadata || {},
      route_prefix: route_prefix !== undefined ? route_prefix : ('/' + slug),
      renderer: renderer || 'generic',
      is_active: true,
      is_system: false
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'app.created', { type: 'app', id: data.id }, { after: data })

  return data
})
// ─── CHUNK_END: APPS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        77029f18737fee801ff5ebdde199d6b52454fd9fe3842694b072181fc713b937
 * @macro       App Update Handler
 * @micro       Updates app with field-level permission validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — App updates including id
 * @outputs     Updated app record
 * @depends-on  [createHandler, permissions, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, permission validation, audit logging]
 * @tags        apps, update, crud, permissions, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('App ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible apps
  const { data: current } = await ctx.db
    .from('apps')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('App not found')
  }

  // Validate field-level permissions
  const fieldValidation = await permissions.validateUpdatePermissions(
    ctx,
    updates,
    current,
    'apps'
  )
  
  if (!fieldValidation.valid) {
    throw new Error(fieldValidation.error)
  }

  const { data, error: err } = await ctx.db
    .from('apps')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'app.updated', { type: 'app', id }, { before: current, after: data })

  return data
})
// ─── CHUNK_END: APPS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        b2c79779820861406f1adabc2279e332727b936abab4c6f5e5762a62d1373169
 * @macro       App Remove Handler
 * @micro       Soft-deletes app with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body with app ID
 * @outputs     Updated app record with is_active: false
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB soft delete, audit logging]
 * @tags        apps, remove, crud, audit
 */
export const remove = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id

  if (!id) {
    throw new Error('App ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible apps
  const { data: current } = await ctx.db
    .from('apps')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('App not found')
  }

  const { data, error: err } = await ctx.db
    .from('apps')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'app.deleted', { type: 'app', id }, { before: current })

  return data
})
// ─── CHUNK_END: APPS_REMOVE ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_CHECK_AVAILABILITY ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_CHECK_AVAILABILITY_1_0_0
 * @version     1.0.0
 * @hash        db7d52bcb1002d923dac039a99e6f6fb0eb9889e9b4a44994bf7bb75477ac9a4
 * @macro       App Availability Checker
 * @micro       Checks if app is available for account via RPC
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     {available: boolean} — Availability status
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [RPC call for availability check]
 * @tags        apps, availability, rpc, check
 */
export const checkAvailability = createHandler(async (ctx, body) => {
  const { slug } = ctx.query || {}

  if (!slug) {
    throw new Error('App slug is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { data, error: err } = await ctx.db
    .rpc('is_app_available', {
      app_slug: slug,
      account_id: ctx.accountId
    })

  if (err) throw err

  return { available: data }
})
// ─── CHUNK_END: APPS_CHECK_AVAILABILITY ────────────────────────────────────────────────

// ─── CHUNK_START: APPS_UPDATE_VERSION ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_UPDATE_VERSION_1_0_0
 * @version     1.0.0
 * @hash        04a1a3367e4b8ca0f58e0719e73b0ccda378e84b4b874f3f7e07ee0faa423bfd
 * @macro       App Version Update Handler
 * @micro       Updates app version string via RPC with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — App ID and new version string
 * @outputs     {success: true} — Success confirmation
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [RPC call, audit logging]
 * @tags        apps, version, update, rpc, audit
 */
export const updateVersion = createHandler(async (ctx, body) => {
  const { id, version } = body

  if (!id || !version) {
    throw new Error('App ID and version are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('update_app_version', {
      app_id: id,
      new_version: version
    })

  if (err) throw err

  await emitLog(ctx, 'app.version_updated', { type: 'app', id }, { after: { version } })

  return { success: true }
})
// ─── CHUNK_END: APPS_UPDATE_VERSION ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: APPS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    APPS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        361e1ba86b38a4611f3170526e4ff7f456d58b929c1d39bf847135afdebf3867
 * @macro       Apps Router
 * @micro       Routes HTTP methods and actions to appropriate handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove/schema/available/version)
 * @depends-on  [createHandler, list, get, getSchema, checkAvailability, create, update, remove, updateVersion]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        apps, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const method = ctx.query?.method || 'GET'

  switch (method) {
    case 'GET':
      if (ctx.query?.action === 'get' || ctx.query?.id) {
        return await get(ctx, body)
      } else if (ctx.query?.slug) {
        return await get(ctx, body)
      } else if (ctx.query?.action === 'schema') {
        return await getSchema(ctx, body)
      } else if (ctx.query?.action === 'available') {
        return await checkAvailability(ctx, body)
      } else {
        return await list(ctx, body)
      }
    case 'POST':
      if (ctx.query?.action === 'version') {
        return await updateVersion(ctx, body)
      } else {
        return await create(ctx, body)
      }
    case 'PATCH':
      return await update(ctx, body)
    case 'DELETE':
      return await remove(ctx, body)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
})
// ─── CHUNK_END: APPS_HANDLER ────────────────────────────────────────────────
