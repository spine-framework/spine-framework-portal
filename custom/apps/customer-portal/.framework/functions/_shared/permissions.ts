/**
 * @module permissions
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Single source of truth for all authorization in Spine. Exports one singleton —
 * `PermissionEngine` — that routes every access check to one of three permission
 * surfaces based on the table being accessed:
 *
 *   First surface  — runtime data (items, accounts, people, threads, messages…)
 *                    Schema-driven: permissions are encoded in `design_schema.record_permissions`
 *                    and `design_schema.fields[x].permissions` stamped on the record at creation.
 *
 *   Second surface — config objects (apps, pipelines, triggers, roles, types…)
 *                    Role-driven: system_admin full access, machine read, others denied.
 *
 *   Third surface  — system metadata (logs, pipeline_executions, link_types…)
 *                    Ownership-driven: users read their own, system_admin sees all.
 *
 * INVARIANT: system_admin bypasses ALL surface checks. No other bypass exists.
 * INVARIANT: missing or empty `design_schema` on a first-surface record is an
 *   explicit deny — not a free pass. RLS controls row access; design_schema
 *   controls what the principal can do with the row.
 * INVARIANT: never import or instantiate `_PermissionEngineInternal` directly.
 *   Always import the `PermissionEngine` singleton or the named legacy exports.
 *
 * @seeAlso db.ts (adminDb used for schema and person lookups)
 * @seeAlso principal.ts (Principal interface, isSystemAdmin, getPrincipalDb)
 * @seeAlso middleware.ts (CoreContext shape, ctx.db, ctx.principal)
 * @seeAlso schema-utils.ts (formatFieldData, sanitizeFieldData called during sanitization)
 * @seeAlso index.ts (stable export surface for custom code)
 */

import { adminDb } from './db'
import { Principal } from './principal'
import { CoreContext } from './middleware'

// ─── TYPES ────────────────────────────────────────────────────────────────────

/**
 * Result of a permission resolution for a principal + record + action combination.
 *
 * Returned by `resolveFirstSurfacePermissions`. Captures both record-level CRUD
 * flags and per-field read/write flags derived from `design_schema`.
 *
 * All flags default to `false` on any error or missing schema — never assume
 * a missing flag means "allowed".
 *
 * @inputSpec none — this is a pure output type
 * @outputSpec canCreate: boolean — principal may create records of this type
 * @outputSpec canRead: boolean — principal may read this record
 * @outputSpec canUpdate: boolean — principal may update this record
 * @outputSpec canDelete: boolean — principal may delete this record
 * @outputSpec fieldPermissions: Record<fieldName, {read, write}> — per-field flags
 *   derived from design_schema.fields[x].permissions merged across all roles
 * @calledBy resolveFirstSurfacePermissions (producer), sanitizeFirstSurfaceRecordData,
 *   validateFirstSurfaceUpdatePermissions, canAccessFirstSurfaceRecord (consumers)
 */
export interface PermissionResult {
  canCreate: boolean
  canRead: boolean
  canUpdate: boolean
  canDelete: boolean
  fieldPermissions: Record<string, { read: boolean; write: boolean }>
}

type RequestContext = CoreContext

// ─── ENGINE CLASS ────────────────────────────────────────────────────────────

/**
 * The single permission engine for all authorization in Spine.
 *
 * Instantiated once as a module-level singleton (`PermissionEngine`). Routes
 * every check through one of three surfaces based on table classification.
 * All public methods are async and never throw — on any internal error they
 * fall back to a deny result to avoid accidental permission grants.
 *
 * Do not instantiate directly. Import `PermissionEngine` or use the named
 * legacy exports (`sanitizeRecordData`, `validateUpdatePermissions`, etc.).
 *
 * @audience both
 * @stability stable
 * @calledBy All 19 API handlers via sanitizeRecordData / validateUpdatePermissions
 * @calledBy admin-data.ts (primary consumer for runtime data)
 * @testUnit tests/unit/permissions.test.ts
 * @testIntegration tests/integration/isolation.test.ts, admin-data-accounts.test.ts
 */
class _PermissionEngineInternal {
  private static instance: _PermissionEngineInternal

  // ─── SURFACE CLASSIFICATION ───────────────────────────────────────────────

  // Surface classification tables
  private readonly SECOND_SURFACE_TABLES = new Set([
    'apps', 'app', 'pipelines', 'triggers', 'ai_agents', 'embeddings', 
    'timers', 'integrations', 'roles', 'types', 'prompt_configs'
  ])

  private readonly THIRD_SURFACE_TABLES = new Set([
    'logs', 'pipeline_executions', 'trigger_executions',
    'link_types', 'links'
  ])

  private constructor() {}

  /**
   * Classifies a table name into one of Spine's three permission surfaces.
   *
   * Surface membership is determined by static set membership — if a table is
   * not in SECOND_SURFACE_TABLES or THIRD_SURFACE_TABLES, it defaults to first.
   * This is intentionally conservative: unknown tables get the most restrictive
   * surface (first), which requires a valid design_schema to grant any access.
   *
   * @param tableName - Table name string (e.g. 'items', 'pipelines', 'logs')
   * @returns 'first' | 'second' | 'third' — surface classification
   * @throws never
   * @inputSpec tableName: string — any string; unknown names → 'first'
   * @outputSpec 'first' | 'second' | 'third'
   * @sideEffects none
   * @calledBy canAccessRecord, sanitizeRecordData, validateUpdatePermissions
   */
  private detectSurface(tableName: string): 'first' | 'second' | 'third' {
    if (this.SECOND_SURFACE_TABLES.has(tableName)) {
      return 'second'
    }
    if (this.THIRD_SURFACE_TABLES.has(tableName)) {
      return 'third'
    }
    return 'first'
  }

  /**
   * Extracts a table/type name from a record to use for surface classification.
   *
   * Tries multiple fields in priority order: `record.table_name` (explicitly
   * set by some handlers), `record.type`, `record.item_type`, then the
   * `typeSlug` param. Falls back to `'unknown'` which routes to first surface.
   *
   * @param record - The record object being classified
   * @param typeSlug - Optional caller-provided type slug (used as last resort)
   * @returns string — table name used to classify the permission surface
   * @throws never
   * @inputSpec record: object — any record; missing fields are safely ignored
   * @inputSpec typeSlug: string | undefined — optional fallback
   * @outputSpec string — one of the known table names, or 'unknown'
   * @sideEffects none
   * @calledBy canAccessRecord, sanitizeRecordData, validateUpdatePermissions
   */
  private extractTableName(record: any, typeSlug?: string): string {
    // Try to get table name from record context
    if (record?.table_name) {
      return record.table_name
    }
    
    // Try to get from type field
    if (record?.type) {
      return record.type
    }
    
    // Try to get from item_type field
    if (record?.item_type) {
      return record.item_type
    }
    
    // Use provided typeSlug
    if (typeSlug) {
      return typeSlug
    }
    
    // Default to unknown (will be treated as first surface)
    return 'unknown'
  }

  /**
   * Returns the singleton instance. Called once at module load time to
   * initialise `PermissionEngine`. Not for direct use outside this file.
   *
   * @returns _PermissionEngineInternal — the single shared instance
   * @throws never
   * @sideEffects creates instance on first call (subsequent calls return cached)
   * @calledBy module initialisation (bottom of this file)
   */
  static getInstance(): _PermissionEngineInternal {
    if (!_PermissionEngineInternal.instance) {
      _PermissionEngineInternal.instance = new _PermissionEngineInternal()
    }
    return _PermissionEngineInternal.instance
  }

  // ─── FIRST SURFACE — RUNTIME DATA ──────────────────────────────────────────

  /**
   * Resolves record-level and field-level permissions for a human principal
   * acting on a first-surface (runtime data) record.
   *
   * Resolution steps:
   *   1. Load `design_schema` from the type record if not pre-stamped on the record
   *   2. Look up the person's role via `people.role_id` FK (single DB query)
   *   3. Evaluate `design_schema.record_permissions[role]` array for CRUD flags
   *   4. Evaluate `design_schema.fields[x].permissions[role]` for field flags
   *   5. Apply `'all'` wildcard role key if present (grants to all authenticated)
   *   6. For fields with no explicit permission, inherit from record-level flags
   *
   * Returns all-deny `PermissionResult` on any error — never throws.
   *
   * @param personId - UUID of the person making the request (from principal.id)
   * @param accountId - UUID of the account context for the operation
   * @param typeSlug - Slug of the type to look up design_schema if not pre-stamped
   * @param _action - CRUD action (currently used for context; merge logic is role-based)
   * @param designSchema - Pre-loaded design_schema object (skips DB lookup if provided)
   *
   * @inputSpec personId: string — valid UUID, must exist in people table with is_active=true
   * @inputSpec accountId: string — valid UUID of accessible account
   * @inputSpec typeSlug: string — slug of a type in the types table with is_active=true
   * @inputSpec designSchema: object | undefined — if provided, must have record_permissions
   * @outputSpec PermissionResult — all flags false on error/missing schema
   * @throws never — catches all errors, returns defaultResult
   * @sideEffects DB read: types table (if schema not pre-stamped), people table (role lookup)
   * @calledBy canAccessFirstSurfaceRecord, sanitizeFirstSurfaceRecordData,
   *   validateFirstSurfaceUpdatePermissions
   * @calls adminDb.from('types'), adminDb.from('people')
   * @testUnit tests/unit/permissions.test.ts — 'resolveFirstSurfacePermissions' describe block
   *
   * @example Import usage (v2-custom/)
   * ```ts
   * import { PermissionEngine } from '../_shared/index'
   * const perms = await PermissionEngine.resolveFirstSurfacePermissions(
   *   ctx.principal.id, ctx.accountId, 'ticket', 'read'
   * )
   * if (!perms.canRead) return { error: 'Forbidden' }
   * ```
   */
  async resolveFirstSurfacePermissions(
    personId: string,
    accountId: string,
    typeSlug: string,
    _action: 'create' | 'read' | 'update' | 'delete',
    designSchema?: any
  ): Promise<PermissionResult> {
    // Default deny result
    const defaultResult: PermissionResult = {
      canCreate: false,
      canRead: false,
      canUpdate: false,
      canDelete: false,
      fieldPermissions: {}
    }

    try {
      // 1. Load type design schema if not provided (pre-stamped on record is preferred)
      let schema = designSchema
      if (!schema || !schema.record_permissions) {
        // Attempt type lookup by slug as fallback
        const { data: typeRecord } = await adminDb
          .from('types')
          .select('design_schema')
          .eq('slug', typeSlug)
          .eq('is_active', true)
          .single()

        // No schema = no permissions. RLS controls row access;
        // design_schema controls what the principal can do with the record.
        // A missing or empty schema is an explicit deny — not a free pass.
        if (!typeRecord?.design_schema?.record_permissions) {
          return defaultResult
        }

        schema = typeRecord.design_schema
      }

      // 2. Get user's role via people.role_id FK
      const { data: person } = await adminDb
        .from('people')
        .select('role:role_id(slug)')
        .eq('id', personId)
        .eq('is_active', true)
        .single()

      const roleSlug = (person?.role as any)?.slug || Array.isArray(person?.role) && (person.role as any)[0]?.slug
      if (!roleSlug) {
        return defaultResult
      }

      const userRoles = [roleSlug]

      // 3. Evaluate record permissions for each role
      const recordPermissions = schema.record_permissions || {}
      const fieldDefinitions = schema.fields || {}

      let mergedResult: PermissionResult = {
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
        fieldPermissions: {}
      }

      // 4. Merge permissions across all roles (union of actions)
      // 'all' is a special wildcard role key: grants access to every authenticated principal
      // that passed RLS, regardless of their named role. Always evaluated.
      const rolesToEvaluate = recordPermissions['all'] ? [...userRoles, 'all'] : userRoles
      for (const role of rolesToEvaluate) {
        const rolePerms = recordPermissions[role]
        if (!rolePerms || !Array.isArray(rolePerms)) continue

        // Merge record permissions using array format: ["create", "read", "update", "delete"]
        mergedResult.canCreate = mergedResult.canCreate || rolePerms.includes('create')
        mergedResult.canRead = mergedResult.canRead || rolePerms.includes('read')
        mergedResult.canUpdate = mergedResult.canUpdate || rolePerms.includes('update')
        mergedResult.canDelete = mergedResult.canDelete || rolePerms.includes('delete')

        // 5. Merge field permissions for this role
        for (const [fieldName, fieldDef] of Object.entries(fieldDefinitions)) {
          const fieldPerms = (fieldDef as any).permissions?.[role]
          if (!fieldPerms || !Array.isArray(fieldPerms)) continue

          if (!mergedResult.fieldPermissions[fieldName]) {
            mergedResult.fieldPermissions[fieldName] = { read: false, write: false }
          }

          // Merge field permissions using array format: ["read", "write"]
          mergedResult.fieldPermissions[fieldName].read = 
            mergedResult.fieldPermissions[fieldName].read || fieldPerms.includes('read')
          mergedResult.fieldPermissions[fieldName].write = 
            mergedResult.fieldPermissions[fieldName].write || fieldPerms.includes('write')
        }
      }

      // 6. Apply record-level access to fields without explicit permissions
      for (const [fieldName, _fieldDef] of Object.entries(fieldDefinitions)) {
        if (!mergedResult.fieldPermissions[fieldName]) {
          mergedResult.fieldPermissions[fieldName] = {
            read: mergedResult.canRead,
            write: mergedResult.canUpdate
          }
        }
      }

      return mergedResult

    } catch (error) {
      console.error('Error resolving permissions:', error)
      return defaultResult
    }
  }

  // ─── SECOND SURFACE — CONFIG OBJECTS ────────────────────────────────────────

  /**
   * Checks whether the principal in `ctx` may perform `action` on a second-surface
   * config object (apps, pipelines, triggers, roles, types, etc.).
   *
   * Rules:
   *   - system_admin: full access to all actions
   *   - machine principal: read-only
   *   - all others: denied
   *
   * @param ctx - Request context containing principal
   * @param action - CRUD action being attempted
   * @returns boolean — true if access is allowed
   * @throws never
   * @inputSpec ctx.principal: Principal — must be resolved (not anonymous)
   * @inputSpec action: 'create' | 'read' | 'update' | 'delete'
   * @outputSpec boolean — true = allowed, false = denied
   * @sideEffects none
   * @calledBy canAccessRecord (surface='second'), validateConfigObjectPermissions
   */
  private canAccessConfigObject(ctx: RequestContext, action: 'create' | 'read' | 'update' | 'delete'): boolean {
    // System admin has full access
    if (this.isSystemAdmin(ctx)) {
      return true
    }
    
    // System role can only read
    if (ctx.principal?.type === 'machine' && action === 'read') {
      return true
    }
    
    // All other access denied
    return false
  }

  /**
   * Strips fields from a second-surface config record based on the principal's access.
   *
   * system_admin and machine principals receive the full record. All others
   * receive only `{ id, created_at, updated_at }`. This is intentionally strict
   * — config objects contain sensitive pipeline logic, schema definitions, and
   * integration credentials that must not leak to end users.
   *
   * @param ctx - Request context
   * @param record - The config record to sanitize
   * @returns Sanitized record — full record or minimal stub
   * @throws never
   * @inputSpec ctx.principal: Principal — resolved principal
   * @inputSpec record: object — must have id, created_at, updated_at at minimum
   * @outputSpec object — full record for admin/machine, { id, created_at, updated_at } for others
   * @sideEffects none
   * @calledBy sanitizeRecordData (surface='second')
   */
  private sanitizeConfigObject(ctx: RequestContext, record: any): any {
    // Debug logging
    console.log('sanitizeConfigObject called with record:', {
      id: record.id,
      slug: record.slug,
      route_prefix: record.route_prefix,
      renderer: record.renderer,
      is_system: record.is_system,
      min_role: record.min_role
    })
    
    // System admin sees everything
    if (this.isSystemAdmin(ctx)) {
      return record
    }
    
    // System role sees everything if they have read access
    if (ctx.principal?.type === 'machine') {
      return record
    }
    
    // For apps table, include essential routing fields needed by React app
    // Check multiple app-specific fields to properly identify apps records
    if (record.route_prefix !== undefined || record.renderer !== undefined || 
        (record.slug && (record.is_system !== undefined || record.min_role !== undefined))) {
      console.log('Detected apps record, returning full fields')
      return {
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: record.description,
        route_prefix: record.route_prefix,
        min_role: record.min_role,
        is_active: record.is_active,
        is_system: record.is_system,
        renderer: record.renderer,
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    }
    
    console.log('Not detected as apps record, returning minimal data')
    // Others see minimal data for other config objects
    return {
      id: record.id,
      created_at: record.created_at,
      updated_at: record.updated_at
    }
  }

  /**
   * Validates whether the principal may perform `action` on a second-surface record.
   * Thin wrapper around `canAccessConfigObject` that returns a typed result object
   * suitable for returning directly from handler validation checks.
   *
   * @param ctx - Request context
   * @param action - CRUD action being validated
   * @returns { valid: boolean, error?: string }
   * @throws never
   * @inputSpec ctx.principal: Principal — resolved principal
   * @inputSpec action: 'create' | 'read' | 'update' | 'delete'
   * @outputSpec valid: boolean — true if action is permitted
   * @outputSpec error: string | undefined — human-readable denial reason if !valid
   * @sideEffects none
   * @calledBy validateUpdatePermissions (surface='second')
   */
  private validateConfigObjectPermissions(ctx: RequestContext, action: 'create' | 'read' | 'update' | 'delete'): { valid: boolean; error?: string } {
    if (this.canAccessConfigObject(ctx, action)) {
      return { valid: true }
    }
    
    return { valid: false, error: 'Insufficient permissions for this operation' }
  }

  // ─── THIRD SURFACE — SYSTEM METADATA ────────────────────────────────────────

  /**
   * Checks whether the principal may access a third-surface system metadata record
   * (logs, pipeline_executions, trigger_executions, link_types, links).
   *
   * Rules:
   *   - system_admin: full access
   *   - machine principal: full access
   *   - human principal (read only):
   *       - owns the record (created_by === principal.id), OR
   *       - record is scoped to the principal's account (account_id === ctx.accountId), OR
   *       - record references the principal directly (person_id === principal.id)
   *   - human principal (create/update/delete): always denied
   *
   * @param ctx - Request context
   * @param record - The system metadata record being accessed
   * @param action - CRUD action being attempted
   * @returns boolean — true if access is allowed
   * @throws never
   * @inputSpec ctx.principal: Principal — resolved principal
   * @inputSpec record: object — must have at least one of: created_by, account_id, person_id
   * @inputSpec action: 'create' | 'read' | 'update' | 'delete'
   * @outputSpec boolean
   * @sideEffects none
   * @calledBy canAccessRecord (surface='third'), sanitizeSystemMetadata,
   *   validateSystemMetadataPermissions
   */
  private canAccessSystemMetadata(ctx: RequestContext, record: any, action: 'create' | 'read' | 'update' | 'delete'): boolean {
    // System admin has full access
    if (this.isSystemAdmin(ctx)) {
      return true
    }
    
    // System context has full access
    if (ctx.principal?.type === 'machine') {
      return true
    }
    
    // Users can only read their own data
    if (action === 'read') {
      // Check if user owns this record or is related to it
      if (record.created_by === ctx.principal?.id) {
        return true
      }
      
      // Check account ownership
      if (record.account_id && record.account_id === ctx.accountId) {
        return true
      }
      
      // Check person-specific records
      if (record.person_id && record.person_id === ctx.principal?.id) {
        return true
      }
    }
    
    // Users cannot create/update/delete system metadata
    return false
  }

  /**
   * Strips fields from a third-surface system metadata record based on ownership.
   *
   * system_admin and machine principals receive the full record. Human principals
   * who pass `canAccessSystemMetadata` receive the full record. All others
   * receive only `{ id, created_at, updated_at }`.
   *
   * @param ctx - Request context
   * @param record - The system metadata record to sanitize
   * @returns Sanitized record
   * @throws never
   * @inputSpec record: object — must have id, created_at, updated_at
   * @outputSpec object — full record for system_admin/machine/owner, minimal stub for others
   * @sideEffects none
   * @calledBy sanitizeRecordData (surface='third')
   */
  private sanitizeSystemMetadata(ctx: RequestContext, record: any): any {
    // System admin and system role see everything
    if (this.isSystemAdmin(ctx) || ctx.principal?.type === 'machine') {
      return record
    }
    
    // Users see only their own data
    if (this.canAccessSystemMetadata(ctx, record, 'read')) {
      return record
    }
    
    // Others see minimal data
    return {
      id: record.id,
      created_at: record.created_at,
      updated_at: record.updated_at
    }
  }

  /**
   * Validates whether the principal may perform `action` on a third-surface record.
   * Delegates to `canAccessSystemMetadata` and wraps the result.
   *
   * @param ctx - Request context
   * @param record - The system metadata record
   * @param action - CRUD action being validated
   * @returns { valid: boolean, error?: string }
   * @throws never
   * @inputSpec record: object — the record being written/read
   * @outputSpec valid: boolean — true if action is permitted
   * @outputSpec error: string | undefined — denial reason if !valid
   * @sideEffects none
   * @calledBy validateUpdatePermissions (surface='third')
   */
  private validateSystemMetadataPermissions(ctx: RequestContext, record: any, action: 'create' | 'read' | 'update' | 'delete'): { valid: boolean; error?: string } {
    if (this.canAccessSystemMetadata(ctx, record, action)) {
      return { valid: true }
    }
    
    return { valid: false, error: 'Insufficient permissions for this operation' }
  }

  // ─── SHARED HELPERS ──────────────────────────────────────────────────────────

  /**
   * Returns true if the principal in `ctx` holds the `system_admin` role.
   *
   * This is the canonical system_admin check used by all three surfaces and
   * the unified principal methods. It is the ONLY mechanism for bypassing
   * surface-level permission checks — there is no other bypass in the engine.
   *
   * @param ctx - Request context with resolved principal
   * @returns boolean — true if principal.roles includes 'system_admin'
   * @throws never
   * @inputSpec ctx.principal: Principal — principal.roles: string[]
   * @outputSpec boolean — false if principal is null, anonymous, or has no roles
   * @sideEffects none
   * @calledBy canAccessRecord, sanitizeRecordData, validateUpdatePermissions,
   *   canAccessConfigObject, sanitizeConfigObject, sanitizeSystemMetadata,
   *   canPrincipalAccessRecord
   * @testUnit tests/unit/permissions.test.ts — 'isSystemAdmin' describe block
   */
  isSystemAdmin(ctx: RequestContext): boolean {
    return ctx.principal?.roles?.includes('system_admin') || false
  }

  // ─── PUBLIC SURFACE ROUTER METHODS ──────────────────────────────────────────

  /**
   * Checks whether the principal in `ctx` may perform `action` on `record`.
   *
   * Routes to the correct surface handler based on `record`'s table name:
   *   - second surface tables → `canAccessConfigObject`
   *   - third surface tables → `canAccessSystemMetadata`
   *   - everything else (first surface) → `canAccessFirstSurfaceRecord`
   *
   * system_admin always returns true before surface routing.
   *
   * @param ctx - Request context with resolved principal
   * @param record - The record being accessed (used for surface detection only)
   * @param action - CRUD action being attempted
   * @returns Promise<boolean> — true if access is allowed
   * @throws never — all surface handlers catch errors and return false
   * @inputSpec ctx.principal: Principal — must be resolved
   * @inputSpec record: object — used for table_name/type/item_type extraction
   * @inputSpec action: 'create' | 'read' | 'update' | 'delete'
   * @outputSpec boolean — false for anonymous principals, missing records, unknown types
   * @sideEffects DB read (first surface only): types and people tables
   * @calledBy API handlers where explicit access gate is needed (rare — most use sanitize)
   * @testUnit tests/unit/permissions.test.ts — 'canAccessRecord' describe block
   */
  async canAccessRecord(
    ctx: RequestContext,
    record: any,
    action: 'create' | 'read' | 'update' | 'delete'
  ): Promise<boolean> {
    // System admin bypasses all checks
    if (this.isSystemAdmin(ctx)) {
      return true
    }

    // Extract table name to determine surface
    const tableName = this.extractTableName(record)
    const surface = this.detectSurface(tableName)

    // Route to appropriate surface logic
    switch (surface) {
      case 'second':
        return this.canAccessConfigObject(ctx, action)
      
      case 'third':
        return this.canAccessSystemMetadata(ctx, record, action)
      
      case 'first':
      default:
        return this.canAccessFirstSurfaceRecord(ctx, record, action)
    }
  }

  /**
   * Access check for first-surface (runtime data) records.
   *
   * Delegates to `resolveFirstSurfacePermissions` to evaluate the design_schema
   * permission model. For 'own' access level, additionally checks record ownership
   * via `created_by === principal.id`.
   *
   * Returns false for anonymous principals and any principal without a valid accountId.
   *
   * @param ctx - Request context
   * @param record - The first-surface record being accessed
   * @param action - CRUD action
   * @returns Promise<boolean>
   * @throws never
   * @inputSpec ctx.principal: not anonymous, ctx.accountId: non-empty string
   * @inputSpec record: must have account_id or item_type/type for schema resolution
   * @outputSpec boolean — false for anonymous, missing schema, insufficient permissions
   * @sideEffects DB read: types and people tables (via resolveFirstSurfacePermissions)
   * @calledBy canAccessRecord (surface='first'), canPrincipalAccessRecord (human branch)
   */
  private async canAccessFirstSurfaceRecord(
    ctx: RequestContext,
    record: any,
    action: 'create' | 'read' | 'update' | 'delete'
  ): Promise<boolean> {
    if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
      return false
    }

    // For create operations, check if user can create in this account
    if (action === 'create') {
      const perms = await this.resolveFirstSurfacePermissions(
        ctx.principal.id,
        ctx.accountId,
        record.item_type || record.type || 'unknown',
        'create'
      )
      return perms.canCreate
    }

    // For read/update/delete, check record ownership and permissions
    const perms = await this.resolveFirstSurfacePermissions(
      ctx.principal.id,
      record.account_id || ctx.accountId,
      record.item_type || record.type || 'unknown',
      action
    )

    // Check record-level permission
    const canPerformAction = 
      (action === 'read' && perms.canRead) ||
      (action === 'update' && perms.canUpdate) ||
      (action === 'delete' && perms.canDelete)

    if (!canPerformAction) {
      return false
    }

    // For 'own' access level, check if user owns the record
    const userRoles = ctx.principal?.roles || []
    const hasOwnAccess = userRoles.some(role => {
      const rolePerms = (record.type_schema?.record_permissions || {})[role]
      return rolePerms?.read === 'own' || rolePerms?.update === 'own'
    })

    if (hasOwnAccess && record.created_by !== ctx.principal?.id) {
      return false
    }

    return true
  }

  /**
   * Strips and formats a record's fields based on the principal's permissions.
   *
   * This is the primary output filter called by every API handler before returning
   * data to the client. Routes to the correct surface handler, which applies
   * field-level filtering from the record's stamped `design_schema`.
   *
   * system_admin receives the full record unchanged.
   *
   * For first-surface records with missing `design_schema` or no `record_permissions`,
   * returns `{ id }` only — explicit deny, not a pass-through.
   *
   * @param ctx - Request context with resolved principal
   * @param record - The record to sanitize (should be the raw DB row)
   * @param typeSlug - Type slug used to classify the surface and look up schema
   *   if not already stamped on the record. Optional for second/third surfaces.
   * @returns Promise<object> — sanitized record safe to return to the client
   * @throws never
   * @inputSpec ctx.principal: Principal — resolved, may be anonymous
   * @inputSpec record: object — raw DB row, must have id at minimum
   * @inputSpec typeSlug: string | undefined — slug of the type (e.g. 'item', 'account')
   * @outputSpec object — filtered record; field set depends on principal's role permissions
   * @outputSpec system_admin: full record unchanged
   * @outputSpec unauthenticated: { id, created_at, updated_at } only
   * @outputSpec first surface, no schema: { id } only
   * @sideEffects DB read (first surface): types and people tables via resolveFirstSurface
   * @calledBy All 19 API handlers — this is the most-called method in the engine
   * @calls sanitizeFirstSurfaceRecordData | sanitizeConfigObject | sanitizeSystemMetadata
   * @testUnit tests/unit/permissions.test.ts — 'sanitizeRecordData' describe block
   * @testIntegration tests/integration/admin-data-accounts.test.ts
   *
   * @example API handler usage
   * ```ts
   * const sanitized = await sanitizeRecordData(ctx, record, 'item')
   * return { data: sanitized }
   * ```
   *
   * @example Import usage (v2-custom/)
   * ```ts
   * import { sanitizeRecordData } from '../_shared/index'
   * const safe = await sanitizeRecordData(ctx, rawRecord, 'ticket')
   * ```
   */
  async sanitizeRecordData(
    ctx: RequestContext,
    record: any,
    typeSlug?: string
  ): Promise<any> {
    // System admin sees everything
    if (this.isSystemAdmin(ctx)) {
      return record
    }

    // Extract table name to determine surface
    const tableName = this.extractTableName(record, typeSlug)
    const surface = this.detectSurface(tableName)

    // Route to appropriate surface logic
    switch (surface) {
      case 'second':
        return this.sanitizeConfigObject(ctx, record)
      
      case 'third':
        return this.sanitizeSystemMetadata(ctx, record)
      
      case 'first':
      default:
        return this.sanitizeFirstSurfaceRecordData(ctx, record, typeSlug || '')
    }
  }

  /**
   * Field-level filter and formatter for first-surface (runtime data) records.
   *
   * Steps:
   *   1. Return minimal stub for anonymous principals
   *   2. Check `record.design_schema.record_permissions` — deny if missing
   *   3. Resolve permissions via `resolveFirstSurfacePermissions`
   *   4. Return minimal stub if `!perms.canRead`
   *   5. For each field in `record.data`, include only if `fieldPerms.read === true`
   *   6. Apply `formatFieldData` from schema-utils if validation_schema specifies a data_type
   *   7. Strip `record.metadata` (legacy field, migrated to `data`)
   *
   * @param ctx - Request context
   * @param record - First-surface DB row with design_schema and data fields
   * @param typeSlug - Type slug for schema lookup
   * @returns Promise<object> — filtered and formatted record
   * @throws never
   * @inputSpec record.design_schema: object with record_permissions — deny if missing
   * @inputSpec record.data: object — JSONB data fields; only permitted fields returned
   * @outputSpec object — sanitized record matching the principal's field permissions
   * @sideEffects DB read: types and people via resolveFirstSurfacePermissions
   * @calledBy sanitizeRecordData (surface='first')
   * @calls resolveFirstSurfacePermissions, schema-utils.formatFieldData
   */
  private async sanitizeFirstSurfaceRecordData(
    ctx: RequestContext,
    record: any,
    typeSlug: string
  ): Promise<any> {
    if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
      // Return minimal data for unauthenticated users
      return {
        id: record.id,
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    }

    // Special case for apps table - return essential routing fields
    if (typeSlug === 'app') {
      console.log('Processing app record, returning routing fields')
      return {
        id: record.id,
        slug: record.slug,
        name: record.name,
        description: record.description,
        route_prefix: record.route_prefix,
        min_role: record.min_role,
        is_active: record.is_active,
        is_system: record.is_system,
        renderer: record.renderer,
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    }

    // Use record's design_schema stamped at creation time.
    // No schema or missing record_permissions = deny. RLS controls row access;
    // design_schema controls what the principal can do. No permissions granted = none given.
    const designSchema = record.design_schema
    if (!designSchema || !designSchema.record_permissions) {
      return { id: record.id }
    }

    const perms = await this.resolveFirstSurfacePermissions(
      ctx.principal.id,
      record.account_id || ctx.accountId,
      typeSlug,
      'read',
      designSchema
    )

    if (!perms.canRead) {
      // Return minimal data if no read access
      return {
        id: record.id,
        created_at: record.created_at,
        updated_at: record.updated_at
      }
    }

    // Clone record to avoid mutation
    const sanitized = { ...record }

    // Filter and format data fields based on permissions
    if (sanitized.data && typeof sanitized.data === 'object') {
      const filteredData: any = {}
      
      for (const [fieldName, fieldValue] of Object.entries(sanitized.data)) {
        const fieldPerms = perms.fieldPermissions[fieldName]
        if (fieldPerms && fieldPerms.read) {
          // Apply data formatting using validation schema
          const validationSchema = record.validation_schema || {}
          const fieldValidation = validationSchema.fields?.[fieldName]
          
          if (fieldValidation) {
            // Import formatFieldData function
            const { formatFieldData } = await import('./schema-utils')
            filteredData[fieldName] = formatFieldData(fieldValue, fieldValidation.data_type, {
              currency_code: fieldValidation.currency_code
            })
          } else {
            filteredData[fieldName] = fieldValue
          }
        }
      }
      
      sanitized.data = filteredData
    }

    // Remove metadata field if it exists (should be migrated to data)
    if (sanitized.metadata) {
      delete sanitized.metadata
    }

    return sanitized
  }

  /**
   * Validates that the principal has write permission for every field in `updateData`,
   * and sanitizes the data using the validation schema before returning it.
   *
   * Routes to the correct surface handler. system_admin bypasses all checks and
   * receives `updateData` unchanged (with `sanitizedData` set to `updateData`).
   *
   * For first-surface records:
   *   - Each field in `updateData.data` must have `fieldPerms.write === true`
   *   - Fields are sanitized via `sanitizeFieldData` from schema-utils
   *   - Returns `{ valid: false, error }` on the first denied or invalid field
   *
   * @param ctx - Request context with resolved principal
   * @param updateData - The payload being written (may contain `data` and/or `metadata`)
   * @param existingRecord - The current DB row (used for schema + account_id resolution)
   * @param typeSlug - Type slug for surface classification and schema lookup
   * @returns Promise<{ valid: boolean, error?: string, sanitizedData?: any }>
   * @throws never
   * @inputSpec ctx.principal: Principal — resolved, non-anonymous required for first surface
   * @inputSpec updateData: object — payload with data: {} and/or metadata: {}
   * @inputSpec existingRecord: object — must have design_schema, account_id
   * @outputSpec valid: boolean — false on first permission or validation failure
   * @outputSpec error: string | undefined — field name + reason when !valid
   * @outputSpec sanitizedData: object | undefined — cleaned payload when valid
   * @sideEffects DB read (first surface): types and people via resolveFirstSurfacePermissions
   * @calledBy admin-data.ts (update handler), and any handler that accepts user writes
   * @calls validateFirstSurfaceUpdatePermissions | validateConfigObjectPermissions |
   *   validateSystemMetadataPermissions
   * @testUnit tests/unit/permissions.test.ts — 'validateUpdatePermissions' describe block
   *
   * @example API handler usage
   * ```ts
   * const { valid, error, sanitizedData } = await validateUpdatePermissions(
   *   ctx, body, existingRecord, 'item'
   * )
   * if (!valid) return { error }
   * await ctx.db.from('items').update(sanitizedData).eq('id', id)
   * ```
   */
  async validateUpdatePermissions(
    ctx: RequestContext,
    updateData: any,
    existingRecord: any,
    typeSlug?: string
  ): Promise<{ valid: boolean; error?: string }> {
    // System admin can update anything — pass data through unsanitized
    if (this.isSystemAdmin(ctx)) {
      return { valid: true, sanitizedData: updateData } as any
    }

    // Extract table name to determine surface
    const tableName = this.extractTableName(existingRecord, typeSlug)
    const surface = this.detectSurface(tableName)

    // Route to appropriate surface logic
    switch (surface) {
      case 'second':
        return this.validateConfigObjectPermissions(ctx, 'update')
      
      case 'third':
        return this.validateSystemMetadataPermissions(ctx, existingRecord, 'update')
      
      case 'first':
      default:
        return this.validateFirstSurfaceUpdatePermissions(ctx, updateData, existingRecord, typeSlug || '')
    }
  }

  /**
   * Field-level write validation and sanitization for first-surface update payloads.
   *
   * Checks every field in `updateData.data` (and legacy `updateData.metadata`) against
   * the principal's write permissions. Sanitizes each permitted field through
   * `sanitizeFieldData` for type coercion and constraint validation. Returns on
   * the first denied or invalid field — does not accumulate errors.
   *
   * @param ctx - Request context
   * @param updateData - Incoming update payload
   * @param existingRecord - Existing DB row with design_schema stamped at creation
   * @param typeSlug - Type slug for schema lookup
   * @returns Promise<{ valid: boolean, error?: string, sanitizedData?: any }>
   * @throws never
   * @inputSpec existingRecord.design_schema.record_permissions — deny if missing
   * @inputSpec updateData.data: object — all fields must have fieldPerms.write=true
   * @outputSpec sanitizedData: object — only present when valid=true
   * @sideEffects DB read: types and people via resolveFirstSurfacePermissions
   * @calledBy validateUpdatePermissions (surface='first')
   * @calls resolveFirstSurfacePermissions, schema-utils.sanitizeFieldData
   */
  private async validateFirstSurfaceUpdatePermissions(
    ctx: RequestContext,
    updateData: any,
    existingRecord: any,
    typeSlug: string
  ): Promise<{ valid: boolean; error?: string; sanitizedData?: any }> {
    if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
      return { valid: false, error: 'Authentication required' }
    }

    // Use record's design_schema stamped at creation time.
    // No schema or missing record_permissions = deny. RLS controls row access;
    // design_schema controls what the principal can do. No permissions granted = none given.
    const designSchema = existingRecord.design_schema
    if (!designSchema || !designSchema.record_permissions) {
      return { valid: false, error: 'No permissions defined on this record type' }
    }

    const perms = await this.resolveFirstSurfacePermissions(
      ctx.principal.id,
      existingRecord.account_id || ctx.accountId,
      typeSlug,
      'update',
      designSchema
    )

    if (!perms.canUpdate) {
      return { valid: false, error: 'Insufficient permissions to update this record' }
    }

    // Check field-level permissions and sanitize data
    const sanitizedData: any = {}
    const validationSchema = existingRecord.validation_schema || {}

    // Process data fields
    if (updateData.data && typeof updateData.data === 'object') {
      sanitizedData.data = {}
      
      for (const [fieldName, fieldValue] of Object.entries(updateData.data)) {
        const fieldPerms = perms.fieldPermissions[fieldName]
        if (!fieldPerms || !fieldPerms.write) {
          return { valid: false, error: `Insufficient permissions to update field '${fieldName}'` }
        }

        // Apply data sanitization using validation schema
        const fieldValidation = validationSchema.fields?.[fieldName]
        
        if (fieldValidation) {
          // Import sanitizeFieldData function
          const { sanitizeFieldData } = await import('./schema-utils')
          try {
            sanitizedData.data[fieldName] = sanitizeFieldData(
              fieldValue, 
              fieldValidation.data_type, 
              fieldValidation
            )
          } catch (sanitizeError: any) {
            return { valid: false, error: `Field '${fieldName}' validation error: ${sanitizeError.message}` }
          }
        } else {
          sanitizedData.data[fieldName] = fieldValue
        }
      }
    }

    // Process metadata fields (if still present during migration)
    if (updateData.metadata && typeof updateData.metadata === 'object') {
      sanitizedData.metadata = {}
      
      for (const [fieldName, fieldValue] of Object.entries(updateData.metadata)) {
        const fieldPerms = perms.fieldPermissions[fieldName]
        if (!fieldPerms || !fieldPerms.write) {
          return { valid: false, error: `Insufficient permissions to update field '${fieldName}'` }
        }

        // Apply basic sanitization for legacy metadata
        sanitizedData.metadata[fieldName] = fieldValue
      }
    }

    // Copy non-data/metadata fields through
    for (const [key, value] of Object.entries(updateData)) {
      if (key !== 'data' && key !== 'metadata') {
        sanitizedData[key] = value
      }
    }

    return { valid: true, sanitizedData }
  }

  // ─── UNIFIED PRINCIPAL METHODS ───────────────────────────────────────────────

  /**
   * Unified permission check for all principal types (human, machine, cron, trigger).
   *
   * This is the preferred method when you have a `Principal` directly rather than
   * a full `RequestContext`. Used by the Unified Principal Architecture to check
   * access without constructing a fake context.
   *
   * Resolution:
   *   1. system_admin (human with 'system_admin' role) → always true
   *   2. machine principal → scope check via `checkMachineScope`
   *   3. human principal with accountId → `canAccessFirstSurfaceRecord` (constructs minimal ctx)
   *   4. all others → false
   *
   * @param principal - The fully resolved Principal from `resolvePrincipal()`
   * @param record - The record being accessed; must include account_id and type for scope matching
   * @param action - CRUD action being attempted
   * @returns Promise<boolean> — true if the principal may perform the action
   * @throws never
   * @inputSpec principal: Principal — must be resolved (not ANONYMOUS_PRINCIPAL for useful results)
   * @inputSpec record.account_id: string — required for human principals
   * @inputSpec record.type: string | undefined — used for machine scope matching
   * @outputSpec boolean
   * @sideEffects DB read (human principal): types and people tables
   * @calledBy Handlers that receive a Principal directly (e.g. CLI, import callers)
   * @calls checkMachineScope, canAccessFirstSurfaceRecord
   * @testUnit tests/unit/permissions.test.ts — 'canPrincipalAccessRecord' describe block
   *
   * @example Import usage (v2-custom/)
   * ```ts
   * import { PermissionEngine } from '../_shared/index'
   * const allowed = await PermissionEngine.canPrincipalAccessRecord(
   *   principal, { account_id: accountId, type: 'item' }, 'create'
   * )
   * ```
   *
   * @example CLI usage
   * ```bash
   * # Access checks happen automatically when CLI constructs CoreContext
   * spine items create --data '{"title":"Test"}'
   * ```
   */
  async canPrincipalAccessRecord(
    principal: Principal,
    record: { account_id: string; type?: string; [key: string]: any },
    action: 'create' | 'read' | 'update' | 'delete'
  ): Promise<boolean> {
    // System admin bypass
    if (principal.type === 'human' && principal.roles?.includes('system_admin')) {
      return true
    }
    
    // Machine scope check
    if (principal.type === 'machine') {
      return this.checkMachineScope(principal, record, action)
    }
    
    // Human: Use existing schema-driven permissions
    if (principal.type === 'human' && principal.accountId) {
      return this.canAccessFirstSurfaceRecord(
        {
          requestId: '',
          principal,
          db: null as any,
          accountId: principal.accountId,
          appId: null,
          query: {}
        } as any,
        record,
        action
      )
    }
    
    return false
  }
  
  /**
   * Evaluates whether a machine principal's scopes permit the requested action.
   *
   * Scope matching supports three patterns (evaluated in order):
   *   1. Exact match: `'items:read'` matches `'items:read'`
   *   2. Wildcard action: `'items:*'` matches any action on `items`
   *   3. Global wildcard: `'*:*'` matches any resource and any action
   *
   * The required scope is constructed as `<record.type>:<action>`. If `record.type`
   * is absent, `'resource'` is used as the resource name.
   *
   * @param principal - Machine principal (principal.type must be 'machine')
   * @param record - The record being accessed (record.type used as resource name)
   * @param action - The CRUD action string
   * @returns boolean — true if any scope in principal.scopes grants the action
   * @throws never
   * @inputSpec principal.type: 'machine' — returns false for non-machine principals
   * @inputSpec principal.scopes: string[] — list of granted scope strings
   * @inputSpec record.type: string | undefined — resource name portion of scope check
   * @outputSpec boolean
   * @sideEffects none
   * @calledBy canPrincipalAccessRecord (machine branch)
   * @testUnit tests/unit/permissions.test.ts — 'checkMachineScope' describe block
   */
  private checkMachineScope(
    principal: Principal,
    record: any,
    action: string
  ): boolean {
    if (principal.type !== 'machine') return false
    
    const scopes = principal.scopes || []
    const requiredScope = `${record.type || 'resource'}:${action}`
    const [resource] = requiredScope.split(':')
    
    // Exact match
    if (scopes.includes(requiredScope)) return true
    
    // Wildcard resource match (e.g., "items:*" matches "items:read")
    if (scopes.includes(`${resource}:*`)) return true
    
    // Global wildcard
    if (scopes.includes('*:*')) return true
    
    return false
  }
  
  /**
   * Returns a structured summary of a principal's permission posture for use
   * in audit log entries.
   *
   * Does not perform any access check — purely descriptive. The returned object
   * is safe to serialize into the `metadata` column of the `logs` table.
   *
   * @param principal - The resolved principal to summarize
   * @returns object — summary safe for audit log serialization
   * @throws never
   * @inputSpec principal: Principal — any resolved principal including ANONYMOUS
   * @outputSpec { type, roles, is_system_admin } for human principals
   * @outputSpec { type, machine_type, scopes, is_internal } for machine principals
   * @outputSpec { type: 'unknown' } for all other types
   * @sideEffects none
   * @calledBy audit.ts (emitAudit), any handler that logs permission context
   * @testUnit tests/unit/permissions.test.ts — 'getPrincipalPermissionSummary' describe block
   *
   * @example
   * ```ts
   * await emitAudit(ctx, 'record.read', record.id, {
   *   permissions: PermissionEngine.getPrincipalPermissionSummary(ctx.principal)
   * })
   * ```
   */
  getPrincipalPermissionSummary(principal: Principal): object {
    if (principal.type === 'human') {
      return {
        type: 'human',
        roles: principal.roles || [],
        is_system_admin: principal.roles?.includes('system_admin') || false
      }
    }
    
    if (principal.type === 'machine') {
      return {
        type: 'machine',
        machine_type: principal.machineType,
        scopes: principal.scopes || [],
        is_internal: principal.isInternal
      }
    }
    
    return { type: 'unknown' }
  }
}

// ─── SINGLETON EXPORT ────────────────────────────────────────────────────────

/**
 * The single shared PermissionEngine instance.
 *
 * This is the ONLY export that should be used for permission checks. Import this
 * directly or use the named legacy aliases below. Do not instantiate
 * `_PermissionEngineInternal` yourself.
 *
 * @stability stable
 * @audience both
 * @calledBy All 19 API handlers, tests, and custom code in v2-custom/
 *
 * @example API handler
 * ```ts
 * import { PermissionEngine } from './_shared/permissions'
 * const sanitized = await PermissionEngine.sanitizeRecordData(ctx, record, 'item')
 * ```
 *
 * @example Import usage (v2-custom/)
 * ```ts
 * import { PermissionEngine } from '../_shared/index'
 * const allowed = await PermissionEngine.canPrincipalAccessRecord(principal, record, 'read')
 * ```
 */
export const PermissionEngine: _PermissionEngineInternal = _PermissionEngineInternal.getInstance()

// ─── LEGACY EXPORTS ───────────────────────────────────────────────────────────

/**
 * Legacy named exports — bound methods on the singleton for backward compatibility.
 * Prefer importing `PermissionEngine` and calling methods on it directly.
 * These will be removed in a future version.
 *
 * @deprecated Use `PermissionEngine.<methodName>()` instead.
 * @stability internal
 */
export const resolveFirstSurfacePermissions = PermissionEngine.resolveFirstSurfacePermissions.bind(PermissionEngine)
export const isSystemAdmin = PermissionEngine.isSystemAdmin.bind(PermissionEngine)
export const canAccessRecord = PermissionEngine.canAccessRecord.bind(PermissionEngine)
export const sanitizeRecordData = PermissionEngine.sanitizeRecordData.bind(PermissionEngine)
export const validateUpdatePermissions = PermissionEngine.validateUpdatePermissions.bind(PermissionEngine)
