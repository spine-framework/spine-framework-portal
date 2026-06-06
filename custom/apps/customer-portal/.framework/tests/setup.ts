/// <reference types="node" />
/**
 * @module tests/setup
 * @audience core-contributor
 * @layer test-infrastructure
 * @stability stable
 *
 * Global Vitest setup file — runs before every test file via
 * `vitest.config.ts → setupFiles`.
 *
 * Stubs the three required Supabase env vars (`SUPABASE_URL`,
 * `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) so modules that call
 * `createClient()` at import time (`principal.ts`, `db.ts`) don't crash
 * with "supabaseUrl is required" in unit test runs.
 *
 * Integration tests load real values from `.xenv.test` via
 * `tests/integration/helpers.ts` and override these stubs.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load .xenv.test before stubs so integration tests get real DB credentials
// before db.ts evaluates its createClient() calls at module load time.
const xenvTestPath = resolve(__dirname, '../.xenv.test')
if (existsSync(xenvTestPath)) {
  for (const line of readFileSync(xenvTestPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'
