/// <reference types="node" />
/**
 * @module tests/fixtures/teardown
 * @audience core-contributor
 * @layer test-infrastructure
 * @stability stable
 *
 * Deletes all test fixtures from the public schema. Removes every row whose
 * slug starts with `test-` under SPINE_TEST_ACCOUNT_ID, in FK-safe order.
 *
 * Run after integration tests: `tsx v2-core/tests/fixtures/teardown.ts`
 *
 * @seeAlso tests/fixtures/seed.ts
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ACCOUNT_ID   = process.env.SPINE_TEST_ACCOUNT_ID!

if (!SUPABASE_URL || !SERVICE_KEY || !ACCOUNT_ID) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SPINE_TEST_ACCOUNT_ID')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: 'public' } })

async function del(table: string, filter?: (q: any) => any) {
  let q = db.from(table).delete().like('slug', 'test-%')
  if (filter) q = filter(q)
  const { error, count } = await (q as any)
  if (error) console.warn(`  [warn] ${table}:`, error.message)
  else console.log(`  ✓ ${table}: removed ${count ?? '?'} rows`)
}

async function teardown() {
  console.log('🧹 Tearing down test fixtures from public schema...')

  await del('items',     q => q.eq('account_id', ACCOUNT_ID))
  await del('people',    q => q.eq('account_id', ACCOUNT_ID))
  await del('pipelines', q => q.eq('account_id', ACCOUNT_ID))
  await del('types')
  await del('roles',     q => q.eq('account_id', ACCOUNT_ID))

  console.log('✅ Teardown complete.')
}

teardown().catch(err => {
  console.error('Teardown failed:', err)
  process.exit(1)
})
