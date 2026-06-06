/// <reference types="node" />
/**
 * @module cli/commands/migrations
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine migrations` command group. Read-only inspection of the migration
 * state. Does NOT apply or roll back migrations — use the Supabase CLI for
 * that. These commands are intended for verifying the state of a deployed
 * instance during setup or debugging.
 *
 * **Commands:**
 * | Subcommand            | Description                                         |
 * |-----------------------|-----------------------------------------------------|
 * | `migrations list`     | Show all applied migrations from `schema_migrations`|
 * | `migrations status`   | Diff local `.sql` files against applied migrations  |
 *
 * **Authorization:** Uses `adminDb` (service-role) with an explicit
 * `.schema('public')` override to reach `schema_migrations`. Requires
 * `SUPABASE_SERVICE_ROLE_KEY` with public schema access.
 *
 * **Usage:**
 * ```bash
 * spine migrations list
 * spine migrations status
 * spine migrations status --json
 * ```
 *
 * @seeAlso v2-core/migrations/ (local .sql migration files)
 * @seeAlso cli/context.ts (buildCliContext)
 */

import type { Command } from 'commander'
import { readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildCliContext, printResult, handleError } from '../context.ts'
import { adminDb } from '../../functions/_shared/index.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Registers the `migrations` subcommand group on the root Commander program.
 *
 * @param program - The root `spine` Commander instance
 * @sideEffects Adds `migrations list` and `migrations status` subcommands to `program`
 * @calledBy cli/index.ts
 */
export function registerMigrationCommands(program: Command) {
  const migrations = program
    .command('migrations')
    .description('Database migration inspection')

  migrations
    .command('list')
    .description('List applied migrations from supabase schema_migrations')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        await buildCliContext()

        const { data, error } = await adminDb
          .schema('supabase_migrations' as any)
          .from('schema_migrations' as any)
          .select('version, name, executed_at')
          .order('version', { ascending: true })

        if (error) {
          throw new Error(
            `Could not query migrations: ${error.message}\n` +
            'Ensure SUPABASE_SERVICE_ROLE_KEY has access to the public schema.'
          )
        }

        printResult(data || [], { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })

  migrations
    .command('status')
    .description('Compare local migration files against applied migrations')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        await buildCliContext()

        const migrationsDir = resolve(__dirname, '../../migrations')

        if (!existsSync(migrationsDir)) {
          throw new Error(`Migrations directory not found: ${migrationsDir}`)
        }

        const localFiles = readdirSync(migrationsDir)
          .filter((f: string) => f.endsWith('.sql'))
          .sort()

        const { data: applied, error } = await adminDb
          .schema('supabase_migrations' as any)
          .from('schema_migrations' as any)
          .select('version')

        if (error) {
          throw new Error(`Could not query migrations: ${error.message}`)
        }

        const appliedVersions = new Set(
          (applied || []).map((r: any) => r.version)
        )

        const status = localFiles.map((file: string) => {
          const version = file.replace('.sql', '')
          const isApplied = appliedVersions.has(version)
          return {
            file,
            version,
            status: isApplied ? 'applied' : 'pending'
          }
        })

        if (opts.json) {
          console.log(JSON.stringify(status, null, 2))
        } else {
          console.log('\nMigration Status')
          console.log('─'.repeat(60))
          for (const m of status as Array<{file: string; status: string}>) {
            const icon = m.status === 'applied' ? '✓' : '○'
            console.log(`  ${icon} ${m.file.padEnd(40)} ${m.status}`)
          }
          const pending = status.filter(m => m.status === 'pending').length
          console.log(`\n  ${status.length - pending} applied, ${pending} pending`)
          console.log()
        }
      } catch (err: any) {
        handleError(err)
      }
    })
}
