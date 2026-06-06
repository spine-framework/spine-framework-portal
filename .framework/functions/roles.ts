/**
 * @module roles
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `roles` table. Roles define permission sets (`permissions`
 * JSONB) that are assigned to people within an account.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/roles`
 *
 * **Authorization model:**
 * - All reads use `ctx.db` (RLS-scoped). System admins see raw records;
 *   others get field-level sanitization via `sanitizeRecordData`.
 * - `create`: requires system admin OR first-surface `canCreate` permission.
 *   Creating a role with `slug === 'system_admin'` is system-admin-only.
 * - `update` / `remove`: require authenticated principal. RLS controls row
 *   access; field-level permissions validated via `validateUpdatePermissions`.
 * - Slug uniqueness is enforced per-app: checked against `adminDb`.
 *
 * INVARIANT: `system_admin` role slug can only be created by system admins.
 * INVARIANT: soft delete only — roles are set to `is_active = false`.
 *
 * @seeAlso middleware.ts (createHandler)
 * @seeAlso permissions.ts (PermissionEngine, sanitizeRecordData)
 * @seeAlso audit.ts (emitLog for role.created / role.updated / role.deleted)
 */

import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { emitLog } from './_shared/audit'
import { PermissionEngine, sanitizeRecordData } from './_shared/permissions'

const permissions = PermissionEngine as any

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_LIST_1_0_0
 * @version     1.0.0
 * @hash        b643852233c87c20abd7d62b3f51be9ba7f0f2a4ff02154be239ceef6184811b
 * @macro       Roles List Handler
 * @micro       Lists active roles with filtering and permission-based sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of role records with app join, sanitized for non-admins
 * @depends-on  [createHandler, PermissionEngine, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        roles, list, crud, pagination, permissions
 */
export const list = createHandler(async (ctx, _body) => {
  const { app_id, is_system, limit = '50', offset = '0' } = ctx.query || {}

  // RLS automatically filters to accessible roles
  let query = ctx.db
    .from('roles')
    .select(`
      *,
      app:apps(id, slug, name)
    `)
    .eq('is_active', true)
    .order('is_system', { ascending: false })
    .order('name')

  if (app_id) {
    query = query.eq('app_id', app_id)
  } else if (app_id === 'null') {
    query = query.is('app_id', null)
  }

  if (is_system !== undefined) {
    query = query.eq('is_system', is_system === 'true')
  }

  const { data, error: err } = await query
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (err) throw err

  // System admin sees everything without additional filtering
  if (permissions.isSystemAdmin(ctx)) {
    return data
  }

  // Filter each role based on field-level permissions
  const filteredData = []
  for (const role of data || []) {
    const roleWithType = { ...role, type: 'role' }
    const sanitizedRole = await sanitizeRecordData(ctx, roleWithType, 'role')
      filteredData.push(sanitizedRole)
  }

  return filteredData
})
// ─── CHUNK_END: ROLES_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_GET ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_GET_1_0_0
 * @version     1.0.0
 * @hash        94607bad8b9ff929233ce1b29b6563062d439365ed0413726c5a8d8d0f58474b
 * @macro       Role Get Handler
 * @micro       Returns single role record with joins and permission sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized role record with app join
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        roles, get, crud, single-record, permissions
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}
  
  if (!id) {
    throw new Error('Role ID is required')
  }

  // RLS ensures user can only access roles in their accessible accounts
  const { data, error: err } = await ctx.db
    .from('roles')
    .select(`
      *,
      app:apps(id, slug, name)
    `)
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (err) throw err

  // Return sanitized data based on field-level permissions
  const roleWithType = { ...data, type: 'role' }
  return await sanitizeRecordData(ctx, roleWithType, 'role')
})
// ─── CHUNK_END: ROLES_GET ────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_CREATE_1_0_0
 * @version     1.0.0
 * @hash        7f6646fee88ed72d997eb710feb3778aad114f3a96819390166c8ecbc6eeaa0e
 * @macro       Role Create Handler
 * @micro       Creates role with permission validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Role data including slug, name, and optional fields
 * @outputs     Inserted role record
 * @depends-on  [createHandler, PermissionEngine, adminDb, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, permission validation, audit logging]
 * @tags        roles, create, crud, permissions, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, slug, name, description, permissions: rolePermissions, is_system } = body

  if (!slug || !name) {
    throw new Error('slug and name are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Guard: system_admin role can only be created by system admins
  if (slug === 'system_admin' && !permissions.isSystemAdmin(ctx)) {
    throw new Error('system_admin role can only be created by system administrators')
  }

  // Check create permissions using PermissionEngine
  if (!permissions.isSystemAdmin(ctx)) {
    const perms = await permissions.resolveFirstSurfacePermissions(
      ctx.principal.id,
      ctx.accountId!,
      'role',
      'create'
    )
    
    if (!perms.canCreate) {
      throw new Error('Insufficient permissions to create roles')
    }
  }

  // Check if slug is unique within app using service role (validating uniqueness is a system concern)
  let query = adminDb
    .from('roles')
    .select('id')
    .eq('slug', slug)

  if (app_id) {
    query = query.eq('app_id', app_id)
  } else {
    query = query.is('app_id', null)
  }

  const { data: existing } = await query.single()

  if (existing) {
    throw new Error('Role slug already exists for this app')
  }

  // Insert with RLS enforcement
  const { data, error: err } = await ctx.db
    .from('roles')
    .insert({
      app_id,
      slug,
      name,
      description,
      permissions: rolePermissions || {},
      is_system: is_system || false,
      is_active: true
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'role.created', { type: 'role', id: data.id }, { after: data })

  return data
})
// ─── CHUNK_END: ROLES_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        19803de116b38af5e27bf542ca642228f4661bbf428a4846ed565d0667767580
 * @macro       Role Update Handler
 * @micro       Updates role with field-level permission validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Role updates including id and updatable fields
 * @outputs     Updated role record
 * @depends-on  [createHandler, PermissionEngine, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, permission validation, audit logging]
 * @tags        roles, update, crud, permissions, audit
 */
export const update = createHandler(async (ctx, body) => {
  const { id, ...updates } = body

  if (!id) {
    throw new Error('Role ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit via RLS
  const { data: current, error: fetchErr } = await ctx.db
    .from('roles')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !current) {
    throw new Error('Role not found or access denied')
  }

  // Validate field-level permissions
  const fieldValidation = await permissions.validateUpdatePermissions(
    ctx,
    updates,
    current,
    'role'
  )
  
  if (!fieldValidation.valid) {
    throw new Error(fieldValidation.error)
  }

  // Update via RLS
  const { data, error: err } = await ctx.db
    .from('roles')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'role.updated', { type: 'role', id }, { before: current, after: data })

  return data
})
// ─── CHUNK_END: ROLES_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        9194c78a60e7d12b7acf6981bbc56afdfbe9e922c52739394240fca5adcfa069
 * @macro       Role Remove Handler
 * @micro       Soft-deletes role with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Role id for deletion
 * @outputs     Updated role record with is_active: false
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB soft delete, audit logging]
 * @tags        roles, remove, soft-delete, audit
 */
export const remove = createHandler(async (ctx, body) => {
  const { id } = body

  if (!id) {
    throw new Error('Role ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Verify access via RLS fetch
  const { data: current, error: fetchErr } = await ctx.db
    .from('roles')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !current) {
    throw new Error('Role not found or access denied')
  }

  // Soft delete via RLS
  const { data, error: err } = await ctx.db
    .from('roles')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'role.deleted', { type: 'role', id }, { before: current })

  return data
})
// ─── CHUNK_END: ROLES_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: ROLES_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    ROLES_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        14c00f276a22287ed65c019efe327cbb513f860a408191e299864b05c641833c
 * @macro       Roles Router
 * @micro       Routes HTTP methods to appropriate role handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH/DELETE operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove)
 * @depends-on  [createHandler, list, get, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        roles, router, crud, netlify-function
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
// ─── CHUNK_END: ROLES_HANDLER ────────────────────────────────────────────────
