/**
 * @module cli/commands/auth
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine auth` command group. Exposes two subcommands for verifying and
 * inspecting the currently configured CLI credentials without performing
 * any data operations.
 *
 * **Commands:**
 * | Subcommand        | Description                                           |
 * |-------------------|-------------------------------------------------------|
 * | `auth whoami`     | Print the resolved principal for the current env      |
 * | `auth check`      | Validate credentials; exit 0 on success, 1 on failure |
 *
 * **Usage:**
 * ```bash
 * spine auth whoami
 * spine auth whoami --json
 * spine auth check
 * ```
 *
 * @seeAlso cli/context.ts (buildCliContext — principal resolution)
 * @seeAlso functions/auth.ts (API equivalent)
 */

import type { Command } from 'commander'
import { buildCliContext, handleError } from '../context.js'

/**
 * Registers the `auth` subcommand group on the root Commander program.
 *
 * @param program - The root `spine` Commander instance
 * @sideEffects Adds `auth whoami` and `auth check` subcommands to `program`
 * @calledBy cli/index.ts
 */
export function registerAuthCommands(program: Command) {
  const auth = program
    .command('auth')
    .description('Authentication and identity commands')

  auth
    .command('whoami')
    .description('Show the resolved principal for the current environment config')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const ctx = await buildCliContext()
        const output = {
          principal_id: ctx.principal.id,
          principal_type: ctx.principal.type,
          account_id: ctx.accountId,
          display_name: ctx.principal.displayName,
          email: ctx.principal.email,
          roles: ctx.principal.roles,
          scopes: ctx.principal.scopes,
          request_id: ctx.requestId
        }

        if (opts.json) {
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.log('\nSpine CLI — Current Identity')
          console.log('─'.repeat(40))
          console.log(`Principal ID:   ${output.principal_id}`)
          console.log(`Type:           ${output.principal_type}`)
          console.log(`Account:        ${output.account_id || '(none)'}`)
          if (output.display_name) console.log(`Name:           ${output.display_name}`)
          if (output.email) console.log(`Email:          ${output.email}`)
          if (output.roles?.length) console.log(`Roles:          ${output.roles.join(', ')}`)
          if (output.scopes?.length) console.log(`Scopes:         ${output.scopes.join(', ')}`)
          console.log(`Request ID:     ${output.request_id}`)
          console.log()
        }
      } catch (err: any) {
        handleError(err)
      }
    })

  auth
    .command('check')
    .description('Validate credentials — exits 0 if valid, 1 if not')
    .action(async () => {
      try {
        await buildCliContext()
        console.log('✓ Credentials valid')
        process.exit(0)
      } catch (err: any) {
        console.error(`✗ ${err.message}`)
        process.exit(1)
      }
    })
}
