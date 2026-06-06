/// <reference types="node" />
/**
 * @module cli/context
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * CLI context builder and output utilities. This is the CLI equivalent of
 * `createHandler()` in `middleware.ts` — it resolves the principal, picks the
 * correct Supabase client, and returns a `CoreContext` that every CLI command
 * passes directly to core functions.
 *
 * **Environment variables read from `.xenv` or `process.env`:**
 * | Variable                  | Required | Purpose                            |
 * |---------------------------|----------|------------------------------------|
 * | `SUPABASE_URL`            | yes      | Project API URL                    |
 * | `SUPABASE_SERVICE_ROLE_KEY` | yes    | Service-role client (admin ops)    |
 * | `SUPABASE_ANON_KEY`       | yes      | User-scoped client (JWT mode)      |
 * | `SPINE_CLI_ACCOUNT_ID`    | no       | Default account scope              |
 * | `SPINE_CLI_JWT`           | no       | Human principal (Supabase JWT)     |
 * | `SPINE_CLI_API_KEY`       | no       | Machine principal (hashed key)     |
 * | `SPINE_CLI_DEBUG`         | no       | Print stack traces on error        |
 *
 * **Principal resolution priority** (first match wins):
 * 1. `SPINE_CLI_JWT` → human principal (RLS-scoped `getUserDb`)
 * 2. `SPINE_CLI_API_KEY` → machine principal (`adminDb`)
 * 3. Fallback → `SYSTEM_PRINCIPAL` (`adminDb` — admin ops only)
 *
 * @seeAlso functions/_shared/middleware.ts (createHandler — server-side equivalent)
 * @seeAlso functions/_shared/principal.ts (Principal type and SYSTEM_PRINCIPAL)
 * @seeAlso cli/index.ts (entry point that imports all commands)
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CoreContext, adminDb, SYSTEM_PRINCIPAL, Principal, getUserDb } from '../functions/_shared/index.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ─── ENV LOADING ────────────────────────────────────────────────────────────

// ─── CHUNK_START: CLI_CONTEXT_LOAD_ENV ──────────────────────────────────────────────
/**
 * @chunk-id    CLI_CONTEXT_LOAD_ENV_1_0_0
 * @version     1.0.0
 * @hash        0adefa52a0c93821ee538ffe32a4069061bd75e7cada7175b11be3e11027e369
 * @macro       Environment Variable Loader
 * @micro       Reads .xenv file and populates process.env with missing vars
 * @inputs      none — reads from .xenv file path
 * @outputs     void — mutates process.env
 * @depends-on  [fs, path]
 * @depended-by [buildCliContext]
 * @side-effects [mutates process.env, file system reads]
 * @tags        environment, configuration, cli, dotenv
 */
function loadEnv() {
  const envPath = resolve(__dirname, '../.xenv')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
}
// ─── CHUNK_END: CLI_CONTEXT_LOAD_ENV ────────────────────────────────────────────────

// ─── TYPES ──────────────────────────────────────────────────────────────────

/**
 * Options passed from CLI command `.action()` callbacks to `buildCliContext`.
 *
 * @inputSpec account: string | undefined — UUID of the target account; overrides
 *   `SPINE_CLI_ACCOUNT_ID` if both are present.
 * @calledBy All `registerXxxCommands` functions before calling core functions
 */
export interface CliOptions {
  account?: string
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────────────────────

// ─── CHUNK_START: CLI_CONTEXT_BUILD ──────────────────────────────────────────────
/**
 * @chunk-id    CLI_CONTEXT_BUILD_1_0_0
 * @version     1.0.0
 * @hash        501162983b1b24e9a15267ca7b8398b3733f540b2a65a96d8277ec3d780f2003
 * @macro       CLI Context Builder
 * @micro       Constructs CoreContext with principal resolution and Supabase client
 * @inputs      opts: CliOptions — Optional overrides including account ID
 * @outputs     CoreContext — Fully resolved context with principal, DB client, and request ID
 * @depends-on  [loadEnv, adminDb, getUserDb, SYSTEM_PRINCIPAL]
 * @depended-by [All CLI command handlers]
 * @side-effects [DB queries, environment reads, crypto.randomUUID]
 * @tags        cli, authentication, principal-resolution, context
 */
export async function buildCliContext(opts: CliOptions = {}): Promise<CoreContext> {
  loadEnv()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Set them in v2-core/.xenv or export them before running spine commands.'
    )
  }

  const accountId = opts.account || process.env.SPINE_CLI_ACCOUNT_ID || null
  const requestId = crypto.randomUUID()

  // Machine API key auth
  const apiKey = process.env.SPINE_CLI_API_KEY
  if (apiKey) {
    const { data: keyRecord } = await adminDb
      .from('api_keys')
      .select('id, account_id, scopes, principal_id')
      .eq('key_hash', apiKey)
      .eq('is_active', true)
      .single()

    if (!keyRecord) {
      throw new Error('Invalid or inactive SPINE_CLI_API_KEY')
    }

    const principal: Principal = {
      id: keyRecord.principal_id || keyRecord.id,
      type: 'machine',
      accountId: keyRecord.account_id,
      scopes: keyRecord.scopes || [],
      provenance: {
        sourceType: 'api_key',
        createdBy: null,
        apiKeyId: keyRecord.id,
        invokedAt: new Date().toISOString()
      }
    }

    return {
      principal,
      accountId: accountId || keyRecord.account_id,
      db: adminDb,
      requestId
    }
  }

  // JWT auth (human principal)
  const jwt = process.env.SPINE_CLI_JWT
  if (jwt) {
    const userDb = getUserDb(jwt)
    const { data: { user } } = await userDb.auth.getUser()

    if (!user) {
      throw new Error('Invalid or expired SPINE_CLI_JWT')
    }

    const { data: person } = await adminDb
      .from('people')
      .select('id, full_name, email, roles:people_roles(role:roles(slug))')
      .eq('auth_user_id', user.id)
      .single()

    const roles = (person?.roles as any[])?.map((r: any) => r.role?.slug).filter(Boolean) || []

    const principal: Principal = {
      id: person?.id || user.id,
      type: 'human',
      accountId: accountId,
      displayName: person?.full_name || user.email,
      email: person?.email || user.email,
      roles,
      provenance: {
        sourceType: 'jwt',
        createdBy: person?.id || user.id,
        invokedAt: new Date().toISOString()
      },
      authContext: { jwt }
    }

    return {
      principal,
      accountId,
      db: userDb,
      requestId
    }
  }

  // Fallback: system principal (admin ops)
  return {
    principal: SYSTEM_PRINCIPAL,
    accountId,
    db: adminDb,
    requestId
  }
}
// ─── CHUNK_END: CLI_CONTEXT_BUILD ────────────────────────────────────────────────

// ─── OUTPUT UTILITIES ─────────────────────────────────────────────────────────

// ─── CHUNK_START: CLI_CONTEXT_PRINT_RESULT ──────────────────────────────────────────────
/**
 * @chunk-id    CLI_CONTEXT_PRINT_RESULT_1_0_0
 * @version     1.0.0
 * @hash        06e492defa9012290a5c8b2d4fca27f01df11bdc194ffbdf4f4b4518aa683c2b
 * @macro       CLI Output Formatter
 * @micro       Pretty-prints query results as JSON or ASCII tables
 * @inputs      data: any — Result data to display (array or single value)
 * @inputs      opts: { json?: boolean } — Output format options
 * @outputs     void — Console output only
 * @depends-on  [console, JSON]
 * @depended-by [All CLI command list/get handlers]
 * @side-effects [console.log output]
 * @tags        cli, output, formatting, tables, json
 */
export function printResult(data: any, opts: { json?: boolean } = {}) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      console.log('(no results)')
      return
    }
    const keys = Object.keys(data[0])
    const rows = data.map(row => keys.map(k => String(row[k] ?? '')))
    const widths = keys.map((k, i) => Math.max(k.length, ...rows.map(r => r[i].length)))
    const hr = widths.map(w => '-'.repeat(w)).join('  ')
    console.log(keys.map((k, i) => k.padEnd(widths[i])).join('  '))
    console.log(hr)
    rows.forEach(row => console.log(row.map((v, i) => v.padEnd(widths[i])).join('  ')))
    console.log(`\n(${data.length} row${data.length !== 1 ? 's' : ''})`)
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}
// ─── CHUNK_END: CLI_CONTEXT_PRINT_RESULT ────────────────────────────────────────────────

// ─── CHUNK_START: CLI_CONTEXT_HANDLE_ERROR ──────────────────────────────────────────────
/**
 * @chunk-id    CLI_CONTEXT_HANDLE_ERROR_1_0_0
 * @version     1.0.0
 * @hash        61aca7e4bce61b5b790e8f27ef3f505a6a6fe9a8cd6643e577f610d9dd15b1cd
 * @macro       CLI Error Handler
 * @micro       Prints formatted error and exits with proper debug information
 * @inputs      err: any — Error object or string message
 * @outputs     void — Process termination (exit code 1)
 * @depends-on  [console, process]
 * @depended-by [All CLI command action handlers]
 * @side-effects [console.error output, process.exit]
 * @tags        cli, error-handling, debug, process-exit
 */
export function handleError(err: any) {
  console.error(`\nError: ${err.message || err}`)
  if (process.env.SPINE_CLI_DEBUG) {
    console.error(err.stack)
  }
  process.exit(1)
}
// ─── CHUNK_END: CLI_CONTEXT_HANDLE_ERROR ────────────────────────────────────────────────
