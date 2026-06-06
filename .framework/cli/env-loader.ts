/// <reference types="node" />
/**
 * @module cli/env-loader
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * Side-effect module: loads `v2-core/.xenv` into `process.env` before any
 * other CLI module is imported. Must be the first import in `cli/index.ts`
 * so that `db.ts` (which reads env vars at module-load time) sees the values.
 *
 * @sideEffects Mutates process.env — only sets keys not already present
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
