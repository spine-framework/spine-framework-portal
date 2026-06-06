/// <reference types="node" />
/**
 * @module cli/commands/dev
 * @audience installer
 * @layer cli
 * @stability stable
 *
 * `spine dev` command — unified development server for Spine.
 * Handles assembly, integrity verification, and Vite dev server startup.
 *
 * **Commands:**
 * | Subcommand        | Description                                           |
 * |-------------------|-------------------------------------------------------|
 * | `dev`             | Start dev server with assembly and integrity check    |
 * | `dev --no-verify` | Skip integrity verification (faster)                  |
 * | `dev --port 3002` | Use custom port (default: 3001)                       |
 * | `dev --watch`     | Watch v2-custom for changes and auto-reassemble         |
 * | `dev --no-watch`  | Disable file watching (manual rebuild only)           |
 *
 * **What happens:**
 * 1. Runs `assemble:v2` to merge v2-core + v2-custom
 * 2. Runs `verify` to check core integrity (unless --no-verify)
 * 3. Starts Vite dev server on port 3001 (or --port)
 * 4. Watches v2-custom/ for changes (--watch by default)
 * 5. Fast incremental reassembly on custom code changes
 *
 * **Usage:**
 * ```bash
 * spine dev
 * spine dev --port 3002
 * spine dev --no-verify
 * ```
 *
 * @seeAlso scripts/assemble-v2.sh (assembly script)
 * @seeAlso scripts/verify-integrity.sh (verification script)
 * @seeAlso vite.config.ts (Vite configuration)
 */

import type { Command } from 'commander'
import { spawn, execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { watch, existsSync, statSync, readdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '../../../')

// ─── COMMAND REGISTRATION ──────────────────────────────────────────────────

export function registerDevCommands(program: Command) {
  program
    .command('dev')
    .description('Start Spine development server')
    .option('--no-verify', 'Skip integrity verification')
    .option('--port <port>', 'Dev server port', '3001')
    .option('--host', 'Expose to network', false)
    .option('--no-watch', 'Disable file watching')
    .option('--watch-delay <ms>', 'Debounce delay for reassembly', '500')
    .action(async (opts) => {
      console.log('\n🚀 Starting Spine dev server...\n')

      try {
        // Step 1: Assembly
        console.log('📦 Step 1: Assembling v2-core + v2-custom...')
        const assemblyExitCode = await runCommand(
          'bash',
          [resolve(PROJECT_ROOT, 'scripts/assemble-v2.sh')],
          PROJECT_ROOT
        )

        if (assemblyExitCode !== 0) {
          console.error('\n❌ Assembly failed. Please check the errors above.')
          process.exit(1)
        }
        console.log('✓ Assembly complete\n')

        // Step 2: Integrity verification (unless skipped)
        if (opts.verify !== false) {
          console.log('🔒 Step 2: Verifying core integrity...')
          const verifyExitCode = await runCommand(
            'bash',
            [resolve(PROJECT_ROOT, 'scripts/verify-integrity.sh')],
            PROJECT_ROOT
          )

          if (verifyExitCode !== 0) {
            console.warn('\n⚠️  Integrity check failed. Continuing anyway (--no-verify to skip)\n')
          } else {
            console.log('✓ Integrity verified\n')
          }
        } else {
          console.log('⏭️  Step 2: Skipping integrity verification (--no-verify)\n')
        }

        // Step 3: Start Vite
        console.log(`🌐 Step 3: Starting Vite dev server on port ${opts.port}...`)
        console.log('   (Press Ctrl+C to stop)\n')

        const vite = spawn(
          resolve(PROJECT_ROOT, 'node_modules/.bin/vite'),
          [
            '--config', resolve(PROJECT_ROOT, 'vite.config.ts'),
            '--port', opts.port,
            ...(opts.host ? ['--host'] : [])
          ],
          {
            cwd: PROJECT_ROOT,
            stdio: 'inherit',
            env: { ...process.env, SPINE_DEV: 'true' }
          }
        )

        // Step 4: Watch v2-custom for changes (unless disabled)
        let watcher: ReturnType<typeof watch> | null = null
        if (opts.watch !== false) {
          const watchDelay = parseInt(opts.watchDelay) || 500
          const customDir = resolve(PROJECT_ROOT, 'v2-custom')

          if (existsSync(customDir)) {
            console.log(`👁️  Step 4: Watching v2-custom/ for changes...`)
            console.log(`   (Changes trigger fast reassembly after ${watchDelay}ms debounce)\n`)

            let reassemblyTimeout: NodeJS.Timeout | null = null

            watcher = watch(customDir, { recursive: true }, (eventType, filename) => {
              // Ignore node_modules, .git, and temp files
              if (!filename || filename.includes('node_modules') || filename.startsWith('.')) {
                return
              }

              console.log(`\n📝 Change detected in v2-custom/${filename}`)

              // Debounce reassembly
              if (reassemblyTimeout) {
                clearTimeout(reassemblyTimeout)
              }

              reassemblyTimeout = setTimeout(async () => {
                console.log('🔧 Running fast reassembly...')
                try {
                  const start = Date.now()
                  await fastReassemble(PROJECT_ROOT)
                  const duration = Date.now() - start
                  console.log(`✓ Reassembly complete (${duration}ms)\n`)
                } catch (err: any) {
                  console.error(`✗ Reassembly failed: ${err.message}\n`)
                }
              }, watchDelay)
            })
          } else {
            console.log('⏭️  Step 4: v2-custom/ not found, skipping watch mode\n')
          }
        } else {
          console.log('⏭️  Step 4: File watching disabled (--no-watch)\n')
        }

        vite.on('exit', (code) => {
          if (watcher) {
            watcher.close()
          }
          process.exit(code || 0)
        })

        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
          console.log('\n\n🛑 Shutting down dev server...')
          if (watcher) {
            watcher.close()
          }
          vite.kill('SIGTERM')
        })

        process.on('SIGTERM', () => {
          if (watcher) {
            watcher.close()
          }
          vite.kill('SIGTERM')
        })

      } catch (err: any) {
        console.error('\n❌ Error:', err.message)
        if (process.env.SPINE_CLI_DEBUG) {
          console.error(err.stack)
        }
        process.exit(1)
      }
    })
}

// ─── HELPER ────────────────────────────────────────────────────────────────

function runCommand(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env
    })

    proc.on('exit', (code) => {
      resolve(code || 0)
    })

    proc.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Fast incremental reassembly of v2-custom files only.
 * Uses rsync if available, falls back to selective copy.
 */
async function fastReassemble(projectRoot: string): Promise<void> {
  const customDir = resolve(projectRoot, 'v2-custom')
  const srcDest = resolve(projectRoot, 'src/v2-assembled')
  const funcsDest = resolve(projectRoot, 'functions')

  // Check if rsync is available
  let hasRsync = false
  try {
    execSync('which rsync', { stdio: 'pipe' })
    hasRsync = true
  } catch {
    hasRsync = false
  }

  // Reassemble custom frontend files
  const customSrcDir = resolve(customDir, 'src')
  if (existsSync(customSrcDir)) {
    const destDir = srcDest

    if (hasRsync) {
      // Use rsync for efficient incremental sync
      execSync(
        `rsync -av --delete "${customSrcDir}/" "${destDir}/"`,
        { stdio: 'pipe', cwd: projectRoot }
      )
    } else {
      // Fallback: copy files that have changed
      copyChangedFiles(customSrcDir, destDir)
    }
  }

  // Reassemble custom function files
  const customFuncsDir = resolve(customDir, 'functions')
  if (existsSync(customFuncsDir)) {
    if (hasRsync) {
      execSync(
        `rsync -av --delete "${customFuncsDir}/" "${funcsDest}/"`,
        { stdio: 'pipe', cwd: projectRoot }
      )
    } else {
      copyChangedFiles(customFuncsDir, funcsDest)
    }
  }
}

/**
 * Copy only files that have changed (mtime comparison).
 * Fallback when rsync is not available.
 */
function copyChangedFiles(src: string, dest: string): void {
  const files = readdirSync(src, { withFileTypes: true })

  for (const entry of files) {
    const srcPath = resolve(src, entry.name)
    const destPath = resolve(dest, entry.name)

    if (entry.isDirectory()) {
      if (!existsSync(destPath)) {
        // Create directory
        const { mkdirSync } = require('fs')
        mkdirSync(destPath, { recursive: true })
      }
      // Recurse
      copyChangedFiles(srcPath, destPath)
    } else {
      // Check if file needs copying
      const srcStat = statSync(srcPath)
      let needsCopy = true

      if (existsSync(destPath)) {
        const destStat = statSync(destPath)
        needsCopy = srcStat.mtime > destStat.mtime
      }

      if (needsCopy) {
        const { copyFileSync } = require('fs')
        copyFileSync(srcPath, destPath)
      }
    }
  }
}
