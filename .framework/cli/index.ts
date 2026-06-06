#!/usr/bin/env node
/// <reference types="node" />
/**
 * @module cli/index
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * Spine CLI entry point (`npx spine-framework`). Registers all command groups via
 * Commander and delegates each subcommand to the same core logic used by
 * API handlers and direct imports. No business logic lives here — only
 * command registration and top-level error handling.
 *
 * **Command groups registered:**
 * | Group       | File                       |
 * |-------------|----------------------------|
 * | auth        | commands/auth.ts           |
 * | pipelines   | commands/pipelines.ts      |
 * | items       | commands/items.ts          |
 * | agents      | commands/agents.ts         |
 * | migrations  | commands/migrations.ts     |
 *
 * **Usage:**
 * ```bash
 * npx spine-framework --help
 * npx spine-framework auth whoami
 * npx spine-framework pipelines run <id> --data '{"key":"value"}'
 * npx spine-framework items list --type support_ticket
 * npx spine-framework items get <id>
 * npx spine-framework agents run <thread-id> --message "Hello"
 * npx spine-framework migrations list
 * ```
 *
 * @seeAlso cli/context.ts (buildCliContext — constructs CoreContext for every command)
 * @seeAlso functions/_shared/index.ts (core functions exposed to CLI)
 */

import './env-loader.ts'
import { Command } from 'commander'

const program = new Command()

program
  .name('spine-framework')
  .description('Spine v2 CLI — interact with your Spine instance from the terminal or agentic IDE')
  .version('2.0.0')
  .option('--account <id>', 'Override the account ID for this command')

const [
  { registerAuthCommands },
  { registerPipelineCommands },
  { registerItemCommands },
  { registerAgentCommands },
  { registerMigrationCommands },
  { registerDoctorCommands },
  { registerDevCommands },
  { registerTestCommands },
  { registerSystemCommands },
  { registerGenerateCommands },
  { registerCreateAppCommands },
] = await Promise.all([
  import('./commands/auth.ts'),
  import('./commands/pipelines.ts'),
  import('./commands/items.ts'),
  import('./commands/agents.ts'),
  import('./commands/migrations.ts'),
  import('./commands/doctor.ts'),
  import('./commands/dev.ts'),
  import('./commands/test.ts'),
  import('./commands/system.ts'),
  import('./commands/generate.ts'),
  import('./commands/create-app.ts'),
])

registerAuthCommands(program)
registerPipelineCommands(program)
registerItemCommands(program)
registerAgentCommands(program)
registerMigrationCommands(program)
registerDoctorCommands(program)
registerDevCommands(program)
registerTestCommands(program)
registerSystemCommands(program)
registerGenerateCommands(program)
registerCreateAppCommands(program)

program.parseAsync(process.argv).catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
