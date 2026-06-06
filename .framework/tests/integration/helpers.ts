/// <reference types="node" />
/**
 * @module tests/integration/helpers
 * @audience core-contributor
 * @layer test-infrastructure
 * @stability stable
 *
 * Shared utilities for integration tests.
 *
 * **Env contract** — requires `v2-core/.xenv.test` with:
 * - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY`
 * - `SPINE_TEST_ACCOUNT_ID` — a real account UUID in the v2 schema
 *
 * **Exports:**
 * - `adminDb` — service-role Supabase client (bypasses RLS)
 * - `TEST_ACCOUNT_ID` — account used by all integration tests
 * - `makeTestCtx()` — builds a `CoreContext` scoped to `TEST_ACCOUNT_ID`
 *   using `SYSTEM_PRINCIPAL` (machine, `*:*` scope)
 * - `cleanupItems(ids)` — deletes items by id after a test
 * - `cleanupPipelines(ids)` — deletes executions then pipelines by id
 * - `cleanupThreads(ids)` — deletes messages then threads by id
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadTestEnv() {
  const envPath = resolve(__dirname, '../../.xenv.test')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
}

loadTestEnv()

import type { CoreContext } from '../../functions/_shared/middleware.ts'
import { adminDb, SYSTEM_PRINCIPAL } from '../../functions/_shared/index.ts'

export { adminDb }

export const TEST_ACCOUNT_ID = process.env.SPINE_TEST_ACCOUNT_ID || ''

if (!TEST_ACCOUNT_ID) {
  console.warn('[test] SPINE_TEST_ACCOUNT_ID not set — integration tests may fail')
}

/**
 * Build a CoreContext for integration tests using the system principal.
 * Scoped to TEST_ACCOUNT_ID by default.
 */
export function makeTestCtx(overrides: Partial<CoreContext> = {}): CoreContext {
  return {
    principal: {
      ...SYSTEM_PRINCIPAL,
      accountId: TEST_ACCOUNT_ID
    },
    accountId: TEST_ACCOUNT_ID,
    db: adminDb,
    requestId: crypto.randomUUID(),
    ...overrides
  }
}

/**
 * Clean up items created during tests
 */
export async function cleanupItems(ids: string[]) {
  if (ids.length === 0) return
  await adminDb.from('items').delete().in('id', ids)
}

/**
 * Clean up pipelines and their executions created during tests
 */
export async function cleanupPipelines(ids: string[]) {
  if (ids.length === 0) return
  await adminDb.from('pipeline_executions').delete().in('pipeline_id', ids)
  await adminDb.from('pipelines').delete().in('id', ids)
}

/**
 * Clean up threads and their messages created during tests
 */
export async function cleanupThreads(ids: string[]) {
  if (ids.length === 0) return
  await adminDb.from('messages').delete().in('thread_id', ids)
  await adminDb.from('threads').delete().in('id', ids)
}
