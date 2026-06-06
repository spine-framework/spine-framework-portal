/// <reference types="node" />
/**
 * @module cli/commands/agents
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine agents` command group. Sends messages to AI agent threads and
 * inspects thread state from the terminal or an agentic IDE. `agents run`
 * calls `runAgent` — the same function used by API handlers — so responses
 * are recorded in the `messages` table like any other agent turn.
 *
 * **Commands:**
 * | Subcommand                                       | Description                           |
 * |--------------------------------------------------|---------------------------------------|
 * | `agents run <threadId> --message <text>`         | Send a message and print the response |
 * | `agents threads list [--account <id>]`           | List agent threads                    |
 * | `agents threads get <id> [--limit <n>]`          | Show thread + recent messages         |
 *
 * **Usage:**
 * ```bash
 * spine agents run <uuid> --message "Summarize the last 10 tickets" --json
 * spine agents threads list --account <id> --limit 10
 * spine agents threads get <uuid>
 * ```
 *
 * @seeAlso cli/context.ts (buildCliContext)
 * @seeAlso functions/_shared/agent-runner.ts (runAgent)
 * @seeAlso functions/ai-agents.ts (agent configuration CRUD)
 */

import type { Command } from 'commander'
import { buildCliContext, printResult, handleError } from '../context.ts'
import { runAgent, adminDb } from '../../functions/_shared/index.ts'

/**
 * Registers the `agents` subcommand group on the root Commander program.
 *
 * @param program - The root `spine` Commander instance
 * @sideEffects Adds `agents run`, `agents threads list/get` subcommands to `program`
 * @calledBy cli/index.ts
 */
export function registerAgentCommands(program: Command) {
  const agents = program
    .command('agents')
    .description('AI agent interaction')

  agents
    .command('run <threadId>')
    .description('Send a message to an agent thread and get a response')
    .requiredOption('--message <text>', 'The message to send')
    .option('--account <id>', 'Account scope')
    .option('--json', 'Output as JSON')
    .action(async (threadId, opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        console.log(`Sending message to thread ${threadId}...`)
        const response = await runAgent(threadId, opts.message, ctx)

        if (opts.json) {
          console.log(JSON.stringify(response, null, 2))
        } else {
          console.log('\n─── Agent Response ───')
          console.log(response.content || JSON.stringify(response))
          console.log('─────────────────────')
          if (response.data?.confidence !== undefined) {
            console.log(`Confidence: ${(response.data.confidence * 100).toFixed(0)}%`)
          }
          console.log()
        }
      } catch (err: any) {
        handleError(err)
      }
    })

  const threads = agents
    .command('threads')
    .description('Agent thread management')

  threads
    .command('list')
    .description('List agent threads')
    .option('--account <id>', 'Account scope')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        let query = adminDb
          .from('threads')
          .select('id, title, status, created_at')
          .order('created_at', { ascending: false })
          .limit(parseInt(opts.limit))

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

  threads
    .command('get <id>')
    .description('Get thread details and recent messages')
    .option('--limit <n>', 'Number of messages to show', '20')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        await buildCliContext()

        const { data: thread, error: threadError } = await adminDb
          .from('threads')
          .select('*')
          .eq('id', id)
          .single()

        if (threadError || !thread) throw new Error(`Thread not found: ${id}`)

        const { data: messages, error: msgError } = await adminDb
          .from('messages')
          .select('id, content, data, created_at')
          .eq('thread_id', id)
          .order('created_at', { ascending: true })
          .limit(parseInt(opts.limit))

        if (msgError) throw new Error(msgError.message)

        if (opts.json) {
          console.log(JSON.stringify({ thread, messages }, null, 2))
        } else {
          console.log(`\nThread: ${thread.title || thread.id}`)
          console.log(`Status: ${thread.status || 'open'}`)
          console.log('─'.repeat(50))
          for (const msg of messages || []) {
            const msgType = msg.data?.message_type || 'message'
            const prefix = msgType === 'human' ? 'You' : msgType === 'agent' ? 'Agent' : msgType
            console.log(`\n[${prefix}] ${msg.created_at}`)
            console.log(msg.content)
          }
          console.log()
        }
      } catch (err: any) {
        handleError(err)
      }
    })
}
