/**
 * @module api-keys
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Management and validation API for the `api_keys` table. API keys are
 * issued per-integration and optionally scoped to specific permissions.
 * Key material is generated and stored by the `create_api_key` Postgres
 * RPC, which handles hashing internally. Validation also delegates to the
 * `validate_api_key` RPC.
 *
 * **Routed by:** `GET/POST /.netlify/functions/api-keys`
 *
 * **Actions:**
 * | method | ?action    | handler       |
 * |--------|------------|---------------|
 * | POST   | validate   | validate      |
 * | POST   | revoke     | revoke        |
 * | GET    | usage-logs | listUsageLogs |
 * | GET    | ?id        | get           |
 * | GET    | (default)  | list          |
 * | POST   | —          | create        |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Account context
 * required for creates. No PATCH/DELETE — use `revoke` for deactivation.
 *
 * INVARIANT: Raw key material is never stored. Only the hash is persisted.
 *   `create` returns the plaintext key once via RPC response.
 * INVARIANT: `revoke` soft-deactivates by setting `is_active = false`.
 *
 * @seeAlso integrations.ts (integration_id FK on api_keys)
 * @seeAlso audit.ts (emitLog for api_key.* events)
 */

import { createHandler } from './_shared/middleware'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_LIST_1_0_0
 * @version     1.0.0
 * @hash        f825d8f4bbabe21071b61fe41e5e4e1b87482d501bf4078fab70906b7a5f5e78
 * @macro       API Keys List Handler
 * @micro       Lists API keys with filtering, pagination, and joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized API key records with integration joins
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        api-keys, list, crud, pagination
 */
export const list = createHandler(async (ctx, _body) => {
  const { integration_id, key_type, is_active, expires_before, expires_after, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('api_keys')
    .select(`
      *,
      integration:integrations(id, name, provider, integration_type),
      created_by_person:people(id, full_name, email)
    `)
    .order('created_at', { ascending: false })

  if (integration_id) {
    query = query.eq('integration_id', integration_id)
  }
  if (key_type) {
    query = query.eq('key_type', key_type)
  }
  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true')
  }
  if (expires_before) {
    query = query.lte('expires_at', expires_before)
  }
  if (expires_after) {
    query = query.gte('expires_at', expires_after)
  }

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  const sanitized = []
  for (const key of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, key, 'api_key'))
  }

  return sanitized
})
// ─── CHUNK_END: API_KEYS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_GET_1_0_0
 * @version     1.0.0
 * @hash        357f926aeb833ad0ca755e48350534771f491890645134a1b43d2f2a8e4be037
 * @macro       API Key Get Handler
 * @micro       Returns a single API key record with joins (no raw key material)
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized API key record with integration and createdBy joins
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        api-keys, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('API key ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('api_keys')
    .select(`
      *,
      integration:integrations(id, name, provider, integration_type),
      created_by_person:people(id, full_name, email)
    `)
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'api_key')
})
// ─── CHUNK_END: API_KEYS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        8d00c97111cddebc2b3821a1fee3e6cf4c6b7c55fc20cd19d70865d728c3387c
 * @macro       API Key Create Handler
 * @micro       Creates new API key via RPC with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — API key configuration data
 * @outputs     RPC result containing api_key_id and plaintext key_value
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [RPC call, audit logging]
 * @tags        api-keys, create, crud, rpc, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { integration_id, name, key_type, key_prefix, permissions, rate_limit, expires_at, metadata } = body

  if (!name) {
    throw new Error('name is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { data, error: err } = await ctx.db
    .rpc('create_api_key', {
      integration_id,
      name,
      key_type: key_type || 'private',
      key_prefix: key_prefix || 'sk_',
      permissions: permissions || {},
      rate_limit: rate_limit || 1000,
      expires_at,
      metadata: metadata || {},
      created_by: ctx.principal?.id,
      account_id: ctx.accountId
    })

  if (err) throw err

  await emitLog(ctx, 'api_key.created', 
    { type: 'api_key', id: data[0]?.api_key_id }, 
    { after: { name, key_type, rate_limit } }
  )

  return data
})
// ─── CHUNK_END: API_KEYS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_VALIDATE ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_VALIDATE_1_0_0
 * @version     1.0.0
 * @hash        05791f9b2c23bfebed01dffaa1430e896b89d311c5a51409704d731200eb621a
 * @macro       API Key Validation Handler
 * @micro       Validates API key and checks permissions via RPC
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — key_value and optional required_permissions
 * @outputs     RPC validation result with is_valid, account_id, permissions
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing, middleware]
 * @side-effects [RPC validation call]
 * @tags        api-keys, validate, rpc, authentication
 */
export const validate = createHandler(async (ctx, body) => {
  const { key_value, required_permissions } = body

  if (!key_value) {
    throw new Error('key_value is required')
  }

  const { data, error: err } = await ctx.db
    .rpc('validate_api_key', {
      key_value,
      required_permissions: required_permissions || {}
    })

  if (err) throw err

  return data
})
// ─── CHUNK_END: API_KEYS_VALIDATE ────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_REVOKE ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_REVOKE_1_0_0
 * @version     1.0.0
 * @hash        3302286a12c1315616470fcfbd3cbdc8dcf63dd00211a71159f3325bab95607a
 * @macro       API Key Revoke Handler
 * @micro       Soft-deactivates API key with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — API key ID to revoke
 * @outputs     Updated API key record with is_active: false
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        api-keys, revoke, crud, audit
 */
export const revoke = createHandler(async (ctx, body) => {
  const { id } = body

  if (!id) {
    throw new Error('API key ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('api_keys')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'api_key.revoked', 
    { type: 'api_key', id }, 
    { after: { revoked_by: ctx.principal?.id } }
  )

  return data
})
// ─── CHUNK_END: API_KEYS_REVOKE ────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_LIST_USAGE_LOGS ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_LIST_USAGE_LOGS_1_0_0
 * @version     1.0.0
 * @hash        f21e004490dd983c8f20dc1d1f4db33e158334d19e38a4ace5e99389a8a96ded
 * @macro       API Key Usage Logs Handler
 * @micro       Lists paginated API key usage logs with filtering and joins
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of usage log records with api_key joins
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries with filtering]
 * @tags        api-keys, usage-logs, pagination, monitoring
 */
export const listUsageLogs = createHandler(async (ctx, _body) => {
  const { api_key_id, response_status, success, date_from, date_to, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('api_key_usage_logs')
    .select(`
      *,
      api_key:api_keys(id, name, key_type)
    `)
    .order('created_at', { ascending: false })

  if (api_key_id) {
    query = query.eq('api_key_id', api_key_id)
  }
  if (response_status) {
    query = query.eq('response_status', parseInt(response_status.toString()))
  }
  if (success !== undefined) {
    query = query.eq('success', success === 'true')
  }
  if (date_from) {
    query = query.gte('created_at', date_from)
  }
  if (date_to) {
    query = query.lte('created_at', date_to)
  }

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return data
})
// ─── CHUNK_END: API_KEYS_LIST_USAGE_LOGS ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: API_KEYS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    API_KEYS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        6c2da419bea6f12b0fe654e2aad6c5ebac3d5993c2547a47d239f44197d90a68
 * @macro       API Keys Router
 * @micro       Routes HTTP methods and actions to appropriate handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST operations
 * @outputs     Varies — Depends on routed handler (list/get/create/validate/revoke/usage-logs)
 * @depends-on  [createHandler, list, get, create, validate, revoke, listUsageLogs]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        api-keys, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'validate':
      if (method === 'POST') {
        return await validate(ctx, body)
      }
      break
    case 'revoke':
      if (method === 'POST') {
        return await revoke(ctx, body)
      }
      break
    case 'usage-logs':
      if (method === 'GET') {
        return await listUsageLogs(ctx, body)
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
      }
  }

  throw new Error('Invalid action or method')
})
// ─── CHUNK_END: API_KEYS_HANDLER ────────────────────────────────────────────────
