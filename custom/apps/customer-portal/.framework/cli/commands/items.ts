/// <reference types="node" />
/**
 * @module cli/commands/items
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine items` command group. Direct CRUD access to the `items` table via
 * `adminDb` (service-role, bypasses RLS). Use only in controlled environments;
 * does NOT enforce field-level permissions or RLS for the principal.
 *
 * **Commands:**
 * | Subcommand                                     | Description                    |
 * |------------------------------------------------|--------------------------------|
 * | `items list [--type <slug>] [--account <id>]`  | List items, filtered by type   |
 * | `items get <id>`                               | Fetch a single item by UUID    |
 * | `items create --type <slug> --data <json>`     | Insert a new item              |
 * | `items update <id> --data <json>`              | Patch item data fields         |
 * | `items delete <id> [--hard]`                   | Soft-delete or hard-delete     |
 *
 * **Authorization note:** All commands use `adminDb` — no RLS enforcement.
 * Account scoping is applied as a filter only; it does not restrict access.
 *
 * **Usage:**
 * ```bash
 * spine items list --type support_ticket --account <id> --limit 50
 * spine items get <uuid>
 * spine items create --type support_ticket --title "Bug report" --data '{"priority":"high"}'
 * spine items update <uuid> --data '{"status":"resolved"}'
 * spine items delete <uuid>
 * spine items delete <uuid> --hard
 * ```
 *
 * @seeAlso cli/context.ts (buildCliContext)
 * @seeAlso functions/admin-data.ts (API equivalent with RLS)
 */

import type { Command } from 'commander'
import { buildCliContext, printResult, handleError } from '../context.ts'
import { adminDb } from '../../functions/_shared/index.ts'

/**
 * Registers the `items` subcommand group on the root Commander program.
 *
 * @param program - The root `spine` Commander instance
 * @sideEffects Adds `items list/get/create/update/delete` subcommands to `program`
 * @calledBy cli/index.ts
 */
export function registerItemCommands(program: Command) {
  const items = program
    .command('items')
    .description('Item record management')

  items
    .command('list')
    .description('List items, optionally filtered by type')
    .option('--type <slug>', 'Filter by item type slug')
    .option('--account <id>', 'Account scope')
    .option('--limit <n>', 'Max results', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        let query = adminDb
          .from('items')
          .select('id, type_id, title, status, is_active, created_at')
          .order('created_at', { ascending: false })
          .limit(parseInt(opts.limit))

        if (ctx.accountId) {
          query = query.eq('account_id', ctx.accountId)
        }

        if (opts.type) {
          const { data: typeRecord } = await adminDb
            .from('types')
            .select('id')
            .eq('slug', opts.type)
            .single()

          if (!typeRecord) throw new Error(`Item type not found: ${opts.type}`)
          query = query.eq('type_id', typeRecord.id)
        }

        const { data, error } = await query
        if (error) throw new Error(error.message)
        printResult(data || [], { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })

  items
    .command('get <id>')
    .description('Get a single item by ID')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        await buildCliContext()

        const { data, error } = await adminDb
          .from('items')
          .select('*')
          .eq('id', id)
          .single()

        if (error || !data) throw new Error(error?.message || `Item not found: ${id}`)
        printResult(data, { json: opts.json })
      } catch (err: any) {
        handleError(err)
      }
    })

  items
    .command('create')
    .description('Create a new item')
    .requiredOption('--type <slug>', 'Item type slug')
    .option('--data <json>', 'Item data as JSON', '{}')
    .option('--title <title>', 'Item title')
    .option('--account <id>', 'Account scope')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const ctx = await buildCliContext({ account: opts.account })

        if (!ctx.accountId) {
          throw new Error('--account or SPINE_CLI_ACCOUNT_ID required to create items')
        }

        const { data: typeRecord, error: typeError } = await adminDb
          .from('types')
          .select('id')
          .eq('slug', opts.type)
          .single()

        if (typeError || !typeRecord) throw new Error(`Item type not found: ${opts.type}`)

        let itemData: any = {}
        try {
          itemData = JSON.parse(opts.data)
        } catch {
          throw new Error(`--data must be valid JSON. Got: ${opts.data}`)
        }

        const { data, error } = await adminDb
          .from('items')
          .insert({
            type_id: typeRecord.id,
            account_id: ctx.accountId,
            title: opts.title || itemData.title || null,
            data: itemData,
            is_active: true,
            created_by: ctx.principal.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) throw new Error(error.message)
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
        } else {
          console.log(`✓ Created item ${data.id}`)
          printResult(data, { json: false })
        }
      } catch (err: any) {
        handleError(err)
      }
    })

  items
    .command('update <id>')
    .description('Update item data fields')
    .option('--data <json>', 'Partial item data as JSON', '{}')
    .option('--title <title>', 'Update item title')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        const ctx = await buildCliContext()

        let patchData: any = {}
        try {
          patchData = JSON.parse(opts.data)
        } catch {
          throw new Error(`--data must be valid JSON`)
        }

        const updates: any = {
          updated_at: new Date().toISOString(),
          updated_by: ctx.principal.id
        }
        if (opts.title) updates.title = opts.title
        if (Object.keys(patchData).length > 0) updates.data = patchData

        const { data, error } = await adminDb
          .from('items')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw new Error(error.message)
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
        } else {
          console.log(`✓ Updated item ${id}`)
          printResult(data, { json: false })
        }
      } catch (err: any) {
        handleError(err)
      }
    })

  items
    .command('delete <id>')
    .description('Soft-delete an item (sets is_active = false)')
    .option('--hard', 'Hard delete — permanently removes the record')
    .option('--json', 'Output as JSON')
    .action(async (id, opts) => {
      try {
        const ctx = await buildCliContext()

        if (opts.hard) {
          const { error } = await adminDb
            .from('items')
            .delete()
            .eq('id', id)

          if (error) throw new Error(error.message)
          console.log(`✓ Hard-deleted item ${id}`)
        } else {
          const { data, error } = await adminDb
            .from('items')
            .update({
              is_active: false,
              updated_at: new Date().toISOString(),
              updated_by: ctx.principal.id
            })
            .eq('id', id)
            .select('id, is_active')
            .single()

          if (error) throw new Error(error.message)
          const out = opts.json ? JSON.stringify(data) : `✓ Soft-deleted item ${id}`
          console.log(out)
        }
      } catch (err: any) {
        handleError(err)
      }
    })
}
