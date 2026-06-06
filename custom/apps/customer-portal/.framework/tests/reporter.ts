/// <reference types="node" />
/**
 * @module tests/reporter
 * @audience core-contributor
 * @layer test-infrastructure
 * @stability stable
 *
 * Vitest custom reporter that persists test run results to public.test_runs
 * and public.test_results in Supabase. Also exports writeRunResults() for
 * use by non-Vitest runners (API tests, UI sweep).
 *
 * Registered in vitest.config.ts via:
 *   reporters: ['default', './v2-core/tests/reporter.ts']
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * @seeAlso migrations_dayzero/008_test_runs.sql
 * @seeAlso tests/ui/ui-sweep.ts (calls writeRunResults directly)
 * @seeAlso tests/api/api-surface.test.ts (calls writeRunResults directly)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Reporter, File, Task } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadEnv() {
  for (const name of ['.xenv.test', '.xenv']) {
    const p = resolve(__dirname, '../', name)
    if (existsSync(p)) {
      const lines = readFileSync(p, 'utf8').split('\n')
      for (const line of lines) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const eq = t.indexOf('=')
        if (eq === -1) continue
        const k = t.slice(0, eq).trim()
        const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
      break
    }
  }
}
loadEnv()

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface TestCaseResult {
  suite:      string
  file?:      string
  describe?:  string
  name:       string
  status:     'passed' | 'failed' | 'skipped'
  duration_ms?: number
  error?:     string
}

// ─── DB WRITER ─────────────────────────────────────────────────────────────

/**
 * Writes a completed test run + individual results to public schema.
 * Safe to call from any test runner (Vitest, Playwright, fetch-based API tests).
 *
 * @param suite - 'unit' | 'integration' | 'api' | 'ui'
 * @param results - array of individual test case outcomes
 * @param durationMs - total wall-clock duration of the suite
 */
export async function writeRunResults(
  suite: string,
  results: TestCaseResult[],
  durationMs: number
): Promise<string | null> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.warn('[reporter] Skipping DB write — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    return null
  }

  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(url, key, { db: { schema: 'public' } })

  const passed  = results.filter(r => r.status === 'passed').length
  const failed  = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const status  = failed > 0 ? 'failed' : 'passed'

  const { data: run, error: runErr } = await db
    .from('test_runs')
    .insert({
      suite,
      status,
      duration_ms: durationMs,
      total: results.length,
      passed,
      failed,
      skipped,
      finished_at: new Date().toISOString(),
      triggered_by: 'agent'
    })
    .select('id')
    .single()

  if (runErr || !run) {
    console.warn('[reporter] Failed to insert test_run:', runErr?.message)
    return null
  }

  if (results.length > 0) {
    const rows = results.map(r => ({
      run_id:      run.id,
      suite:       r.suite,
      file:        r.file ?? null,
      describe:    r.describe ?? null,
      name:        r.name,
      status:      r.status,
      duration_ms: r.duration_ms ?? null,
      error:       r.error ?? null
    }))

    const { error: resultErr } = await db.from('test_results').insert(rows)
    if (resultErr) console.warn('[reporter] Failed to insert test_results:', resultErr.message)
  }

  console.log(`[reporter] Wrote run ${run.id} — ${suite}: ${passed}✓ ${failed}✗ ${skipped}⊘`)
  return run.id
}

// ─── VITEST REPORTER ───────────────────────────────────────────────────────

class SpineReporter implements Reporter {
  private startTime = 0
  private suite = 'unit'

  onInit() {
    this.startTime = Date.now()
  }

  async onFinished(files?: File[]) {
    if (!files?.length) return

    const results: TestCaseResult[] = []

    for (const file of files) {
      const filePath = file.name
      const suiteName = filePath.includes('/integration/') ? 'integration'
        : filePath.includes('/api/')         ? 'api'
        : filePath.includes('/ui/')          ? 'ui'
        : 'unit'
      this.suite = suiteName

      function collectTasks(tasks: Task[], describePath: string) {
        for (const task of tasks) {
          if (task.type === 'suite') {
            const nested = (task as any).tasks ?? []
            collectTasks(nested, describePath ? `${describePath} > ${task.name}` : task.name)
          } else {
            const result = (task as any).result
            const status: TestCaseResult['status'] =
              result?.state === 'pass' ? 'passed'
              : result?.state === 'skip' ? 'skipped'
              : 'failed'

            const errorMsg = result?.errors?.[0]
              ? `${result.errors[0].message ?? ''}\n${result.errors[0].stack ?? ''}`.trim()
              : undefined

            results.push({
              suite:       suiteName,
              file:        filePath,
              describe:    describePath || undefined,
              name:        task.name,
              status,
              duration_ms: result?.duration ? Math.round(result.duration) : undefined,
              error:       errorMsg
            })
          }
        }
      }

      collectTasks((file as any).tasks ?? [], '')
    }

    const durationMs = Date.now() - this.startTime
    await writeRunResults(this.suite, results, durationMs)
  }
}

export default SpineReporter
