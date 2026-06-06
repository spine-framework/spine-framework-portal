/// <reference types="node" />
/**
 * @module cli/commands/pipelines
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine pipelines` command group. Lists, inspects, and triggers pipeline
 * execution directly from the terminal or an agentic IDE. `pipelines run`
 * calls `runPipeline` — the same function used by API handlers and timers —
 * so CLI executions are fully recorded in `pipeline_executions`.
 *
 * **Commands:**
 * | Subcommand                            | Description                              |
 * |---------------------------------------|------------------------------------------|
 * | `pipelines list [--account] [--all]`  | List active (or all) pipelines           |
 * | `pipelines get <id>`                  | Show pipeline details                    |
 * | `pipelines run <id> [--data <json>]`  | Execute a pipeline and show stage output |
 * | `pipelines executions <id>`           | List recent executions for a pipeline    |
 *
 * **Usage:**
 * ```bash
 * spine pipelines list --account <id>
 * spine pipelines run <uuid> --data '{"key":"value"}' --json
 * spine pipelines executions <uuid> --limit 20
 * ```
 *
 * @seeAlso cli/context.ts (buildCliContext)
 * @seeAlso functions/_shared/pipeline-runner.ts (runPipeline)
 * @seeAlso functions/pipeline-executions.ts (API query endpoint)
 */

import type { Command } from 'commander'
import { buildCliContext, printResult, handleError } from '../context.ts'
import { runPipeline, adminDb } from '../../functions/_shared/index.ts'

/**
 * Registers the `pipelines` subcommand group on the root Commander program.
 *
 * @param program - The root `spine` Commander instance
 * @sideEffects Adds `pipelines list/get/run/executions` subcommands to `program`
 * @calledBy cli/index.ts
 */
export function registerPipelineCommands(program: Command) {
  const pipelines = program
    .command('pipelines')
    .description('Pipeline management and execution')

  pipelines
    .command('list')
    .description('List all active pipelines')
    .option('--account <id>', 'Filter by account ID')
    .option('--json', 'Output as JSON')
    .option('--all', 'Include inactive pipelines')
    .action(async (opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        let query = adminDb
          .from('pipelines')
          .select('id, name, description, is_active, created_at')
          .order('name')

        if (!opts.all) {
          query = query.eq('is_active', true)
        }

        if (ctx.accountId) {
          query = query.eq('account_id', ctx.accountId)
        }

        const { data, error } = await query

        if (error) throw new Error(error.message)
        printResult(data || [], { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })

  pipelines
    .command('get <id>')
    .description('Show pipeline details')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        await buildCliContext()

        const { data, error } = await adminDb
          .from('pipelines')
          .select('*')
          .eq('id', id)
          .single()

        if (error || !data) throw new Error(error?.message || `Pipeline not found: ${id}`)
        printResult(data, { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })

  pipelines
    .command('run <id>')
    .description('Execute a pipeline')
    .option('--data <json>', 'Trigger data as JSON string', '{}')
    .option('--account <id>', 'Account scope for the execution')
    .option('--json', 'Output result as JSON')
    .action(async (id, opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        let triggerData: any = {}
        try {
          triggerData = JSON.parse(opts.data)
        } catch {
          throw new Error(`--data must be valid JSON. Got: ${opts.data}`)
        }

        console.log(`Running pipeline ${id}...`)
        const result = await runPipeline(id, triggerData, ctx)

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2))
        } else {
          const icon = result.status === 'completed' ? '✓' : '✗'
          console.log(`\n${icon} Pipeline ${result.status}`)
          console.log(`  Execution ID: ${result.executionId}`)
          console.log(`  Duration:     ${result.durationMs}ms`)
          console.log(`  Stages:       ${result.stages.length}`)
          result.stages.forEach((s: any, i: number) => {
            const stageIcon = s.status === 'success' ? '✓' : s.status === 'skipped' ? '○' : '✗'
            console.log(`    ${stageIcon} [${i}] ${s.stageType} (${s.durationMs}ms)${s.error ? ` — ${s.error}` : ''}`)
          })
          if (result.error) {
            console.log(`\n  Error: ${result.error}`)
          }
          console.log()
        }
      } catch (err: any) {
        handleError(err)
      }
    })

  pipelines
    .command('executions <id>')
    .description('List recent executions for a pipeline')
    .option('--limit <n>', 'Number of executions to show', '10')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        await buildCliContext()

        const { data, error } = await adminDb
          .from('pipeline_executions')
          .select('id, status, started_at, completed_at, duration_ms, error_message')
          .eq('pipeline_id', id)
          .order('started_at', { ascending: false })
          .limit(parseInt(opts.limit))

        if (error) throw new Error(error.message)
        printResult(data || [], { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })
}
