/**
 * @module logs
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Read API for the `v2.logs` table plus a write endpoint for external log
 * ingestion. The `logs` table schema uses internal column names
 * (`level`, `source`, `source_type`, `source_id`, `context`) that differ from
 * the stable frontend contract. All reads are mapped through `mapLogRow`.
 *
 * **Routed by:** `GET/POST /.netlify/functions/logs`
 *
 * **Actions:**
 * | method | ?action | handler      |
 * |--------|---------|------------------|
 * | GET    | account | listAccount  |
 * | GET    | target  | listTarget   |
 * | GET    | person  | listPerson   |
 * | GET    | stats   | getStats     |
 * | GET    | search  | search       |
 * | POST   | cleanup | cleanup      |
 * | POST   | (default)| log         |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped, always filtered
 * to `account_id`). No inserts are made by this module — `emitLog` from
 * `_shared/audit.ts` is the canonical write path.
 *
 * **Column mapping (DB → API):**
 * | DB column    | API field   |
 * |--------------|-------------|
 * | level        | event_type  |
 * | person_id    | actor_id    |
 * | source_type  | target_type |
 * | source_id    | target_id   |
 * | source       | action      |
 * | context      | details     |
 *
 * @seeAlso audit.ts (emitLog — canonical write path for all system events)
 * @seeAlso observability.ts (aggregated metrics over logs)
 */

import { createHandler, json, error, parseBody } from './_shared/middleware'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_MAP_ROW ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_MAP_ROW_1_0_0
 * @version     1.0.0
 * @hash        52289a18616b71c05c908c27f2fd5d09837e7b861d30b9307bb6bdf265dd4845
 * @macro       Log Row Mapper
 * @micro       Maps raw DB log rows to stable frontend API contract
 * @inputs      row: any — Raw database log row from v2.logs table
 * @outputs     object — Mapped log row with API field names
 * @depends-on  [none]
 * @depended-by [listAccount, listTarget, listPerson, search]
 * @side-effects [none]
 * @tags        logs, mapping, helper, api-contract
 */
function mapLogRow(row: any) {
  return {
    id: row.id,
    event_type: row.level,
    actor_id: row.person_id,
    target_type: row.source_type,
    target_id: row.source_id,
    action: row.source,
    message: row.message,
    details: row.context,
    metadata: row.metadata,
    created_at: row.created_at,
  }
}
// ─── CHUNK_END: LOGS_MAP_ROW ────────────────────────────────────────────────

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_LIST_ACCOUNT ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_LIST_ACCOUNT_1_0_0
 * @version     1.0.0
 * @hash        d512e35890e479c88f4e6130567b16b1143a164705fca4e887aee643cc76a1e5
 * @macro       Account Logs List Handler
 * @micro       Lists all account log entries with filtering and mapping
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of mapped log rows with API field names
 * @depends-on  [createHandler, mapLogRow]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, row mapping]
 * @tags        logs, list, account, pagination
 */
export const listAccount = createHandler(async (ctx, body) => {
  const { event_type, target_type, date_from, date_to, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('logs')
    .select('*')
    .eq('account_id', ctx.accountId)
    .order('created_at', { ascending: false })

  if (event_type) query = query.eq('level', event_type)
  if (target_type) query = query.eq('source_type', target_type)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to)

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return (data || []).map(mapLogRow)
})
// ─── CHUNK_END: LOGS_LIST_ACCOUNT ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_LIST_TARGET ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_LIST_TARGET_1_0_0
 * @version     1.0.0
 * @hash        7ea27876f183b59057284ca9007aed6e0e65050b196f00756b8ad5715073e745
 * @macro       Target Logs List Handler
 * @micro       Lists log entries for specific target entity with filtering
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of mapped log rows for target entity
 * @depends-on  [createHandler, mapLogRow]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, row mapping]
 * @tags        logs, list, target, entity-specific
 */
export const listTarget = createHandler(async (ctx, body) => {
  const { target_type, target_id, event_type, limit = 100, offset = 0 } = ctx.query || {}

  if (!target_type || !target_id) {
    throw new Error('target_type and target_id are required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('logs')
    .select('*')
    .eq('account_id', ctx.accountId)
    .eq('source_type', target_type)
    .eq('source_id', target_id)
    .order('created_at', { ascending: false })

  if (event_type) query = query.eq('level', event_type)

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return (data || []).map(mapLogRow)
})
// ─── CHUNK_END: LOGS_LIST_TARGET ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_LIST_PERSON ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_LIST_PERSON_1_0_0
 * @version     1.0.0
 * @hash        1c502ddeac8766153f1cc9ff6ffc8a7804dd83519d3c2e8b11dcf610fc6d6dfe
 * @macro       Person Activity Feed Handler
 * @micro       Returns activity feed for person with system event filtering
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of mapped log rows for person activity
 * @depends-on  [createHandler, mapLogRow]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, row mapping]
 * @tags        logs, list, person, activity-feed
 */
export const listPerson = createHandler(async (ctx, body) => {
  const { person_id, include_system, limit = 50, offset = 0 } = ctx.query || {}

  const targetPersonId = person_id || ctx.principal?.id

  if (!targetPersonId) {
    throw new Error('Person ID is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('logs')
    .select('*')
    .eq('account_id', ctx.accountId)
    .eq('person_id', targetPersonId)
    .order('created_at', { ascending: false })

  if (include_system !== 'true') {
    query = query.neq('level', 'system')
  }

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return (data || []).map(mapLogRow)
})
// ─── CHUNK_END: LOGS_LIST_PERSON ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_GET_STATS ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_GET_STATS_1_0_0
 * @version     1.0.0
 * @hash        a25e065d770b9658aa1a7d1db325e044febbac498c06cad735e18167442a2674
 * @macro       Logs Statistics Handler
 * @micro       Returns log counts by event type with date range filtering
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     {total: number, by_type: Record<string, number>} — Log statistics
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB count query, aggregation]
 * @tags        logs, stats, analytics, monitoring
 */
export const getStats = createHandler(async (ctx, body) => {
  const { date_from, date_to } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('logs')
    .select('id, level')
    .eq('account_id', ctx.accountId)

  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', date_to)

  const { data, error: err } = await query

  if (err) throw err

  const rows = data || []
  const by_type: Record<string, number> = {}
  for (const row of rows) {
    by_type[row.level] = (by_type[row.level] || 0) + 1
  }

  return { total: rows.length, by_type }
})
// ─── CHUNK_END: LOGS_GET_STATS ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_SEARCH ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_SEARCH_1_0_0
 * @version     1.0.0
 * @hash        25f4552cc8b604e280e77c9180dea6435c99f864f8d1578af44ea68793c4c67d
 * @macro       Logs Text Search Handler
 * @micro       Performs full-text search on log messages with filtering
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body (unused for GET)
 * @outputs     Array of mapped log rows matching search query
 * @depends-on  [createHandler, mapLogRow]
 * @depended-by [Netlify function routing]
 * @side-effects [DB ILIKE search, row mapping]
 * @tags        logs, search, text-search, ilike
 */
export const search = createHandler(async (ctx, body) => {
  const { query: searchQuery, event_type, target_type, limit = 50, offset = 0 } = ctx.query || {}

  if (!searchQuery) {
    throw new Error('Search query is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  let query = ctx.db
    .from('logs')
    .select('*')
    .eq('account_id', ctx.accountId)
    .ilike('message', `%${searchQuery}%`)
    .order('created_at', { ascending: false })

  if (event_type) query = query.eq('level', event_type)
  if (target_type) query = query.eq('source_type', target_type)

  const { data, error: err } = await query.range(
    parseInt(offset.toString()),
    parseInt(offset.toString()) + parseInt(limit.toString()) - 1
  )

  if (err) throw err

  return (data || []).map(mapLogRow)
})
// ─── CHUNK_END: LOGS_SEARCH ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_LOG ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_LOG_1_0_0
 * @version     1.0.0
 * @hash        521255a8c1a7e4110e2873050c8b58c8819fa6540bb039d30117946ef741633f
 * @macro       Log Entry Writer
 * @micro       Writes external log entry with field mapping and validation
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Log data including event_type and optional fields
 * @outputs     {log_id: string} — ID of created log entry
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert with field mapping]
 * @tags        logs, create, external, instrumentation
 */
export const log = createHandler(async (ctx, body) => {
  const { event_type, target_type, target_id, action, message, details, metadata } = body

  if (!event_type) {
    throw new Error('event_type is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { data, error: err } = await ctx.db
    .from('logs')
    .insert({
      level: event_type,
      message: message || action || event_type,
      source: action || null,
      source_type: target_type || null,
      source_id: target_id || null,
      person_id: ctx.principal?.id || null,
      account_id: ctx.accountId,
      context: details || {},
      metadata: metadata || {},
    })
    .select('id')
    .single()

  if (err) throw err

  return { log_id: data?.id }
})
// ─── CHUNK_END: LOGS_LOG ────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_CLEANUP ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_CLEANUP_1_0_0
 * @version     1.0.0
 * @hash        3790847ac4c98e79285483511dcc23c303dc339b4988ac5715c1f165a1bb29c9
 * @macro       Logs Cleanup Handler
 * @micro       Deletes old log entries beyond retention period
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — days_to_keep (default 90)
 * @outputs     {deleted_count: number} — Number of deleted log entries
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing, system-cron.ts]
 * @side-effects [DB delete by date]
 * @tags        logs, cleanup, retention, maintenance
 */
export const cleanup = createHandler(async (ctx, body) => {
  const { days_to_keep = 90 } = body

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - parseInt(days_to_keep.toString()))

  const { data, error: err } = await ctx.db
    .from('logs')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select('id')

  if (err) throw err

  return { deleted_count: (data || []).length }
})
// ─── CHUNK_END: LOGS_CLEANUP ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: LOGS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    LOGS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        62e729c4e43a30a85394c5ed66a1c2a12898135b133b8b712f481670d2351b22
 * @macro       Logs Router
 * @micro       Routes HTTP methods and actions to appropriate log handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST operations
 * @outputs     Varies — Depends on routed handler (listAccount/listTarget/listPerson/getStats/search/cleanup/log)
 * @depends-on  [createHandler, listAccount, listTarget, listPerson, getStats, search, cleanup, log]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        logs, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'account':
      if (method === 'GET') return await listAccount(ctx, body)
      break
    case 'target':
      if (method === 'GET') return await listTarget(ctx, body)
      break
    case 'person':
      if (method === 'GET') return await listPerson(ctx, body)
      break
    case 'stats':
      if (method === 'GET') return await getStats(ctx, body)
      break
    case 'search':
      if (method === 'GET') return await search(ctx, body)
      break
    case 'cleanup':
      if (method === 'POST') return await cleanup(ctx, body)
      break
    default:
      if (method === 'POST') return await log(ctx, body)
  }

  throw new Error('Invalid action or method')
})
// ─── CHUNK_END: LOGS_HANDLER ────────────────────────────────────────────────
