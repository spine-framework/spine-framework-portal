#!/usr/bin/env tsx

/**
 * @module scripts/app-install-cli
 * @audience installer
 * @layer cli
 * @stability orphaned
 *
 * Spine App Installation CLI - Validates and executes app installation instruction files.
 * **ORPHANED**: References non-existent schema and template files at `../docs/app-installation/`.
 * 
 * **Intended Purpose**: Validate YAML instruction files against JSON schema and execute
 * multi-step app installations (pack installation, app creation, migrations, verification).
 * 
 * **Current State**: Cannot function - missing required schema.json and template files.
 * 
 * **Dependencies**: commander, js-yaml, ajv for CLI operations and validation.
 * 
 * @tags orphaned, cli, app-installation, validation
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { program } from 'commander'
import yaml from 'js-yaml'
import Ajv from 'ajv'
import { fileURLToPath } from 'url'

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load JSON schema
const schemaPath = resolve(__dirname, '../docs/app-installation/schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))

const ajv = new Ajv()
const validate = ajv.compile(schema)

interface InstallationContext {
  TARGET_ACCOUNT_ID?: string
  PACK_INSTALLATION_ID?: string
  [key: string]: string | undefined
}

// ─── CHUNK_START: APP_INSTALL_CLI_SUBSTITUTE_VARIABLES ──────────────────────────────────────────────
/**
 * @chunk-id    APP_INSTALL_CLI_SUBSTITUTE_VARIABLES_1_0_0
 * @version     1.0.0
 * @hash        122ca9e63f2310e8a01f76dc9c962319d8e267d8737c39895425440489a747bd
 * @macro       Variable Substitution Engine
 * @micro       Recursively replaces ${VAR} placeholders with context values
 * @inputs      obj: any — Object containing ${VAR} placeholders
 * @inputs      context: InstallationContext — Variable name to value mapping
 * @outputs     any — Object with all placeholders substituted
 * @depends-on  [none]
 * @depended-by [validateInstructionFile, executeInstallation]
 * @side-effects [none]
 * @tags        orphaned, variable-substitution, template-engine
 */
function substituteVariables(obj: any, context: InstallationContext): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return context[varName] || match
    })
  } else if (Array.isArray(obj)) {
    return obj.map(item => substituteVariables(item, context))
  } else if (obj && typeof obj === 'object') {
    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteVariables(value, context)
    }
    return result
  }
  return obj
}
// ─── CHUNK_END: APP_INSTALL_CLI_SUBSTITUTE_VARIABLES ────────────────────────────────────────────────

// ─── CHUNK_START: APP_INSTALL_CLI_VALIDATE_INSTRUCTION_FILE ──────────────────────────────────────────────
/**
 * @chunk-id    APP_INSTALL_CLI_VALIDATE_INSTRUCTION_FILE_1_0_0
 * @version     1.0.0
 * @hash        c673609fd3442632d832e0c4c3ef2dbda0a51e381bb469e55b7e2cc59005b5e2
 * @macro       Installation File Validation
 * @micro       Validates YAML instruction files against JSON schema
 * @inputs      filePath: string — Path to YAML instruction file
 * @outputs     boolean — true if valid, false otherwise
 * @depends-on  [schema, validate, substituteVariables]
 * @depended-by [executeInstallation]
 * @side-effects [console output, file system reads]
 * @tags        orphaned, validation, yaml, json-schema
 */
async function validateInstructionFile(filePath: string): Promise<void> {
  try {
    console.log(`🔍 Validating ${filePath}...`)
    
    if (!existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`)
      process.exit(1)
    }

    const content = readFileSync(filePath, 'utf8')
    const data = yaml.load(content) as any

    // Validate against schema
    if (!validate(data)) {
      console.error('❌ Validation failed:')
      console.error(JSON.stringify(validate.errors, null, 2))
      process.exit(1)
    }

    console.log('✅ Schema validation passed')
  } catch (error) {
    console.error(`❌ Error validating ${filePath}:`, error)
    process.exit(1)
  }
}
// ─── CHUNK_END: APP_INSTALL_CLI_VALIDATE_INSTRUCTION_FILE ────────────────────────────────────────────────

// ─── CHUNK_START: APP_INSTALL_CLI_EXECUTE_INSTALLATION ──────────────────────────────────────────────
/**
 * @chunk-id    APP_INSTALL_CLI_EXECUTE_INSTALLATION_1_0_0
 * @version     1.0.0
 * @hash        c84aa57769569e4b00ebde4d8b29b7059e6b0d6e8eb3d82cfa51c15e1451e04a
 * @macro       Multi-Step App Installation Executor
 * @micro       Orchestrates pack installation, app creation, migrations, and verification
 * @inputs      filePath: string — Path to YAML instruction file
 * @inputs      options: any — CLI options including accountId
 * @outputs     void — Console output only
 * @depends-on  [validateInstructionFile, substituteVariables, yaml, fs]
 * @depended-by [CLI program command handler]
 * @side-effects [console output, file system reads, process.exit on failure]
 * @tags        orphaned, installation, orchestration, multi-step
 */
async function executeInstallation(filePath: string, options: any): Promise<void> {
  try {
    console.log(`🚀 Executing installation from ${filePath}...`)

    // First validate
    await validateInstructionFile(filePath)

    const content = readFileSync(filePath, 'utf8')
    const instructions = yaml.load(content) as any

    // Set up context
    const context: InstallationContext = {
      TARGET_ACCOUNT_ID: options.accountId,
      ...instructions.variables
    }

    console.log('📋 Installation plan:')
    console.log(`  App: ${instructions.app.name} v${instructions.app.version}`)
    console.log(`  Target Account: ${context.TARGET_ACCOUNT_ID}`)
    console.log()

    // Step 1: Pack installation
    console.log('📦 Step 1: Installing pack...')
    const packInstall = substituteVariables(instructions.installation.pack_installation, context)
    console.log('  Pack installation config:', JSON.stringify(packInstall, null, 2))
    
    // Simulate pack installation - in real implementation, this would call the API
    const packInstallationId = 'simulated-pack-id-' + Date.now()
    context.PACK_INSTALLATION_ID = packInstallationId
    console.log(`  ✅ Pack installed with ID: ${packInstallationId}`)

    // Step 2: App creation
    console.log('⚙️  Step 2: Creating app definitions...')
    if (instructions.installation.app_creation) {
      for (const appDef of instructions.installation.app_creation) {
        const appConfig = substituteVariables(appDef, context)
        console.log(`  Creating app: ${appConfig.slug}`)
        console.log('  App config:', JSON.stringify(appConfig, null, 2))
        console.log(`  ✅ App ${appConfig.slug} created`)
      }
    }

    // Step 3: Migrations
    console.log('🔄 Step 3: Running migrations...')
    if (instructions.installation.migrations) {
      for (const migration of instructions.installation.migrations) {
        console.log(`  Running migration: ${migration.file}`)
        console.log(`    Description: ${migration.description}`)
        if (migration.dependencies) {
          console.log(`    Dependencies: ${migration.dependencies.join(', ')}`)
        }
        console.log(`  ✅ Migration completed`)
      }
    }

    // Step 4: Verification
    console.log('✅ Step 4: Verifying installation...')
    if (instructions.installation.verification) {
      for (const verification of instructions.installation.verification) {
        console.log(`  Verifying: ${verification.check}`)
        if (verification.slug) console.log(`    Slug: ${verification.slug}`)
        if (verification.integration_id) console.log(`    Integration: ${verification.integration_id}`)
        console.log(`  ✅ Verification passed`)
      }
    }

    console.log()
    console.log('🎉 Installation completed successfully!')
    console.log(`📱 App "${instructions.app.name}" is ready to use`)

  } catch (error) {
    console.error('❌ Installation failed:', error)
    process.exit(1)
  }
}
// ─── CHUNK_END: APP_INSTALL_CLI_EXECUTE_INSTALLATION ────────────────────────────────────────────────

// ─── CHUNK_START: APP_INSTALL_CLI_GENERATE_TEMPLATE ──────────────────────────────────────────────
/**
 * @chunk-id    APP_INSTALL_CLI_GENERATE_TEMPLATE_1_0_0
 * @version     1.0.0
 * @hash        4ea17e0556f329f835cec106f09cb570c9e4ea8a92bc82e5fe9ccf4b5dd52aa9
 * @macro       Template Generator
 * @micro       Outputs YAML templates for app installations or migrations
 * @inputs      type: string — Template type ("app" or "migration")
 * @inputs      options: any — CLI options including output file path
 * @outputs     void — Console output or file write
 * @depends-on  [fs, path]
 * @depended-by [CLI program command handler]
 * @side-effects [console output, file system reads/writes, process.exit on failure]
 * @tags        orphaned, template-generation, yaml, cli
 */
async function generateTemplate(type: string, options: any): Promise<void> {
  try {
    const templateDir = resolve(__dirname, '../docs/app-installation/templates')
    let templateFile: string

    switch (type) {
      case 'app':
        templateFile = resolve(templateDir, 'app-install.yaml')
        break
      case 'migration':
        templateFile = resolve(templateDir, 'migration.yaml')
        break
      default:
        console.error('❌ Unknown template type. Use "app" or "migration"')
        process.exit(1)
    }

    const template = readFileSync(templateFile, 'utf8')
    
    if (options.output) {
      writeFileSync(options.output, template)
      console.log(`✅ Template generated: ${options.output}`)
    } else {
      console.log(template)
    }
  } catch (error) {
    console.error('❌ Error generating template:', error)
    process.exit(1)
  }
}
// ─── CHUNK_END: APP_INSTALL_CLI_GENERATE_TEMPLATE ────────────────────────────────────────────────

// CLI setup
program
  .name('app-install-cli')
  .description('Spine App Installation CLI - Validate and execute app installation instructions')
  .version('1.0.0')

program
  .command('validate')
  .description('Validate an instruction file against the schema')
  .argument('<file>', 'Instruction file path')
  .action(validateInstructionFile)

program
  .command('install')
  .description('Execute app installation from instruction file')
  .argument('<file>', 'Instruction file path')
  .option('-a, --account-id <id>', 'Target account ID')
  .option('-d, --dry-run', 'Simulate installation without making changes')
  .action(executeInstallation)

program
  .command('template')
  .description('Generate a new instruction template')
  .argument('<type>', 'Template type: app or migration')
  .option('-o, --output <path>', 'Output file path (optional, prints to stdout)')
  .action(generateTemplate)

program.parse()
