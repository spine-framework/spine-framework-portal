/**
 * @module types
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD API for the `types` table. Types are the schema configuration objects
 * that define `design_schema`, `validation_schema`, field definitions, and
 * view configurations for runtime entities (`items`, `people`, `accounts`).
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/types`
 *
 * **Authorization model:**
 * - All reads use `ctx.db` (RLS-scoped) and are sanitized via `sanitizeRecordData`.
 * - All writes (`create`, `update`, `remove`) require `isSystemAdmin` AND the
 *   caller's account must be a master tenant (`accounts.parent_id IS NULL`).
 * - Unauthenticated `list` calls receive minimal fields only (id, slug, name, kind).
 *
 * **Design schema auto-sync:** `update` regenerates `validation_schema` automatically
 * via `generateValidationSchema` whenever `design_schema` changes.
 *
 * INVARIANT: type slugs must be unique per (kind, app_id) combination.
 * INVARIANT: `ownership` of system types cannot be changed (to prevent constraint violations).
 * INVARIANT: `app_id = null` for system types; must be provided for app/tenant types.
 *
 * @seeAlso middleware.ts (createHandler, CoreContext)
 * @seeAlso permissions.ts (PermissionEngine, sanitizeRecordData, validateUpdatePermissions)
 * @seeAlso schema-utils.ts (generateValidationSchema — auto-called on design_schema updates)
 * @seeAlso audit.ts (emitLog for type.created / type.updated / type.deleted)
 */

import { createHandler } from './_shared/middleware'
import { adminDb, joins } from './_shared/db'
import { emitLog } from './_shared/audit'
import { PermissionEngine, sanitizeRecordData } from './_shared/permissions'
import { generateValidationSchema } from './_shared/schema-utils'

const permissions = PermissionEngine as any

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_LIST_1_0_0
 * @version     1.0.0
 * @hash        0cfcf45a5a70d17002599b77e1c45bf7d3de456bc474e68a89ff44069d711b91
 * @macro       Types List Handler
 * @micro       Lists types with filtering, authentication-based response, and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of type records with app join, sanitized and schema-aware
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization, schema preservation]
 * @tags        types, list, crud, filtering, authentication
 */
export const list = createHandler(async (ctx, body) => {
  const { kind, app_id, ownership, limit = '50', offset = '0', include_schema } = ctx.query || {}

  // RLS automatically filters to accessible accounts
  let query = ctx.db
    .from('types')
    .select(`*, ${joins.app}`)
    .eq('is_active', true)
    .order('kind')
    .order('name')

  if (kind) {
    query = query.eq('kind', kind)
  }

  if (app_id) {
    query = query.eq('app_id', app_id)
  } else if (app_id === 'null') {
    query = query.is('app_id', null)
  }

  if (ownership) {
    query = query.eq('ownership', ownership)
  }

  const { data, error: err } = await query
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (err) throw err

  // For authenticated users, always include design_schema for schema-driven UI
  // System admin sees everything, others get sanitized data with design_schema preserved
  // When include_schema=true, preserve full design_schema for all accessible types
  const sanitized = []
  for (const type of data || []) {
    if (ctx.principal) {
      // Authenticated user - get sanitized data but preserve design_schema
      const sanitizedType = await sanitizeRecordData(ctx, type, 'type')
      // Ensure design_schema is preserved for schema-driven UI
      if (type.design_schema && !sanitizedType.design_schema) {
        sanitizedType.design_schema = type.design_schema
      }
      // When include_schema=true, also preserve validation_schema
      if (include_schema === 'true' && type.validation_schema) {
        sanitizedType.validation_schema = type.validation_schema
      }
      sanitized.push(sanitizedType)
    } else {
      // Unauthenticated user - return minimal data
      const minimal: any = {
        id: type.id,
        slug: type.slug,
        name: type.name,
        kind: type.kind
      }
      // When include_schema=true, unauthenticated users also get schema
      if (include_schema === 'true' && type.design_schema) {
        minimal.design_schema = type.design_schema
      }
      sanitized.push(minimal)
    }
  }

  return sanitized
})
// ─── CHUNK_END: TYPES_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_GET ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_GET_1_0_0
 * @version     1.0.0
 * @hash        435ff5a93d05f74e0299b515d32f50ceb5c526b517a6972ef65c3bdaa75c218f
 * @macro       Type Get Handler
 * @micro       Returns single type record with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Sanitized type record with app join
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        types, get, crud, single-record
 */
export const get = createHandler(async (ctx, body) => {
  const { id } = ctx.query || {}
  
  if (!id) {
    throw new Error('Type ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('types')
    .select(`*, ${joins.app}`)
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (err) throw err

  // Sanitize based on role permissions
  return await sanitizeRecordData(ctx, data, 'type')
})
// ─── CHUNK_END: TYPES_GET ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_GET_BY_SLUG ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_GET_BY_SLUG_1_0_0
 * @version     1.0.0
 * @hash        6585200f3ecdef92e2912849afd5d72a3968fe13b464cdf43f33a888edda4163
 * @macro       Type Get By Slug Handler
 * @micro       Returns single type record by slug with joins and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Sanitized type record with app join
 * @depends-on  [createHandler, joins, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        types, get, crud, single-record, slug
 */
export const getBySlug = createHandler(async (ctx, body) => {
  const { slug } = ctx.query || {}
  
  if (!slug) {
    throw new Error('Type slug is required')
  }

  const { data, error: err } = await ctx.db
    .from('types')
    .select(`*, ${joins.app}`)
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (err) throw err

  // Sanitize based on role permissions
  return await sanitizeRecordData(ctx, data, 'type')
})
// ─── CHUNK_END: TYPES_GET_BY_SLUG ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_GET_SCHEMA ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_GET_SCHEMA_1_0_0
 * @version     1.0.0
 * @hash        2cff73f363bb53c145d64b5b2fc788de592a94321000425f6b2ab82489c9a1e4
 * @macro       Type Schema Handler
 * @micro       Returns design_schema for a type via RPC
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     {design_schema: object} — Type design schema
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB RPC call, RLS enforcement]
 * @tags        types, schema, rpc, design-schema
 */
export const getSchema = createHandler(async (ctx, body) => {
  const { kind, slug, app_id } = ctx.query || {}

  if (!kind || !slug) {
    throw new Error('kind and slug are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_type_schema', {
      kind,
      slug,
      app_id: app_id || null
    })

  if (err) throw err

  return { design_schema: data }
})
// ─── CHUNK_END: TYPES_GET_SCHEMA ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_CREATE_1_0_0
 * @version     1.0.0
 * @hash        c226d40910e332c0c89bfbb0d09f2b6a04b45a0a104c70d485ebd08c2c07cbe0
 * @macro       Type Create Handler
 * @micro       Creates type with system admin validation, schema generation, and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Type data including kind, slug, name, and optional fields
 * @outputs     Inserted type record
 * @depends-on  [createHandler, adminDb, permissions, generateValidationSchema, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, master tenant validation, schema generation, audit logging]
 * @tags        types, create, crud, system-admin, schema-generation, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { app_id, kind, slug, name, description, icon, color, design_schema: bodySchema = {}, ownership } = body

  if (!kind || !slug || !name) {
    throw new Error('kind, slug, and name are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Config mutations (types) are only allowed in master tenant by system admins
  if (!permissions.isSystemAdmin(ctx)) {
    throw new Error('Only system administrators can create type configurations')
  }

  // Verify the current account is a master tenant (parent_id IS NULL)
  // Use adminDb for this check since we're verifying account structure
  const { data: accountData } = await adminDb
    .from('accounts')
    .select('parent_id')
    .eq('id', ctx.accountId!)
    .single()

  if (!accountData || accountData.parent_id !== null) {
    throw new Error('Type configurations can only be created in master tenant accounts')
  }

  // Check if slug is unique within app/kind
  let query = adminDb
    .from('types')
    .select('id')
    .eq('kind', kind)
    .eq('slug', slug)

  if (app_id) {
    query = query.eq('app_id', app_id)
  } else {
    query = query.is('app_id', null)
  }

  const { data: existing } = await query.single()

  if (existing) {
    throw new Error('Type slug already exists for this kind and app')
  }

  // Basic schema validation
  if (bodySchema && typeof bodySchema === 'object') {
    if (bodySchema.fields && (typeof bodySchema.fields !== 'object' || bodySchema.fields === null)) {
      throw new Error('Schema fields must be an object')
    }
  }

  // For non-system ownership, we need an app_id to satisfy the constraint
  let finalAppId = app_id
  let finalOwnership = ownership
  
  if (!app_id && ownership !== 'system') {
    // Get the first available app for tenant/custom types
    const { data: apps } = await adminDb
      .from('apps')
      .select('id')
      .limit(1)
      .single()
    
    if (apps?.id) {
      finalAppId = apps.id
      finalOwnership = 'app' // Use 'app' ownership when associated with an app
    } else {
      throw new Error('Cannot create type without app_id for non-system ownership')
    }
  }

  // Generate validation schema from design schema
  const validationSchema = generateValidationSchema(bodySchema || {})

  const { data, error: err } = await adminDb
    .from('types')
    .insert({
      app_id: finalAppId,
      kind,
      slug,
      name,
      description,
      icon,
      color,
      design_schema: bodySchema || {},
      validation_schema: validationSchema,
      ownership: finalOwnership || 'system',
      is_active: true
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'type.created', { type: 'type', id: data.id }, { after: data })

  return data
})
// ─── CHUNK_END: TYPES_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        7778ce63ecc3dd50fe50680c4f1199a59db4c4dae734cf7a2d58cc2de76b9a6a
 * @macro       Type Update Handler
 * @micro       Updates type with validation, schema regeneration, and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Type updates including id and updatable fields
 * @outputs     Updated type record
 * @depends-on  [createHandler, adminDb, permissions, generateValidationSchema, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, field validation, schema regeneration, audit logging]
 * @tags        types, update, crud, system-admin, schema-generation, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, ...updates } = body || {}

  if (!id) {
    throw new Error('Type ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible types
  const { data: current } = await adminDb
    .from('types')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Type not found')
  }

  // Config mutations (types) are only allowed in master tenant by system admins
  if (!permissions.isSystemAdmin(ctx)) {
    throw new Error('Only system administrators can update type configurations')
  }

  // System types can only be updated by system admins (already checked above)
  // App types require app ownership verification
  if (current.ownership === 'app' && current.app_id) {
    // Verify user has access to this app
    const { data: appAccess } = await adminDb
      .from('apps')
      .select('id')
      .eq('id', current.app_id)
      .eq('is_active', true)
      .single()
    
    if (!appAccess) {
      throw new Error('App not found or inactive')
    }
  }

  // Verify the current account is a master tenant (parent_id IS NULL)
  // Use adminDb for this check since we're verifying account structure
  const { data: accountData } = await adminDb
    .from('accounts')
    .select('parent_id')
    .eq('id', ctx.accountId!)
    .single()

  if (!accountData || accountData.parent_id !== null) {
    throw new Error('Type configurations can only be updated in master tenant accounts')
  }

  // Validate field-level permissions
  const fieldValidation = await permissions.validateUpdatePermissions(
    ctx,
    updates,
    current,
    'type'
  )
  
  if (!fieldValidation.valid) {
    throw new Error(fieldValidation.error)
  }

  // Prevent ownership changes for system types to avoid constraint violations
  if (current.ownership === 'system' && updates.ownership && updates.ownership !== 'system') {
    // Remove ownership from updates to preserve system ownership
    delete updates.ownership
  }

  // Handle app_id null conversion for system types
  if (updates.app_id === '') {
    updates.app_id = null
  }

  // Validate design_schema if being updated
  if (updates.design_schema) {
    if (typeof updates.design_schema !== 'object' || updates.design_schema === null) {
      throw new Error('Design schema must be an object')
    }
    if (updates.design_schema.fields && (typeof updates.design_schema.fields !== 'object' || updates.design_schema.fields === null)) {
      throw new Error('Design schema fields must be an object')
    }
    
    // Auto-generate validation_schema when design_schema changes
    updates.validation_schema = generateValidationSchema(updates.design_schema)
  }

  const { data, error: err } = await ctx.db
    .from('types')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'type.updated', { type: 'type', id }, { before: current, after: data })

  return data
})
// ─── CHUNK_END: TYPES_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_REMOVE ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_REMOVE_1_0_0
 * @version     1.0.0
 * @hash        eef22a9e3f661c71c65ba5d69ce7e60c2c2bfccec986ad2309290217f5332455
 * @macro       Type Remove Handler
 * @micro       Soft-deletes type with system admin validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Type id for deletion
 * @outputs     Updated type record with is_active: false
 * @depends-on  [createHandler, adminDb, permissions, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB soft delete, master tenant validation, audit logging]
 * @tags        types, remove, soft-delete, system-admin, audit
 */
export const remove = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id

  if (!id) {
    throw new Error('Type ID is required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  // Get current state for audit - RLS will filter to accessible types
  const { data: current } = await ctx.db
    .from('types')
    .select('*')
    .eq('id', id)
    .single()

  if (!current) {
    throw new Error('Type not found')
  }

  // Config mutations (types) are only allowed in master tenant by system admins
  if (!permissions.isSystemAdmin(ctx)) {
    throw new Error('Only system administrators can delete type configurations')
  }

  // System types can only be deleted by system admins (already checked above)
  // App types require app ownership verification
  if (current.ownership === 'app' && current.app_id) {
    // Verify user has access to this app
    const { data: appAccess } = await ctx.db
      .from('apps')
      .select('id')
      .eq('id', current.app_id)
      .eq('is_active', true)
      .single()
    
    if (!appAccess) {
      throw new Error('App not found or inactive')
    }
  }

  // Verify the current account is a master tenant (parent_id IS NULL)
  // Use adminDb for this check since we're verifying account structure
  const { data: accountData } = await adminDb
    .from('accounts')
    .select('parent_id')
    .eq('id', ctx.accountId!)
    .single()

  if (!accountData || accountData.parent_id !== null) {
    throw new Error('Type configurations can only be deleted in master tenant accounts')
  }

  const { data, error: err } = await ctx.db
    .from('types')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'type.deleted', { type: 'type', id }, { before: current })

  return data
})
// ─── CHUNK_END: TYPES_REMOVE ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: TYPES_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    TYPES_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        70e9e120f669468bd7aa45d7a2b8b4cf9a13a2323f897a6fc2bd389d960f8adc
 * @macro       Types Router
 * @micro       Routes HTTP methods and actions to appropriate type handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH/DELETE operations
 * @outputs     Varies — Depends on routed handler (list/get/getBySlug/getSchema/create/update/remove)
 * @depends-on  [createHandler, list, get, getBySlug, getSchema, create, update, remove]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        types, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const method = ctx.query?.method || 'GET'
  const action = ctx.query?.action

  switch (method) {
    case 'GET':
      if (action === 'get' && ctx.query?.slug) {
        return await getBySlug(ctx, body)
      } else if (ctx.query?.id) {
        return await get(ctx, body)
      } else if (action === 'schema') {
        return await getSchema(ctx, body)
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
// ─── CHUNK_END: TYPES_HANDLER ────────────────────────────────────────────────
