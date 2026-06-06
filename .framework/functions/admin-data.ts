/**
 * @module admin-data
 * @audience both
 * @layer api-handler
 * @stability stable
 *
 * Generic CRUD API for all runtime entities. Provides list, get, create,
 * update, delete, and stats operations over a validated set of entity tables.
 *
 * **Routed by:** `GET/POST/PATCH/DELETE /.netlify/functions/admin-data`
 *
 * **Dispatch table (query params → handler):**
 * | method | ?action | ?id present | Handler |
 * |--------|---------|-------------|---------|
 * | GET    | list    | any         | `list`  |
 * | GET    | get     | any         | `get`   |
 * | GET    | stats   | any         | `stats` |
 * | GET    | —       | yes         | `get`   |
 * | GET    | —       | no          | `list`  |
 * | POST   | —       | —           | `create`|
 * | PATCH  | —       | —           | `update`|
 * | DELETE | —       | —           | `remove`|
 *
 * **Authorization:** All DB reads/writes use `ctx.db` (RLS-scoped client).
 * RLS policies on each table enforce account hierarchy access automatically.
 * `adminDb` is used only for lookups that need bypass (type resolution).
 *
 * **Valid entities:** `accounts`, `people`, `items`, `threads`, `messages`,
 * `links`, `attachments`, `watchers`.
 *
 * INVARIANT: every `create` call requires `type_id` in the body — all runtime
 *   records must reference a type.
 * INVARIANT: trigger dispatch (create/update/delete) is fire-and-forget —
 *   trigger failures are logged but never surface to the caller.
 * INVARIANT: all returned records are passed through `sanitizeRecordData`
 *   before being returned — field-level permission stripping is always applied.
 *
 * @seeAlso middleware.ts (createHandler, CoreContext)
 * @seeAlso permissions.ts (sanitizeRecordData)
 * @seeAlso trigger-engine.ts (fire*Triggers)
 * @seeAlso types.ts (types table, design_schema, validation_schema)
 */

import { createHandler } from './_shared/middleware'
import { sanitizeRecordData } from './_shared/permissions'
import { adminDb } from './_shared/db'
import { fireCreateTriggers, fireUpdateTriggers, fireDeleteTriggers } from './_shared/trigger-engine'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PERMISSIONS_ALL = {
  record_permissions: { all: ['create', 'read', 'update', 'delete'] },
  fields: {}
}

/**
 * Allowlist of entity table names accepted by this handler.
 * Any entity string not in this set causes a 400-equivalent throw.
 */
const VALID_ENTITIES = ['accounts', 'people', 'items', 'threads', 'messages', 'links', 'attachments', 'watchers', 'item_progress']

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: ADMIN_DATA_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_LIST_1_0_0
 * @version     1.0.0
 * @hash        780f1f0c81ea3bff78d40970ba4b03e3211d892bb883e6a099c6e0a55ee53b0c
 * @macro       Entity List Handler
 * @micro       Lists records with filtering, search, sorting, and pagination
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized records or {data, schema, view} with view config
 * @depends-on  [createHandler, sanitizeRecordData, adminDb, getSearchField]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        admin, crud, list, pagination, search
 */
export const list = createHandler(async (ctx, _body) => {
  // Extract all reserved query params to prevent them from being used as column filters
  const { entity, action, method, search, sort_field = 'created_at', sort_direction = 'desc', limit = 50, offset = 0, type_slug, view: viewSlug, ...filters } = ctx.query || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    throw new Error('Valid entity parameter is required')
  }

  // Use ctx.db - RLS-scoped client based on principal
  // RLS policies enforce account hierarchy access automatically
  let query = ctx.db.from(entity).select('*')

  // Apply type_slug filter if provided (for schema-driven entities)
  if (type_slug && entity === 'items') {
    // Look up the type ID from the slug
    const { data: typeRecord } = await adminDb
      .from('types')
      .select('id')
      .eq('slug', type_slug)
      .eq('is_active', true)
      .single()
    
    if (typeRecord) {
      query = query.eq('type_id', typeRecord.id)
    }
  }

  // Apply search if provided
  if (search) {
    // Search in display field based on entity
    const searchField = getSearchField(entity)
    query = query.ilike(searchField, `%${search}%`)
  }

  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'is_active' || key === 'is_verified' || key === 'is_primary') {
        query = query.eq(key, value === 'true')
      } else {
        query = query.eq(key, value)
      }
    }
  })

  // Apply sorting
  query = query.order(sort_field, { ascending: sort_direction === 'asc' })

  // Get total count (RLS filters automatically)
  const { count, error: countError } = await ctx.db.from(entity)
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('List count error:', countError)
    throw new Error(countError.message || 'Database error getting count')
  }

  // Apply pagination
  query = query.range(parseInt(offset.toString()), parseInt(offset.toString()) + parseInt(limit.toString()) - 1)

  const { data, error: err } = await query

  if (err) {
    console.error('List query error:', err)
    throw new Error(err.message || 'Database error listing records')
  }

  // RLS policies already filtered the data - just sanitize
  const sanitizedData = []
  for (const record of data || []) {
    const sanitizedRecord = await sanitizeRecordData(ctx, record, entity)
    sanitizedData.push(sanitizedRecord)
  }

  // If ?view=slug was requested, resolve schema + view config from the type record
  if (viewSlug && type_slug) {
    const { data: typeRecord } = await adminDb
      .from('types')
      .select('design_schema')
      .eq('slug', type_slug)
      .eq('is_active', true)
      .single()

    if (typeRecord?.design_schema) {
      const schema = typeRecord.design_schema
      const resolvedView = schema.views?.[viewSlug] || null
      return { data: sanitizedData, schema, view: resolvedView }
    }
  }

  return sanitizedData
})
// ─── CHUNK_END: ADMIN_DATA_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: ADMIN_DATA_GET ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_GET_1_0_0
 * @version     1.0.0
 * @hash        7ee27702615d7ebd144e065d399635ddf7664845685345d8a8f316449f11a7cf
 * @macro       Entity Get Handler
 * @micro       Returns a single record by ID with optional view configuration
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized record or {data, schema, view} with view config
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        admin, crud, get, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { entity, id, view: viewSlug } = ctx.query || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    throw new Error('Valid entity parameter is required')
  }

  if (!id) {
    throw new Error('ID parameter is required')
  }

  // RLS will filter based on account hierarchy access
  const { data, error: err } = await ctx.db.from(entity)
    .select('*')
    .eq('id', id)
    .single()

  if (err) throw err

  if (!data) {
    throw new Error('Record not found')
  }

  const sanitizedRecord = await sanitizeRecordData(ctx, data, entity)

  // If ?view=slug was requested, include schema + resolved view from the record's stamped schema
  if (viewSlug && sanitizedRecord?.design_schema) {
    const schema = sanitizedRecord.design_schema
    const resolvedView = schema.views?.[viewSlug] || null
    return { data: sanitizedRecord, schema, view: resolvedView }
  }

  return sanitizedRecord
})
// ─── CHUNK_END: ADMIN_DATA_GET ────────────────────────────────────────────────

/**
 * Creates a new record for an entity. Stamps `design_schema`,
 * `validation_schema`, audit fields, and `account_id` from the resolved type.
 * Fires `*_created` triggers asynchronously after DB insert.
 *
 * Body params:
 *   - `entity` (required) — one of VALID_ENTITIES
 *   - `type_id` (required) — UUID of an active type record
 *   - all other fields are passed through to the insert
 *
 * @returns Sanitized created record
 * @throws Error('Valid entity parameter is required')
 * @throws Error('type_id is required')
 * @throws Error('type_id not found') — if type UUID doesn't exist
 * @throws Error('type_id references an inactive type')
 * @throws PostgREST error on RLS INSERT denial
 * @inputSpec type_id: string — valid UUID of active type record
 * @inputSpec body fields: Record<string, any> — record field values
 * @outputSpec sanitized created record
 * @sideEffects DB write: entity table (INSERT)
 * @sideEffects DB read: types table (type resolution)
 * @sideEffects fire-and-forget: fireCreateTriggers
 * @calledBy handler (POST)
 * @calls sanitizeRecordData, adminDb (type lookup), fireCreateTriggers
 * @testUnit tests/unit/admin-data.test.ts — 'create'
 * @testIntegration tests/integration/admin-data.test.ts — 'create'
 */
export const create = createHandler(async (ctx, body) => {
  const entity = body?.entity || ctx.query?.entity
  const { entity: _e, design_schema: _ds, validation_schema: _vs, account_id: _ai, ...recordData } = body || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    const e: any = new Error('Valid entity parameter is required'); e.statusCode = 400; throw e
  }

  // type_id is required on all runtime record creation
  if (!recordData.type_id) {
    const e: any = new Error('type_id is required — every runtime record must reference a type'); e.statusCode = 400; throw e
  }

  // Look up the type to stamp design_schema and validation_schema
  const { data: typeRecord, error: typeErr } = await adminDb
    .from('types')
    .select('id, design_schema, validation_schema, is_active')
    .eq('id', recordData.type_id)
    .single()

  if (typeErr || !typeRecord) {
    throw new Error(`type_id not found: ${recordData.type_id}`)
  }

  if (!typeRecord.is_active) {
    throw new Error(`type_id references an inactive type: ${recordData.type_id}`)
  }

  // Ensure the type has at least permissions=ALL (defensive — migration 062 guarantees this)
  let designSchema = typeRecord.design_schema || {}
  if (!designSchema.record_permissions) {
    designSchema = { ...PERMISSIONS_ALL, ...designSchema }
  }

  // Resolve account_id and propagate scope via parent inheritance (Option A)
  // Priority: parent reference in body > type's own scope declaration
  let recordAccountId = ctx.accountId
  const parentRef = recordData.thread_id || recordData.target_id || recordData.parent_id
  if (parentRef) {
    const parentTable = recordData.thread_id ? 'threads' : 'items'
    const { data: parentRecord } = await ctx.db
      .from(parentTable)
      .select('account_id, design_schema')
      .eq('id', parentRef)
      .maybeSingle()
    if (!parentRecord) {
      const e: any = new Error('Parent record not found or not accessible'); e.statusCode = 403; throw e
    }
    recordAccountId = parentRecord.account_id
    const parentScope = parentRecord.design_schema?.scope
    if (parentScope) {
      designSchema = { ...designSchema, scope: parentScope }
    }
  } else {
    const scope: string = designSchema.scope ?? 'account'
    if (scope === 'platform') {
      const { data: sysAccount } = await adminDb
        .from('accounts')
        .select('id')
        .eq('slug', 'spine-system')
        .single()
      if (sysAccount?.id) recordAccountId = sysAccount.id
    }
  }

  // Add audit fields + stamped schema
  const dataToInsert = {
    ...recordData,
    design_schema:     designSchema,
    validation_schema: typeRecord.validation_schema || {},
    created_by: ctx.principal?.id,
    account_id: recordAccountId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // RLS will check if user has INSERT permission on this account
  const { data, error: err } = await ctx.db.from(entity)
    .insert(dataToInsert)
    .select()
    .single()

  if (err) throw err

  // Fire triggers asynchronously (don't block response)
  const entityData = { ...dataToInsert, id: data.id }
  fireCreateTriggers(entity, data.id, entityData, ctx).catch(console.error)

  return await sanitizeRecordData(ctx, data, entity)
})

/**
 * Updates an existing record by ID. Stamps `updated_by` and `updated_at`.
 * Fires `*_updated` triggers asynchronously after DB update.
 *
 * Query params: `entity` (required), `id` (required)
 * Body: partial record fields to update (no schema re-stamping on update)
 *
 * @returns Sanitized updated record
 * @throws Error('Valid entity parameter is required')
 * @throws Error('ID is required for update')
 * @throws PostgREST error on RLS UPDATE denial
 * @inputSpec id: string — valid UUID of existing record
 * @inputSpec body: Partial<Record> — fields to patch
 * @outputSpec sanitized updated record
 * @sideEffects DB write: entity table (UPDATE)
 * @sideEffects fire-and-forget: fireUpdateTriggers
 * @calledBy handler (PATCH)
 * @calls sanitizeRecordData, fireUpdateTriggers
 * @testUnit tests/unit/admin-data.test.ts — 'update'
 */
export const update = createHandler(async (ctx, body) => {
  const { entity, id } = ctx.query || {}
  // Strip server-only fields — client must never override these on update
  const { design_schema: _ds, validation_schema: _vs, account_id: _ai, type_id: _ti, ...recordData } = body || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    throw new Error('Valid entity parameter is required')
  }

  if (!id) {
    throw new Error('ID is required for update')
  }

  // Add audit fields
  const dataToUpdate = {
    ...recordData,
    updated_by: ctx.principal?.id,
    updated_at: new Date().toISOString()
  }

  // RLS will check UPDATE permission on this record
  const { data, error: err } = await ctx.db.from(entity)
    .update(dataToUpdate)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  // Fire triggers asynchronously (don't block response)
  const entityData = { ...data, ...dataToUpdate }
  fireUpdateTriggers(entity, id, entityData, ctx).catch(console.error)

  return await sanitizeRecordData(ctx, data, entity)
})

/**
 * Deletes a record by ID. Defaults to soft delete (`is_active = false`) for
 * entities that support it; falls back to hard delete otherwise.
 *
 * Query params:
 *   - `entity` (required) — one of VALID_ENTITIES
 *   - `id` (required) — UUID of the record
 *   - `soft` (default: 'true') — set to 'false' to force hard delete
 *
 * Soft-delete-capable entities: `accounts`, `people`, `items`, `threads`,
 * `messages`, `watchers`. All others always receive a hard delete.
 *
 * @returns `{ deleted: true, soft: true, data }` (soft) or `{ deleted: true, soft: false }` (hard)
 * @throws Error('Valid entity parameter is required')
 * @throws Error('ID is required for delete')
 * @throws PostgREST error on RLS DELETE denial
 * @inputSpec id: string — valid UUID
 * @inputSpec soft: 'true' | 'false'
 * @outputSpec { deleted: boolean, soft: boolean, data?: sanitizedRecord }
 * @sideEffects DB write: UPDATE is_active=false (soft) or DELETE (hard)
 * @sideEffects fire-and-forget: fireDeleteTriggers
 * @calledBy handler (DELETE)
 * @calls sanitizeRecordData, entitySupportsSoftDelete, fireDeleteTriggers
 * @testUnit tests/unit/admin-data.test.ts — 'remove'
 */
export const remove = createHandler(async (ctx, _body) => {
  const { entity, id, soft = 'true' } = ctx.query || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    throw new Error('Valid entity parameter is required')
  }

  if (!id) {
    throw new Error('ID is required for delete')
  }

  const isSoftDelete = soft === 'true'

  if (isSoftDelete && entitySupportsSoftDelete(entity)) {
    // Soft delete - set is_active to false
    // RLS will check DELETE permission on this record
    const { data, error: err } = await ctx.db.from(entity)
      .update({
        is_active: false,
        updated_by: ctx.principal?.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (err) throw err
    return { deleted: true, soft: true, data: await sanitizeRecordData(ctx, data, entity) }
  } else {
    // Hard delete
    // RLS will check DELETE permission on this record
    const { error: err } = await ctx.db.from(entity)
      .delete()
      .eq('id', id)

    if (err) throw err
    return { deleted: true, soft: false }
  }
})

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Returns the primary text field to use for `ilike` search for a given entity.
 * Falls back to 'id' for unmapped entities.
 *
 * @calledBy list (search param handling)
 */
// ─── CHUNK_START: ADMIN_DATA_GET_SEARCH_FIELD ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_GET_SEARCH_FIELD_1_0_0
 * @version     1.0.0
 * @hash        7c2615cf66a522b9b0df96cfbc8dfc50a2650016e967ceffd9172a770c78a26a
 * @macro       Search Field Resolver
 * @micro       Returns the primary display field for search functionality
 * @inputs      entity: string — Entity name from VALID_ENTITIES
 * @outputs     string — Column name to search in
 * @depends-on  [none]
 * @depended-by [list]
 * @side-effects [none]
 * @tags        admin, search, field-mapping
 */
function getSearchField(entity: string): string {
  const searchFields: Record<string, string> = {
    accounts: 'display_name',
    people: 'full_name',
    items: 'title',
    threads: 'title',
    messages: 'content',
    links: 'link_type',
    attachments: 'filename',
    watchers: 'watch_type',
    item_progress: 'title'
  }
  return searchFields[entity] || 'id'
}
// ─── CHUNK_END: ADMIN_DATA_GET_SEARCH_FIELD ────────────────────────────────────────────────

// ─── CHUNK_START: ADMIN_DATA_ENTITY_SUPPORTS_SOFT_DELETE ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_ENTITY_SUPPORTS_SOFT_DELETE_1_0_0
 * @version     1.0.0
 * @hash        0438e650a11bfb4c25b90939780127d8912bdc5caeb772fe3049381d6497412d
 * @macro       Soft Delete Support Checker
 * @micro       Returns true if entity supports soft delete via is_active column
 * @inputs      entity: string — Entity name from VALID_ENTITIES
 * @outputs     boolean — True if entity has is_active column
 * @depends-on  [none]
 * @depended-by [remove]
 * @side-effects [none]
 * @tags        admin, soft-delete, entity-check
 */
function entitySupportsSoftDelete(entity: string): boolean {
  const softDeleteEntities = ['accounts', 'people', 'items', 'threads', 'messages', 'watchers', 'item_progress']
  return softDeleteEntities.includes(entity)
}
// ─── CHUNK_END: ADMIN_DATA_ENTITY_SUPPORTS_SOFT_DELETE ────────────────────────────────────────────────

// ─── CHUNK_START: ADMIN_DATA_STATS ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_STATS_1_0_0
 * @version     1.0.0
 * @hash        0bed523a260ab3959cb4e7150cca044f4e97ce91d7ae3386ab14b5f4182d74d7
 * @macro       Entity Stats Handler
 * @micro       Returns total record count for an entity scoped by account
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     {entity: string, count: number} — Entity name and record count
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB count query with RLS filtering]
 * @tags        admin, stats, count, entity
 */
export const stats = createHandler(async (ctx, _body) => {
  const { entity } = ctx.query || {}

  if (!entity || !VALID_ENTITIES.includes(entity)) {
    throw new Error('Valid entity parameter is required')
  }

  // RLS will filter count based on account hierarchy access
  const { count, error: err } = await ctx.db.from(entity)
    .select('*', { count: 'exact', head: true })

  if (err) throw err

  return { entity, count }
})
// ─── CHUNK_END: ADMIN_DATA_STATS ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: ADMIN_DATA_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    ADMIN_DATA_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        edceffa0d5c8b3c05b1a89188a274a586b6ebe8793ede427e2326876d7090df9
 * @macro       Admin Data Router
 * @micro       Routes HTTP methods and actions to appropriate CRUD handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/remove/stats)
 * @depends-on  [createHandler, list, get, create, update, remove, stats]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        admin, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'list':
      if (method === 'GET') {
        return await list(ctx, body)
      }
      break
    case 'get':
      if (method === 'GET') {
        return await get(ctx, body)
      }
      break
    case 'stats':
      if (method === 'GET') {
        return await stats(ctx, body)
      }
      break
    default:
      if (method === 'GET' && ctx.query?.id) {
        return await get(ctx, body)
      } else if (method === 'GET') {
        return await list(ctx, body)
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
// ─── CHUNK_END: ADMIN_DATA_HANDLER ────────────────────────────────────────────────
