import { defineConfig } from 'vitest/config'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Load .xenv.test so integration tests get real DB credentials before any
// worker module graph (db.ts, principal.ts) evaluates createClient() calls.
const xenvTest = resolve(__dirname, 'v2-core/.xenv.test')
if (existsSync(xenvTest)) {
  for (const line of readFileSync(xenvTest, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}

export default defineConfig({
  test: {
    // Stub SUPABASE_URL etc. before any module is imported
    setupFiles: ['v2-core/tests/setup.ts'],
    // Each test file gets its own module instance (important for vi.mock isolation)
    isolate: true,
    // Allow .ts extension imports (tsx-style)
    environment: 'node',
    // Resolve .ts imports as themselves (no .js→.ts rewriting needed in tests)
    include: [
      'v2-core/tests/unit/**/*.test.ts',
      'v2-core/tests/integration/**/*.test.ts',
      'v2-core/tests/api/**/*.test.ts'
    ],
    // Global test timeout — integration + API tests may hit Supabase / local server
    testTimeout: 20000,
    // Don't fail the suite on integration tests if env isn't configured
    passWithNoTests: true,
    // Persist results to public.test_runs after every run
    reporters: ['default', './v2-core/tests/reporter.ts']
  },
  resolve: {
    // Allow bare .ts imports (the CLI + shared code uses these)
    extensions: ['.ts', '.js', '.json']
  }
})
