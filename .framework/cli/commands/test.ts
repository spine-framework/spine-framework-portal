/// <reference types="node" />
/**
 * @module cli/commands/test
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine test` command — unified test runner for all 4 test surfaces.
 * Runs Vitest tests and persists results to Supabase via the custom reporter.
 *
 * **Commands:**
 * | Subcommand              | Description                                           |
 * |-------------------------|-------------------------------------------------------|
 * | `test`                  | Run all test suites                                   |
 * | `test unit`             | Run unit tests only                                   |
 * | `test integration`      | Run integration tests only                            |
 * | `test api`              | Run API tests only                                    |
 * | `test ui`               | Run UI/Playwright tests only                          |
 * | `test --json`           | Output structured JSON summary                        |
 * | `test --watch`          | Run in watch mode (for unit/integration)              |
 *
 * **Test surfaces:**
 * - **unit**: Fast tests, no DB (v2-core/tests/unit/)
 * - **integration**: DB tests with fixtures (v2-core/tests/integration/)
 * - **api**: HTTP fetch tests against localhost:8888 (v2-core/tests/api/)
 * - **ui**: Playwright browser tests (v2-core/tests/ui/)
 *
 * **Results:**
 * All test runs are persisted to `public.test_runs` and `public.test_results`
 * via the custom Vitest reporter (v2-core/tests/reporter.ts).
 *
 * **Usage:**
 * ```bash
 * spine test
 * spine test unit --watch
 * spine test integration --json
 * spine test api
 * spine test ui
 * ```
 *
 * @seeAlso tests/reporter.ts (custom Vitest reporter)
 * @seeAlso functions/tests.ts (API endpoint for querying results)
 * @seeAlso pages/admin/TestingDashboard.tsx (UI for viewing results)
 */

import type { Command } from 'commander'
import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '../../../')

// ─── TYPES ─────────────────────────────────────────────────────────────────

type TestSuite = 'unit' | 'integration' | 'api' | 'ui' | 'all'

// ─── SUITE CONFIGURATION ───────────────────────────────────────────────────

const SUITES: Record<string, { pattern: string; runner: 'vitest' | 'playwright' | 'node' }> = {
  unit: { pattern: 'v2-core/tests/unit', runner: 'vitest' },
  integration: { pattern: 'v2-core/tests/integration', runner: 'vitest' },
  api: { pattern: 'v2-core/tests/api', runner: 'vitest' },
  ui: { pattern: 'v2-core/tests/ui', runner: 'playwright' }
}

// ─── COMMAND REGISTRATION ──────────────────────────────────────────────────

export function registerTestCommands(program: Command) {
  const testCmd = program
    .command('test [suite]')
    .description('Run Spine test suites')
    .option('--json', 'Output as JSON')
    .option('--watch', 'Watch mode (unit/integration only)')
    .option('--reporter <name>', 'Vitest reporter', 'default')
    .action(async (suiteArg: string | undefined, opts) => {
      const suite: TestSuite = (suiteArg || 'all') as TestSuite

      // Validate suite
      if (suite !== 'all' && !SUITES[suite]) {
        console.error(`\n❌ Unknown test suite: ${suite}`)
        console.log('Valid suites: unit, integration, api, ui, all')
        process.exit(1)
      }

      // Determine which suites to run
      const suitesToRun = suite === 'all'
        ? ['unit', 'integration', 'api', 'ui']
        : [suite]

      console.log(`\n🧪 Running Spine test suites: ${suitesToRun.join(', ')}\n`)

      const results: Array<{ suite: string; exitCode: number; passed: boolean }> = []

      for (const s of suitesToRun) {
        const config = SUITES[s]
        console.log(`\n▶️  ${s.toUpperCase()} tests (${config.runner})`)
        console.log('-'.repeat(40))

        try {
          let exitCode: number

          if (config.runner === 'vitest') {
            exitCode = await runVitest(s, opts)
          } else if (config.runner === 'playwright') {
            exitCode = await runPlaywright(s, opts)
          } else {
            exitCode = await runNode(s, opts)
          }

          results.push({ suite: s, exitCode, passed: exitCode === 0 })

          if (exitCode === 0) {
            console.log(`✓ ${s} tests passed\n`)
          } else {
            console.error(`✗ ${s} tests failed (exit ${exitCode})\n`)
          }

        } catch (err: any) {
          console.error(`\n❌ Error running ${s} tests:`, err.message)
          results.push({ suite: s, exitCode: 1, passed: false })
        }
      }

      // Summary
      console.log('\n' + '='.repeat(50))
      console.log('Test Run Summary')
      console.log('='.repeat(50))

      const totalPassed = results.filter(r => r.passed).length
      const totalFailed = results.filter(r => !r.passed).length

      for (const r of results) {
        const icon = r.passed ? '✓' : '✗'
        const status = r.passed ? 'PASSED' : 'FAILED'
        console.log(`${icon} ${r.suite.padEnd(12)} ${status}`)
      }

      console.log()
      console.log(`Total: ${totalPassed} passed, ${totalFailed} failed`)

      // JSON output
      if (opts.json) {
        const jsonOutput = {
          suites: results.map(r => ({
            suite: r.suite,
            status: r.passed ? 'passed' : 'failed',
            exit_code: r.exitCode
          })),
          summary: {
            total: results.length,
            passed: totalPassed,
            failed: totalFailed
          }
        }
        console.log('\n' + JSON.stringify(jsonOutput, null, 2))
      }

      // Exit code
      process.exit(totalFailed > 0 ? 1 : 0)
    })
}

// ─── RUNNER IMPLEMENTATIONS ────────────────────────────────────────────────

async function runVitest(suite: string, opts: any): Promise<number> {
  const config = SUITES[suite]
  const args = [
    'run',
    config.pattern,
    '--config', resolve(PROJECT_ROOT, 'vitest.config.ts')
  ]

  if (opts.watch) {
    args[0] = 'watch' // Replace 'run' with 'watch'
  }

  // Custom reporters - include both default and our custom reporter
  if (opts.reporter === 'default') {
    args.push('--reporter=default')
    args.push('--reporter=' + resolve(PROJECT_ROOT, 'v2-core/tests/reporter.ts'))
  } else {
    args.push(`--reporter=${opts.reporter}`)
  }

  return runCommand('npx', ['vitest', ...args], PROJECT_ROOT)
}

async function runPlaywright(suite: string, opts: any): Promise<number> {
  // Playwright tests run against a running dev server
  // We need to ensure the server is running or start it
  console.log('   (Playwright tests require dev server on localhost:8888)')

  const args = ['playwright', 'test', SUITES[suite].pattern]

  if (opts.json) {
    args.push('--reporter=json')
  }

  return runCommand('npx', args, PROJECT_ROOT)
}

async function runNode(suite: string, opts: any): Promise<number> {
  // For custom test scripts that aren't Vitest or Playwright
  const args = [SUITES[suite].pattern]
  return runCommand('node', args, PROJECT_ROOT)
}

function runCommand(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: true
    })

    proc.on('exit', (code) => {
      resolve(code || 0)
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}
