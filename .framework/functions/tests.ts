/**
 * @module tests
 * @audience both
 * @layer api-handler
 * @stability stable
 *
 * Read-only API for the admin Testing dashboard. Exposes test run history
 * and per-case results stored in public.test_runs / public.test_results.
 *
 * **Routed by:** `GET /.netlify/functions/tests`
 *
 * **Dispatch table:**
 * | ?action | ?id | Description |
 * |---------|-----|-------------|
 * | list    | —   | Returns 20 most recent test_runs (summary, no individual results) |
 * | get     | uuid | Returns one test_run + all its test_results |
 * | stats   | —   | Returns pass/fail counts grouped by suite for last 30 days |
 *
 * **Authorization:** system_admin only (machine principals with *:* also allowed).
 *
 * INVARIANT: no writes. This endpoint is purely for reading stored test run data.
 *
 * @seeAlso migrations_dayzero/008_test_runs.sql
 * @seeAlso tests/reporter.ts (writes the data this endpoint reads)
 * @seeAlso src/pages/admin/TestingDashboard.tsx (primary consumer)
 */

import { createHandler, requireSystemContextWithAudit } from './_shared/middleware'
import { adminDb } from './_shared/db'

export const handler = createHandler(async (ctx) => {
  const authErr = requireSystemContextWithAudit(ctx)
  if (authErr) return authErr

  const q = (ctx as any).query || {}
  const action = q.action || 'list'
  const id = q.id || q.run_id || null

  if (action === 'get' || id) {
    const runId = id
    if (!runId) {
      return { error: 'id is required for action=get', status: 400 }
    }

    const { data: run, error: runErr } = await adminDb
      .from('test_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (runErr || !run) {
      return { error: `Test run not found: ${runId}`, status: 404 }
    }

    const { data: results, error: resultsErr } = await adminDb
      .from('test_results')
      .select('*')
      .eq('run_id', runId)
      .order('status', { ascending: true })
      .order('file', { ascending: true })
      .order('name', { ascending: true })

    if (resultsErr) {
      return { error: resultsErr.message, status: 500 }
    }

    return { data: { ...run, results: results ?? [] }, error: null }
  }

  if (action === 'stats') {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await adminDb
      .from('test_runs')
      .select('suite, status, started_at, passed, failed, total, duration_ms')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(200)

    if (error) return { error: error.message, status: 500 }

    const suites = ['unit', 'integration', 'api', 'ui']
    const stats = suites.map(suite => {
      const suiteRuns = (data ?? []).filter(r => r.suite === suite)
      const lastRun = suiteRuns[0] ?? null
      return {
        suite,
        total_runs: suiteRuns.length,
        last_status: lastRun?.status ?? null,
        last_run_at: lastRun?.started_at ?? null,
        last_passed: lastRun?.passed ?? null,
        last_failed: lastRun?.failed ?? null,
        last_total:  lastRun?.total ?? null,
      }
    })

    return { data: stats, error: null }
  }

  // action === 'list'
  const limit = Math.min(parseInt(q.limit || '20', 10), 100)
  const suite = q.suite || null

  let query = adminDb
    .from('test_runs')
    .select('id, suite, status, started_at, finished_at, duration_ms, total, passed, failed, skipped, triggered_by')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (suite) {
    query = query.eq('suite', suite)
  }

  const { data, error } = await query

  if (error) return { error: error.message, status: 500 }

  return { data: data ?? [], error: null }
})
