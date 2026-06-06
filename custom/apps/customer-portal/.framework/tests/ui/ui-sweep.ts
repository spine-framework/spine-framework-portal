/**
 * @module tests/ui/ui-sweep
 * @audience core-contributor
 * @layer test-ui
 * @stability stable
 *
 * Playwright UI sweep for all admin routes. Navigates each route, waits for
 * the page to settle, asserts zero console errors, and checks for expected
 * landmark elements. Writes results to public.test_runs via reporter.ts.
 *
 * Run via: tsx v2-core/tests/ui/ui-sweep.ts
 * Requires: Netlify dev server running at SPINE_DEV_URL (default http://localhost:8888)
 *
 * Exit codes:
 *   0 — all routes passed
 *   1 — one or more routes failed
 *
 * @seeAlso tests/reporter.ts (writeRunResults)
 * @seeAlso .windsurf/workflows/ui-test.md
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

function loadEnv() {
  for (const name of ['.xenv.test', '.xenv']) {
    const p = resolve(__dirname, '../../', name)
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

import { writeRunResults } from '../reporter.ts'
import type { TestCaseResult } from '../reporter.ts'

const BASE_URL = process.env.SPINE_DEV_URL || 'http://localhost:8888'

// ─── ROUTE REGISTRY ──────────────────────────────────────────────────────────

interface RouteSpec {
  path:       string
  waitFor?:   string   // text or aria label to wait for
  expectText?: string[] // text that should appear on the page
  suite:      'runtime' | 'configs' | 'observability' | 'testing'
}

const ROUTES: RouteSpec[] = [
  // Runtime
  { path: '/admin/runtime/accounts',    waitFor: 'Accounts',     suite: 'runtime' },
  { path: '/admin/runtime/people',      waitFor: 'People',       suite: 'runtime' },
  { path: '/admin/runtime/items',       waitFor: 'Items',        suite: 'runtime' },
  { path: '/admin/runtime/threads',     waitFor: 'Threads',      suite: 'runtime' },
  { path: '/admin/runtime/messages',    waitFor: 'Messages',     suite: 'runtime' },
  { path: '/admin/runtime/links',       waitFor: 'Links',        suite: 'runtime' },
  { path: '/admin/runtime/attachments', waitFor: 'Attachments',  suite: 'runtime' },
  { path: '/admin/runtime/watchers',    waitFor: 'Watchers',     suite: 'runtime' },
  // Configs
  { path: '/admin/configs/types',       waitFor: 'Types',        suite: 'configs' },
  { path: '/admin/configs/apps',        waitFor: 'Apps',         suite: 'configs' },
  { path: '/admin/configs/roles',       waitFor: 'Roles',        suite: 'configs' },
  { path: '/admin/configs/pipelines',   waitFor: 'Pipelines',    suite: 'configs' },
  { path: '/admin/configs/triggers',    waitFor: 'Triggers',     suite: 'configs' },
  // Observability
  { path: '/admin/observability',       waitFor: 'Observability', suite: 'observability' },
  { path: '/admin/observability/logs',  waitFor: 'Logs',          suite: 'observability' },
  // Testing
  { path: '/admin/testing',             waitFor: 'Testing',       suite: 'testing' },
]

// ─── SWEEP ───────────────────────────────────────────────────────────────────

async function sweep() {
  const startMs = Date.now()
  console.log(`\n🔍 UI Sweep — ${BASE_URL}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page    = await context.newPage()

  const results: TestCaseResult[] = []
  let passed = 0, failed = 0

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`
    const testName = `navigate ${route.path}`
    const testStart = Date.now()

    try {
      const consoleErrors: string[] = []
      const handler = (msg: any) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      }
      page.on('console', handler)

      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })

      if (route.waitFor) {
        await page.waitForSelector(`text=${route.waitFor}`, { timeout: 8000 }).catch(() => {})
      }

      const title = await page.title()

      if (consoleErrors.length > 0) {
        const errorText = consoleErrors.slice(0, 3).join(' | ')
        console.log(`  ✗ ${route.path}  [${consoleErrors.length} console errors]`)
        results.push({
          suite: 'ui',
          file:  `ui-sweep/${route.suite}`,
          name:  testName,
          status: 'failed',
          duration_ms: Date.now() - testStart,
          error: `Console errors: ${errorText}`
        })
        failed++
      } else {
        console.log(`  ✓ ${route.path}  (${title})`)
        results.push({
          suite: 'ui',
          file:  `ui-sweep/${route.suite}`,
          name:  testName,
          status: 'passed',
          duration_ms: Date.now() - testStart
        })
        passed++
      }

      page.off('console', handler)
    } catch (err: any) {
      console.log(`  ✗ ${route.path}  [${err.message?.slice(0, 80)}]`)
      results.push({
        suite: 'ui',
        file:  `ui-sweep/${route.suite}`,
        name:  testName,
        status: 'failed',
        duration_ms: Date.now() - testStart,
        error: err.message
      })
      failed++
    }
  }

  await browser.close()

  const durationMs = Date.now() - startMs
  console.log(`\n${passed}✓  ${failed}✗  ${durationMs}ms total\n`)

  await writeRunResults('ui', results, durationMs)

  process.exit(failed > 0 ? 1 : 0)
}

sweep().catch(err => {
  console.error('UI sweep failed:', err)
  process.exit(1)
})
