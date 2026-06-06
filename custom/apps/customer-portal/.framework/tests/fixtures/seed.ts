/// <reference types="node" />
/**
 * @module tests/fixtures/seed
 * @audience core-contributor
 * @layer test-infrastructure
 * @stability stable
 *
 * Idempotent fixture seed for integration tests. Upserts canonical test data
 * into the public schema under SPINE_TEST_ACCOUNT_ID. All rows use slugs
 * prefixed with `test-` so teardown.ts can clean them up safely.
 *
 * Run before integration tests: `tsx v2-core/tests/fixtures/seed.ts`
 *
 * @seeAlso tests/fixtures/teardown.ts
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

async function upsertRole(slug: string, name: string, permissions: string[]) {
  const { error } = await db.from('roles').upsert(
    { slug, name, permissions, is_active: true, account_id: ACCOUNT_ID },
    { onConflict: 'slug' }
  )
  if (error) console.warn(`  [warn] role ${slug}:`, error.message)
}

async function upsertType(kind: string, slug: string, name: string, designSchema: object) {
  const { data: app } = await db.from('apps').select('id').eq('slug', 'spine-core').single()
  const { error } = await db.from('types').upsert(
    {
      slug,
      kind,
      name,
      app_id: app?.id ?? null,
      design_schema: designSchema,
      validation_schema: {},
      is_active: true,
      ownership: 'pack'
    },
    { onConflict: 'slug' }
  )
  if (error) console.warn(`  [warn] type ${slug}:`, error.message)
}

async function upsertPerson(slug: string, fullName: string, email: string) {
  const { data: type } = await db.from('types').select('id').eq('kind', 'person').eq('is_active', true).limit(1).single()
  const { error } = await db.from('people').upsert(
    {
      slug,
      full_name: fullName,
      email,
      status: 'active',
      is_active: true,
      account_id: ACCOUNT_ID,
      type_id: type?.id ?? null,
      data: {}
    },
    { onConflict: 'email' }
  )
  if (error) console.warn(`  [warn] person ${slug}:`, error.message)
}

async function upsertItem(slug: string, title: string, isActive: boolean) {
  const { data: type } = await db.from('types').select('id').eq('kind', 'item').eq('is_active', true).limit(1).single()
  const { error } = await db.from('items').upsert(
    {
      slug,
      title,
      status: 'open',
      is_active: isActive,
      account_id: ACCOUNT_ID,
      type_id: type?.id ?? null,
      item_type: 'item',
      data: {}
    },
    { onConflict: 'slug' }
  )
  if (error) console.warn(`  [warn] item ${slug}:`, error.message)
}

async function seed() {
  console.log('🌱 Seeding test fixtures into public schema...')
  console.log('   ACCOUNT_ID:', ACCOUNT_ID)

  console.log('  → roles')
  await upsertRole('test-admin-role',  'Test Admin',  ['*'])
  await upsertRole('test-member-role', 'Test Member', ['items:read', 'people:read'])
  await upsertRole('test-viewer-role', 'Test Viewer', ['items:read'])

  console.log('  → types')
  const accountTypeSchema = {
    fields: {
      slug: { data_type: 'text', label: 'Slug', required: true, system: true, validation: null },
      display_name: { data_type: 'text', label: 'Display Name', required: true, system: true, validation: null },
      is_active: { data_type: 'boolean', label: 'Active', required: true, system: true, validation: null },
      created_at: { data_type: 'datetime', label: 'Created', required: false, system: true, readonly: true, validation: null }
    },
    views: {
      default_list: { type: 'list', display: 'table', label: 'Accounts',
        fields: { display_name: { sortable: true, display_type: 'text' }, is_active: { sortable: true, display_type: 'badge' } },
        default_sort: { field: 'created_at', direction: 'desc' }
      },
      default_detail: { type: 'detail', label: 'Account Detail',
        sections: [
          { title: 'Identity', fields: { slug: { display_type: 'input' }, display_name: { display_type: 'input' }, is_active: { display_type: 'checkbox' } } },
          { title: 'System', fields: { created_at: { display_type: 'timestamp' } } }
        ]
      }
    },
    record_permissions: { 'system-admin': ['create', 'read', 'update', 'delete'] },
    functionality: null
  }

  const personTypeSchema = {
    fields: {
      full_name: { data_type: 'text', label: 'Full Name', required: true, system: true, validation: null },
      email: { data_type: 'email', label: 'Email', required: true, system: true, validation: null },
      status: { data_type: 'text', label: 'Status', required: true, system: true, validation: null },
      is_active: { data_type: 'boolean', label: 'Active', required: true, system: true, validation: null },
      created_at: { data_type: 'datetime', label: 'Created', required: false, system: true, readonly: true, validation: null }
    },
    views: {
      default_list: { type: 'list', display: 'table', label: 'People',
        fields: { full_name: { sortable: true, display_type: 'text' }, email: { sortable: true, display_type: 'text' }, status: { sortable: true, display_type: 'badge' } },
        default_sort: { field: 'created_at', direction: 'desc' }
      },
      default_detail: { type: 'detail', label: 'Person Detail',
        sections: [
          { title: 'Identity', fields: { full_name: { display_type: 'input' }, email: { display_type: 'input' }, status: { display_type: 'input' }, is_active: { display_type: 'checkbox' } } },
          { title: 'System', fields: { created_at: { display_type: 'timestamp' } } }
        ]
      }
    },
    record_permissions: { 'system-admin': ['create', 'read', 'update', 'delete'] },
    functionality: null
  }

  const itemTypeSchema = {
    fields: {
      title: { data_type: 'text', label: 'Title', required: true, system: true, validation: null },
      description: { data_type: 'textarea', label: 'Description', required: false, system: true, validation: null },
      status: { data_type: 'text', label: 'Status', required: true, system: true, validation: null },
      is_active: { data_type: 'boolean', label: 'Active', required: true, system: true, validation: null },
      created_at: { data_type: 'datetime', label: 'Created', required: false, system: true, readonly: true, validation: null }
    },
    views: {
      default_list: { type: 'list', display: 'table', label: 'Items',
        fields: { title: { sortable: true, display_type: 'text' }, status: { sortable: true, display_type: 'badge' }, is_active: { sortable: true, display_type: 'badge' } },
        default_sort: { field: 'created_at', direction: 'desc' }
      },
      default_detail: { type: 'detail', label: 'Item Detail',
        sections: [
          { title: 'Core', fields: { title: { display_type: 'input' }, description: { display_type: 'textarea' }, status: { display_type: 'input' }, is_active: { display_type: 'checkbox' } } },
          { title: 'System', fields: { created_at: { display_type: 'timestamp' } } }
        ]
      }
    },
    record_permissions: { 'system-admin': ['create', 'read', 'update', 'delete'] },
    functionality: null
  }

  await upsertType('account', 'test-account-type', 'Test Account Type', accountTypeSchema)
  await upsertType('person',  'test-person-type',  'Test Person Type',  personTypeSchema)
  await upsertType('item',    'test-item-type',     'Test Item Type',    itemTypeSchema)

  console.log('  → people')
  await upsertPerson('test-admin',  'Test Admin User',  'test-admin@spine.test')
  await upsertPerson('test-member', 'Test Member User', 'test-member@spine.test')
  await upsertPerson('test-viewer', 'Test Viewer User', 'test-viewer@spine.test')

  console.log('  → items')
  await upsertItem('test-item-active',   'Test Active Item',   true)
  await upsertItem('test-item-inactive', 'Test Inactive Item', false)

  console.log('  → pipeline')
  const { error: pipelineErr } = await db.from('pipelines').upsert(
    {
      slug: 'test-pipeline-canary',
      name: 'Test Pipeline Canary',
      stages: [],
      account_id: ACCOUNT_ID,
      is_active: true
    },
    { onConflict: 'slug' }
  )
  if (pipelineErr) console.warn('  [warn] pipeline:', pipelineErr.message)

  console.log('✅ Seed complete.')
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
