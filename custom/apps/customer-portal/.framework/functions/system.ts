/**
 * @module system
 * @audience both
 * @layer api-handler
 * @stability stable
 *
 * System discovery and health endpoints for agentic IDE integration.
 * Provides machine-readable descriptions of the Spine instance,
 * runtime health checks, and OpenAPI spec generation.
 *
 * **Routed by:** `GET /.netlify/functions/system`
 *
 * **Dispatch table:**
 * | ?action | Description |
 * |---------|-------------|
 * | manifest | Returns system manifest (version, functions, integrity) |
 * | health   | Returns health check status of all components |
 * | openapi  | Returns OpenAPI 3.1 spec for all endpoints |
 *
 * **Authorization:**
 * - `manifest`: No auth required (public endpoint)
 * - `health`: No auth required (public endpoint)
 * - `openapi`: No auth required (public endpoint)
 *
 * @seeAlso .spine-manifest.json (integrity hashes)
 * @seeAlso cli/index.ts (CLI consumer of these endpoints)
 */

import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface FunctionInfo {
  name: string
  methods: string[]
  path: string
  description?: string
}

interface SystemManifest {
  version: string
  schema: string
  migrations: {
    applied: number
    latest: string | null
    pending: number
  }
  functions: FunctionInfo[]
  integrity: {
    core_hash: string | null
    verified: boolean
  }
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: {
    database: { connected: boolean; latency_ms: number }
    migrations: { current: boolean; pending: number; applied: number }
    integrity: { verified: boolean }
    test_runs?: { last_suite: string; last_status: string; last_at: string }
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Netlify functions run from /functions directory after assembly
// Project root is two levels up: /functions/../.. = project root
const PROJECT_ROOT = resolve(process.cwd(), '.')

function loadManifest(): { version: string; integrity: { core_hash: string | null; verified: boolean } } {
  try {
    const manifestPath = resolve(PROJECT_ROOT, '.spine-manifest.json')
    if (!existsSync(manifestPath)) {
      return { version: '2.0.0', integrity: { core_hash: null, verified: false } }
    }
    const content = readFileSync(manifestPath, 'utf8')
    const manifest = JSON.parse(content)
    return {
      version: manifest.version || '2.0.0',
      integrity: {
        core_hash: manifest.integrity?.src || null,
        verified: true
      }
    }
  } catch {
    return { version: '2.0.0', integrity: { core_hash: null, verified: false } }
  }
}

async function discoverFunctions(): Promise<FunctionInfo[]> {
  const functionsDir = resolve(PROJECT_ROOT, 'v2-core/functions')
  if (!existsSync(functionsDir)) {
    return []
  }

  const files = readdirSync(functionsDir)
    .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
    .sort()

  return files.map(f => {
    const name = f.replace('.ts', '')
    // Infer methods from common patterns
    const methods = ['GET']
    if (!['logs', 'tests', 'system-cron', 'debug-auth'].includes(name)) {
      methods.push('POST')
    }
    if (!['logs', 'tests', 'system-cron'].includes(name)) {
      methods.push('PATCH')
    }
    if (!['logs', 'tests', 'system-cron', 'debug-auth', 'auth'].includes(name)) {
      methods.push('DELETE')
    }

    return {
      name,
      methods,
      path: `/.netlify/functions/${name}`,
      description: `Spine ${name} endpoint`
    }
  })
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────

async function getManifest(): Promise<{ data: SystemManifest }> {
  const manifest = loadManifest()

  // Get migration status
  const migrationsDir = resolve(PROJECT_ROOT, 'v2-core/migrations_dayzero')
  let localMigrations: string[] = []
  if (existsSync(migrationsDir)) {
    localMigrations = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
  }

  let appliedMigrations: string[] = []
  try {
    const { data } = await adminDb
      .schema('public' as any)
      .from('schema_migrations' as any)
      .select('version')
      .order('version', { ascending: true })
    appliedMigrations = (data || []).map((r: any) => r.version)
  } catch {
    // Schema migrations table may not exist yet
  }

  const appliedSet = new Set(appliedMigrations)
  const pendingCount = localMigrations.filter(m => !appliedSet.has(m.replace('.sql', ''))).length

  const functions = await discoverFunctions()

  return {
    data: {
      version: manifest.version,
      schema: 'public',
      migrations: {
        applied: appliedMigrations.length,
        latest: appliedMigrations[appliedMigrations.length - 1] || null,
        pending: pendingCount
      },
      functions,
      integrity: manifest.integrity
    }
  }
}

async function getHealth(): Promise<{ data: HealthCheck }> {
  const checks: HealthCheck['checks'] = {
    database: { connected: false, latency_ms: 0 },
    migrations: { current: false, pending: 0, applied: 0 },
    integrity: { verified: false }
  }

  // Database check
  const dbStart = Date.now()
  try {
    const { error } = await adminDb.from('accounts').select('id').limit(1)
    checks.database.connected = !error
    checks.database.latency_ms = Date.now() - dbStart
  } catch {
    checks.database.connected = false
  }

  // Migration check
  const migrationsDir = resolve(PROJECT_ROOT, 'v2-core/migrations_dayzero')
  let localMigrations: string[] = []
  if (existsSync(migrationsDir)) {
    localMigrations = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()
  }

  try {
    const { data } = await adminDb
      .schema('public' as any)
      .from('schema_migrations' as any)
      .select('version')
    const applied = (data || []).map((r: any) => r.version)
    checks.migrations.applied = applied.length
    const appliedSet = new Set(applied)
    checks.migrations.pending = localMigrations.filter(m => !appliedSet.has(m.replace('.sql', ''))).length
    checks.migrations.current = checks.migrations.pending === 0
  } catch {
    checks.migrations.pending = localMigrations.length
    checks.migrations.current = false
  }

  // Integrity check
  const manifest = loadManifest()
  checks.integrity.verified = manifest.integrity.verified

  // Test run check (optional)
  try {
    const { data } = await adminDb
      .from('test_runs')
      .select('suite, status, started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      checks.test_runs = {
        last_suite: data.suite,
        last_status: data.status,
        last_at: data.started_at
      }
    }
  } catch {
    // test_runs table may not exist
  }

  // Determine overall status
  let status: HealthCheck['status'] = 'healthy'
  if (!checks.database.connected) {
    status = 'unhealthy'
  } else if (checks.migrations.pending > 0 || !checks.integrity.verified) {
    status = 'degraded'
  }

  return { data: { status, checks } }
}

async function getOpenApi(): Promise<{ data: any }> {
  const functions = await discoverFunctions()
  const manifest = loadManifest()

  const paths: Record<string, any> = {}
  for (const fn of functions) {
    const pathKey = fn.path.replace('/.netlify/functions', '')
    paths[pathKey] = {}

    for (const method of fn.methods) {
      const methodLower = method.toLowerCase()
      paths[pathKey][methodLower] = {
        operationId: `${fn.name}_${methodLower}`,
        summary: fn.description || `${method} ${fn.name}`,
        parameters: [
          {
            name: 'action',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Action to perform (list, get, create, update, delete)'
          }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }

  return {
    data: {
      openapi: '3.1.0',
      info: {
        title: 'Spine API',
        version: manifest.version,
        description: 'Spine v2 REST API for agentic IDE integration'
      },
      servers: [
        { url: '/.netlify/functions' }
      ],
      paths
    }
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export const handler = createHandler(async (ctx) => {
  const q = (ctx as any).query || {}
  const action = q.action || 'manifest'

  switch (action) {
    case 'manifest':
      return getManifest()

    case 'health':
      return getHealth()

    case 'openapi':
      return getOpenApi()

    default:
      return {
        error: `Unknown action: ${action}. Valid actions: manifest, health, openapi`,
        status: 400
      }
  }
})
