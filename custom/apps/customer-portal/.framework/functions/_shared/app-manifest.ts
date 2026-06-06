/**
 * @module app-manifest
 * @audience core-contributor
 * @layer shared-util
 * @stability evolving
 *
 * Utility for loading and merging app manifests with database records.
 * Enables file-first app configuration with database tracking installations.
 *
 * **Pattern:**
 * 1. Manifest files in custom/apps/{slug}/manifest.json are source of truth
 * 2. Database tracks which tenant has which app installed/enabled
 * 3. This utility merges both sources for the API response
 *
 * @seeAlso apps.ts (uses this for manifest-driven responses)
 * @seeAlso 015_simplify_apps_table.sql (database structure)
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

export interface AppManifest {
  name: string
  slug: string
  description?: string
  version?: string
  required_roles: string[]  // Migrated from min_role (string) to array
  routes: string[]
  nav_items: NavItem[]
  features?: string[]
  dependencies?: string[]
  entry_point: string
  is_public?: boolean
  auth_required?: boolean
}

export interface NavItem {
  title: string
  path: string
  icon?: string
  order?: number
  children?: NavItem[]
}

// Cache for manifest content (development mode - no caching in production)
const manifestCache = new Map<string, AppManifest>()

/**
 * Loads a manifest.json file from the filesystem.
 * 
 * @param manifestPath - Relative path to manifest (e.g., 'custom/apps/cortex/manifest.json')
 * @returns Parsed manifest or null if not found
 */
export function loadManifest(manifestPath: string): AppManifest | null {
  // Check cache first (dev only)
  if (manifestCache.has(manifestPath)) {
    return manifestCache.get(manifestPath)!
  }

  try {
    // Resolve from project root (functions are at .assembled/netlify/functions/)
    const projectRoot = resolve(__dirname, '../../../..')
    const fullPath = resolve(projectRoot, manifestPath)
    
    const content = readFileSync(fullPath, 'utf-8')
    const manifest: AppManifest = JSON.parse(content)
    
    // Validate required fields
    if (!manifest.slug || !manifest.name) {
      console.error(`[app-manifest] Invalid manifest at ${manifestPath}: missing slug or name`)
      return null
    }
    
    // Ensure required_roles is array (backward compat)
    if (!manifest.required_roles) {
      manifest.required_roles = []
    }
    
    // Cache for development (dev server restarts clear cache)
    manifestCache.set(manifestPath, manifest)
    
    return manifest
  } catch (err) {
    console.error(`[app-manifest] Failed to load ${manifestPath}:`, err)
    return null
  }
}

/**
 * Clears the manifest cache. Useful for testing.
 */
export function clearManifestCache(): void {
  manifestCache.clear()
}

/**
 * Merges database app record with manifest data.
 * Manifest takes precedence for metadata fields.
 * 
 * @param dbRecord - App record from app_definitions table
 * @returns Merged app data for API response
 */
export function mergeWithManifest(dbRecord: any): any {
  if (!dbRecord) return null
  
  // If no manifest path, return DB record as-is (legacy mode)
  if (!dbRecord.manifest_path || dbRecord.config_source !== 'manifest') {
    // Convert legacy min_role to required_roles for frontend compatibility
    return {
      ...dbRecord,
      required_roles: dbRecord.min_role ? [dbRecord.min_role] : [],
      _source: 'database'
    }
  }
  
  // Load manifest and merge
  const manifest = loadManifest(dbRecord.manifest_path)
  if (!manifest) {
    console.warn(`[app-manifest] Could not load manifest for ${dbRecord.slug}, falling back to DB`)
    return {
      ...dbRecord,
      required_roles: dbRecord.min_role ? [dbRecord.min_role] : [],
      _source: 'database (manifest missing)'
    }
  }
  
  // Merge: Manifest metadata + DB state fields
  return {
    id: dbRecord.id,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description || dbRecord.description,
    
    // Role-based access (new array format)
    required_roles: manifest.required_roles,
    min_role: manifest.required_roles[0] || null, // Backward compat
    
    // Navigation and routing
    routes: manifest.routes,
    nav_items: manifest.nav_items,
    
    // Features and metadata
    features: manifest.features || [],
    dependencies: manifest.dependencies || [],
    version: manifest.version,
    
    // Database state fields
    is_active: dbRecord.is_active,
    is_system: dbRecord.is_system,
    is_public: manifest.is_public ?? false,
    auth_required: manifest.auth_required ?? true,
    
    // Installation tracking
    account_id: dbRecord.account_id,
    pack_id: dbRecord.pack_id,
    ownership: dbRecord.ownership,
    
    // Internal
    _source: 'manifest',
    _manifest_path: dbRecord.manifest_path
  }
}

/**
 * Lists all available manifests from filesystem.
 * Used for initial discovery before database tracking.
 * 
 * @returns Array of discovered app slugs and their paths
 */
export function discoverManifests(): Array<{slug: string, path: string}> {
  // In production, this would scan the filesystem
  // For now, return known manifests based on the plan
  return [
    { slug: 'cortex', path: 'custom/apps/cortex/manifest.json' },
    { slug: 'customer-portal', path: 'custom/apps/customer-portal/manifest.json' }
  ]
}
