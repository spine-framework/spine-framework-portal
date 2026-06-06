/**
 * @module observability
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Aggregated observability metrics API. All handlers delegate to Postgres
 * analytics RPCs that operate over the `v2.logs` table. Results are
 * read-only; no writes occur in this module.
 *
 * **Routed by:** `GET/POST /.netlify/functions/observability`
 *
 * **Actions (all GET unless noted):**
 * | ?action               | handler                |
 * |-----------------------|------------------------|
 * | event_volume          | getEventVolume         |
 * | error_rate            | getErrorRate           |
 * | latency_percentiles   | getLatencyPercentiles  |
 * | pipeline_stats        | getPipelineStats       |
 * | top_actors            | getTopActors           |
 * | cleanup               | cleanupOldLogs (POST)  |
 *
 * **Authorization:** All read endpoints require account context (RLS-scoped
 * via `ctx.db`). `cleanup` additionally requires the `system_admin` role.
 *
 * INVARIANT: Every handler requires both `from` and `to` date params
 *   (except `cleanup`). Requests without them throw immediately.
 *
 * @seeAlso logs.ts (raw log access with filter/search)
 * @seeAlso system-cron.ts (evaluateThresholds calls observability RPCs)
 * @seeAlso pipeline-executions.ts (pipeline_stats RPC aggregates these)
 */

import { createHandler } from './_shared/middleware'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

/**
 * Returns time-bucketed event volume counts via the `get_event_volume` RPC.
 *
 * Query params: `from` (required, ISO), `to` (required, ISO),
 * `bucket` ('minute'|'hour'|'day', default 'hour')
 *
 * @returns Array of `{ bucket_time, event_type, count }` rows
 * @throws Error('Account context required')
 * @throws Error('from and to dates are required')
 * @sideEffects DB read: get_event_volume RPC
 * @calledBy handler (?action=event_volume)
 */
export const getEventVolume = createHandler(async (ctx, body) => {
  const { from, to, bucket = 'hour' } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!from || !to) {
    throw new Error('from and to dates are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_event_volume', {
      p_account_id: ctx.accountId,
      p_event_type: null,
      p_bucket: bucket,
      p_from: from,
      p_to: to,
    })

  if (err) throw err
  return data || []
})

// ── Error Rate ───────────────────────────────────────────
/**
 * Returns aggregate error rate for the account time window via the
 * `get_error_rate` RPC.
 *
 * Query params: `from` (required, ISO), `to` (required, ISO)
 *
 * @returns `{ total: number, errors: number, rate: number }` (0.0–1.0)
 * @throws Error('Account context required')
 * @throws Error('from and to dates are required')
 * @sideEffects DB read: get_error_rate RPC
 * @calledBy handler (?action=error_rate)
 * @calledBy system-cron.ts evaluateThresholds (metric='error_rate')
 */
export const getErrorRate = createHandler(async (ctx, body) => {
  const { from, to } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!from || !to) {
    throw new Error('from and to dates are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_error_rate', {
      p_account_id: ctx.accountId,
      p_from: from,
      p_to: to,
    })

  if (err) throw err
  return data?.[0] || { total: 0, errors: 0, rate: 0 }
})

/**
 * Returns request latency percentiles (p50/p90/p99) via the
 * `get_latency_percentiles` RPC.
 *
 * Query params: `from` (required, ISO), `to` (required, ISO),
 * `source` (log source filter, default 'request')
 *
 * @returns `{ p50: number, p90: number, p99: number }` (milliseconds)
 * @throws Error('Account context required')
 * @throws Error('from and to dates are required')
 * @sideEffects DB read: get_latency_percentiles RPC
 * @calledBy handler (?action=latency_percentiles)
 * @calledBy system-cron.ts evaluateThresholds (metric='latency_p95')
 */
export const getLatencyPercentiles = createHandler(async (ctx, body) => {
  const { from, to, source = 'request' } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!from || !to) {
    throw new Error('from and to dates are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_latency_percentiles', {
      p_account_id: ctx.accountId,
      p_source: source,
      p_from: from,
      p_to: to,
    })

  if (err) throw err
  return data?.[0] || { p50: 0, p90: 0, p99: 0 }
})

/**
 * Returns per-pipeline execution statistics (success/failure counts,
 * average duration) via the `get_pipeline_stats` RPC.
 *
 * Query params: `from` (required, ISO), `to` (required, ISO)
 *
 * @returns Array of `{ pipeline_id, name, success_count, failure_count, avg_duration_ms }`
 * @throws Error('Account context required')
 * @throws Error('from and to dates are required')
 * @sideEffects DB read: get_pipeline_stats RPC
 * @calledBy handler (?action=pipeline_stats)
 * @calledBy system-cron.ts evaluateThresholds (metric='pipeline_failure_rate')
 */
export const getPipelineStats = createHandler(async (ctx, body) => {
  const { from, to } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!from || !to) {
    throw new Error('from and to dates are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_pipeline_stats', {
      p_account_id: ctx.accountId,
      p_from: from,
      p_to: to,
    })

  if (err) throw err
  return data || []
})

/**
 * Returns the most active principals (persons) by event count via the
 * `get_top_actors` RPC.
 *
 * Query params: `from` (required, ISO), `to` (required, ISO),
 * `limit` (default 5)
 *
 * @returns Array of `{ person_id, full_name, event_count }` ordered by count desc
 * @throws Error('Account context required')
 * @throws Error('from and to dates are required')
 * @sideEffects DB read: get_top_actors RPC
 * @calledBy handler (?action=top_actors)
 */
export const getTopActors = createHandler(async (ctx, body) => {
  const { from, to, limit = 5 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!from || !to) {
    throw new Error('from and to dates are required')
  }

  const { data, error: err } = await ctx.db
    .rpc('get_top_actors', {
      p_account_id: ctx.accountId,
      p_from: from,
      p_to: to,
      p_limit: parseInt(limit.toString()) || 5,
    })

  if (err) throw err
  return data || []
})

// ── Cleanup Old Logs (manual trigger) ────────────────────
/**
 * Manually triggers cross-account log cleanup via the `cleanup_old_logs`
 * RPC. Requires `system_admin` role — not available to regular users.
 *
 * Query params: `days` (optional, default 90)
 *
 * @returns `{ deleted_count: number }`
 * @throws Error('System admin required') if principal lacks system_admin role
 * @sideEffects DB write: cleanup_old_logs RPC (cross-account DELETE)
 * @calledBy handler (?action=cleanup)
 * @calledBy system-cron.ts cleanupOldLogs (automated daily rotation)
 */
export const cleanupOldLogs = createHandler(async (ctx, body) => {
  const { days = 90 } = ctx.query || {}

  // Only system admins can trigger manual cleanup
  if (!ctx.principal?.roles?.includes('system_admin')) {
    throw new Error('System admin required')
  }

  const { data, error: err } = await ctx.db
    .rpc('cleanup_old_logs', {
      p_retention_days: parseInt(days.toString()) || 90,
    })

  if (err) throw err
  return { deleted_count: data?.[0]?.deleted_count || 0 }
})

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

/**
 * Netlify function entry point. Dispatches to analytics handler by ?action.
 * All valid ?action values are listed in the module dispatch table.
 * @throws Error('Unknown action: <action>. Valid actions: ...') on mismatch
 * @calledBy Netlify function routing
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}

  switch (action) {
    case 'event_volume':
      return await getEventVolume(ctx, body)
    case 'error_rate':
      return await getErrorRate(ctx, body)
    case 'latency_percentiles':
      return await getLatencyPercentiles(ctx, body)
    case 'pipeline_stats':
      return await getPipelineStats(ctx, body)
    case 'top_actors':
      return await getTopActors(ctx, body)
    case 'cleanup':
      return await cleanupOldLogs(ctx, body)
    default:
      throw new Error(`Unknown action: ${action}. Valid actions: event_volume, error_rate, latency_percentiles, pipeline_stats, top_actors, cleanup`)
  }
})
