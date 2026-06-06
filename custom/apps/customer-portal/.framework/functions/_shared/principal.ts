/**
 * @module principal
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Unified identity abstraction for all actors in Spine v2. Every request —
 * whether from a human via JWT, an integration via API key, a scheduled cron
 * job, or an internal trigger — resolves to a single `Principal` object before
 * any permission check or DB query occurs.
 *
 * Resolution order in `resolvePrincipal`:
 *   1. `x-api-key` header  → machine principal (external integration)
 *   2. `x-cron-id` header  → machine principal (scheduled job)
 *   3. `x-trigger-id` header → machine principal (event trigger)
 *   4. `Authorization: Bearer <jwt>` → human principal
 *   5. (none)              → ANONYMOUS_PRINCIPAL (rejected by createHandler)
 *
 * INVARIANT: `resolvePrincipal` always returns a Principal, never null.
 *   ANONYMOUS_PRINCIPAL is the sentinel for unauthenticated requests and is
 *   rejected by `createHandler` before the handler runs.
 * INVARIANT: `adminDb` is used for all principal resolution lookups to avoid
 *   circular dependencies with RLS (which itself depends on the resolved principal).
 * INVARIANT: never store `authContext.jwt` or `authContext.apiKey` in logs.
 *   Use `formatPrincipalForAudit` which strips these fields.
 *
 * @seeAlso db.ts (adminDb, getUserDb — used for resolution and client selection)
 * @seeAlso middleware.ts (createHandler calls resolvePrincipal, getPrincipalDb)
 * @seeAlso permissions.ts (PermissionEngine.isSystemAdmin, canPrincipalAccessRecord)
 * @seeAlso audit.ts (formatPrincipalForAudit — safe audit serialization)
 */

import { getUserDb, adminDb } from './db'
import { createClient } from '@supabase/supabase-js'

// ─── AUTH CLIENT ─────────────────────────────────────────────────────────────

// Supabase anon client used only for JWT validation (supabase.auth.getUser).
// A separate client is used here to avoid importing the RLS-scoped client
// before the principal is resolved.
const env = (globalThis as any).process?.env || {}
const supabase = createClient(
  env.SUPABASE_URL!,
  env.SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// ─── PRINCIPAL INTERFACE ─────────────────────────────────────────────────────

/**
 * Unified identity abstraction for all actors in Spine.
 *
 * Every request resolves to a `Principal` before any permission or DB access.
 * The `type` field gates which optional fields are populated:
 *   - `'human'` → `roles`, `displayName`, `email`, `authContext.jwt`
 *   - `'machine'` → `scopes`, `machineType`, `isInternal`, `authContext.apiKey`
 *
 * The `provenance` object is always populated and is the primary audit trail
 * field. It must not be modified after resolution.
 *
 * @inputSpec none — this is a pure type definition
 * @calledBy middleware.ts (RequestContext.principal), permissions.ts (all methods),
 *   audit.ts (formatPrincipalForAudit), tests/integration/helpers.ts (makeTestCtx)
 */
export interface Principal {
  /** Unique identifier — person UUID (human) or machine principal UUID (machine) */
  id: string
  
  /** Actor type — gates which optional fields are populated */
  type: 'human' | 'machine'
  
  /** Primary account context; null for internal system principals */
  accountId: string | null
  
  // ─ Human-specific (only populated when type === 'human') ─────────────────
  /** Role slugs from people.role_id → roles.slug; used by PermissionEngine */
  roles?: string[]
  
  /** Display name from people.display_name or people.email */
  displayName?: string
  
  /** Email address from people.email or Supabase auth user */
  email?: string
  
  // ─ Machine-specific (only populated when type === 'machine') ─────────────
  /** Explicit permission grants (e.g., ['items:read', 'people:write', '*:*']) */
  scopes?: string[]
  
  /** Machine classification — determines UI visibility and default scopes */
  machineType?: 'integration' | 'service_account' | 'internal' | 'timer'
  
  /** Internal machines (cron, trigger, pipeline) are hidden from the UI */
  isInternal?: boolean
  
  // ─ Universal provenance — always populated, never modified after resolution
  provenance: {
    /** How this principal was authenticated */
    sourceType: 'jwt' | 'api_key' | 'cron' | 'trigger' | 'manual' | 'webhook' | 'timer'
    
    /** Person who authorized this principal (may be self for humans) */
    createdBy: string | null
    
    /** Chain ID for trigger/pipeline sequences */
    parentExecutionId?: string
    
    /** When this principal context was created */
    invokedAt: string
    
    // Source-specific context
    /** API key ID (for api_key source) */
    apiKeyId?: string
    
    /** Schedule ID (for cron source) */
    cronId?: string
    
    /** Trigger ID (for trigger source) */
    triggerId?: string
    
    /** Timer ID (for timer source) */
    timerId?: string
    
    /** Event ID that triggered this execution */
    eventId?: string
    
    /** IP address of the requester */
    ipAddress?: string
    
    /** User agent string */
    userAgent?: string
  }
  
  // ============================================
  // Authentication context (for RLS client selection)
  // ============================================
  authContext?: {
    /** JWT token for human-scoped DB client */
    jwt?: string
    
    /** API key value for machine verification */
    apiKey?: string
  }
}

// ─── PRINCIPAL CONSTANTS ─────────────────────────────────────────────────────

/**
 * Sentinel principal for unauthenticated requests.
 *
 * Returned by `resolvePrincipal` when no auth header is present. `createHandler`
 * checks for `principal.id === 'anonymous'` and rejects the request with 401.
 * Never use this principal for any DB access — it has no scopes or accountId.
 *
 * @stability stable
 * @calledBy resolvePrincipal (returned when no auth header is present)
 * @calledBy middleware.ts, requireUserContext, requireSystemContextWithAudit (checked against)
 * @calledBy permissions.ts (all surface methods check for 'anonymous' and deny)
 */
export const ANONYMOUS_PRINCIPAL: Principal = {
  id: 'anonymous',
  type: 'machine',
  accountId: null,
  scopes: [],
  provenance: {
    sourceType: 'manual',
    createdBy: null,
    invokedAt: new Date().toISOString()
  }
}

/**
 * System principal for internal Spine operations (cron, pipeline runner, trigger engine).
 *
 * Has `'*:*'` scope (all resources, all actions) and `isInternal: true`. When
 * a `CoreContext` is constructed for a system operation (e.g. in v2-custom/ or
 * the CLI), use `SYSTEM_PRINCIPAL` as the principal and `adminDb` as the db.
 *
 * Never expose this principal in an HTTP response or log the `authContext` field.
 *
 * @stability stable
 * @calledBy tests/integration/helpers.ts (makeTestCtx)
 * @calledBy CLI context construction
 * @calledBy v2-custom/ system-level import callers
 *
 * @example Import usage (v2-custom/)
 * ```ts
 * import { CoreContext, SYSTEM_PRINCIPAL, adminDb } from '../_shared/index'
 * const ctx: CoreContext = {
 *   principal: SYSTEM_PRINCIPAL,
 *   accountId: MY_ACCOUNT_ID,
 *   db: adminDb,
 *   requestId: crypto.randomUUID()
 * }
 * ```
 */
export const SYSTEM_PRINCIPAL: Principal = {
  id: 'system',
  type: 'machine',
  accountId: null,
  scopes: ['*:*'],  // All scopes
  machineType: 'internal',
  isInternal: true,
  provenance: {
    sourceType: 'manual',
    createdBy: null,
    invokedAt: new Date().toISOString()
  }
}

// ─── RESOLUTION FUNCTIONS ────────────────────────────────────────────────────

/**
 * Main entry point for principal resolution. Called by `createHandler` on every
 * HTTP request before the handler runs.
 *
 * Examines request headers in priority order and delegates to the appropriate
 * resolver. Always returns a `Principal` — never throws for missing auth
 * (returns `ANONYMOUS_PRINCIPAL` instead). Throws only on invalid/expired
 * credentials (invalid API key, expired JWT, etc.).
 *
 * Resolution order:
 *   1. `x-api-key` / `X-Api-Key` header → `resolveMachinePrincipal`
 *   2. `x-cron-id` / `X-Cron-Id` header → `resolveCronPrincipal`
 *   3. `x-trigger-id` / `X-Trigger-Id` header → `resolveTriggerPrincipal`
 *   4. `Authorization: Bearer <jwt>` → `resolveHumanPrincipal`
 *   5. (none matched) → `ANONYMOUS_PRINCIPAL`
 *
 * @param event - Raw Netlify event object with `headers` and optional `body`
 * @returns Promise<Principal> — always resolves; throws on invalid credentials
 * @throws Error — on invalid API key, invalid JWT, or missing DB records
 * @inputSpec event.headers: Record<string, string> — HTTP request headers
 * @outputSpec Principal — fully resolved principal with provenance populated
 * @sideEffects DB reads: api_keys, schedules, triggers, people tables via sub-resolvers
 * @calledBy middleware.ts (createHandler) — once per HTTP request
 * @calls resolveMachinePrincipal | resolveCronPrincipal | resolveTriggerPrincipal |
 *   resolveHumanPrincipal
 * @testUnit tests/unit/principal.test.ts — 'resolvePrincipal' describe block
 * @testIntegration tests/integration/auth.test.ts
 */
export async function resolvePrincipal(event: any): Promise<Principal> {
  // Check for API key (external machine)
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key']
  if (apiKey) {
    return resolveMachinePrincipal(apiKey, event)
  }
  
  // Check for internal cron header
  const cronId = event.headers?.['x-cron-id'] || event.headers?.['X-Cron-Id']
  if (cronId) {
    return resolveCronPrincipal(cronId)
  }
  
  // Check for internal trigger header
  const triggerId = event.headers?.['x-trigger-id'] || event.headers?.['X-Trigger-Id']
  if (triggerId) {
    return resolveTriggerPrincipal(triggerId, event)
  }
  
  // Check for JWT Bearer (human)
  const authHeader = event.headers?.authorization || event.headers?.Authorization
  if (authHeader?.startsWith('Bearer ')) {
    return resolveHumanPrincipal(authHeader.replace('Bearer ', ''), event)
  }
  
  // No authentication - return anonymous
  return ANONYMOUS_PRINCIPAL
}

/**
 * Resolves a machine principal by validating an API key against the DB.
 *
 * Calls the `validate_machine_principal` RPC which checks the key hash,
 * expiry, and active status in one query. Throws on any validation failure —
 * invalid keys are not silently demoted to anonymous.
 *
 * @param apiKey - Raw API key string from `x-api-key` header
 * @param event - Raw Netlify event (used for IP/user-agent provenance)
 * @returns Promise<Principal> — machine principal with scopes from the DB record
 * @throws Error — on invalid, expired, or inactive API key
 * @inputSpec apiKey: string — raw key value; hashed by the RPC for comparison
 * @outputSpec Principal with type='machine', scopes from DB, provenance.sourceType='api_key'
 * @sideEffects DB read: validate_machine_principal RPC (api_keys table)
 * @calledBy resolvePrincipal (api_key branch)
 * @calls adminDb.rpc('validate_machine_principal')
 */
async function resolveMachinePrincipal(apiKey: string, event: any): Promise<Principal> {
  // Validate the API key using the database function
  const { data: rows, error } = await adminDb.rpc('validate_machine_principal', {
    p_key_value: apiKey,
    p_required_scope: null  // No specific scope required for resolution
  })
  const machine = Array.isArray(rows) ? rows[0] : rows
  
  if (error || !machine || !machine.is_valid) {
    throw new Error(machine?.error_message || 'Invalid or inactive machine principal')
  }
  
  return {
    id: machine.machine_id,
    type: 'machine',
    accountId: machine.account_id,
    scopes: machine.scopes || [],
    machineType: machine.machine_type as any,
    isInternal: machine.is_internal,
    provenance: {
      sourceType: 'api_key',
      createdBy: machine.created_by,
      invokedAt: new Date().toISOString(),
      apiKeyId: machine.machine_id,
      ipAddress: getClientIp(event),
      userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent']
    },
    authContext: { apiKey }
  }
}

/**
 * Resolves a machine principal for a scheduled cron job execution.
 *
 * Loads the schedule record (with its linked machine principal) and validates
 * that the schedule creator is still active via `validate_schedule_creator` RPC.
 * Uses the schedule's `delegated_scopes` if set, falling back to the machine's
 * own scopes. This allows scopes to be narrowed per-schedule for least-privilege.
 *
 * @param scheduleId - UUID of the schedule from `x-cron-id` header
 * @returns Promise<Principal> — machine principal with delegated or own scopes
 * @throws Error — on invalid/inactive schedule, missing machine, or validation failure
 * @inputSpec scheduleId: string — valid UUID in the schedules table
 * @outputSpec Principal with type='machine', provenance.sourceType='cron', cronId set
 * @sideEffects DB reads: schedules table, validate_schedule_creator RPC
 * @calledBy resolvePrincipal (cron branch)
 * @calls adminDb.from('schedules'), adminDb.rpc('validate_schedule_creator')
 */
async function resolveCronPrincipal(scheduleId: string): Promise<Principal> {
  // Load the schedule with its machine principal
  const { data: schedule, error: scheduleError } = await adminDb
    .from('schedules')
    .select(`
      *,
      machine:machine_principal_id (*)
    `)
    .eq('id', scheduleId)
    .single()
  
  if (scheduleError || !schedule) {
    throw new Error('Invalid or inactive schedule: ' + scheduleId)
  }
  
  // Validate the schedule creator is still active
  const { data: validation, error: validationError } = await adminDb.rpc('validate_schedule_creator', {
    p_schedule_id: scheduleId
  })
  
  if (validationError || !validation.is_valid) {
    throw new Error(validation.error_message || 'Schedule validation failed')
  }
  
  const machine = schedule.machine
  
  return {
    id: machine.id,
    type: 'machine',
    accountId: machine.account_id,
    scopes: schedule.delegated_scopes || machine.scopes || [],
    machineType: machine.machine_type,
    isInternal: machine.is_internal,
    provenance: {
      sourceType: 'cron',
      createdBy: machine.created_by,
      invokedAt: new Date().toISOString(),
      cronId: scheduleId
    }
  }
}

/**
 * Resolves a machine principal for an event trigger execution.
 *
 * Loads the trigger record and its associated action. The action must have a
 * `default_machine_principal_id` configured — this is the API key record that
 * provides identity and scopes for the trigger's execution context.
 *
 * @param triggerId - UUID of the trigger from `x-trigger-id` header
 * @param event - Raw Netlify event (used for eventId and provenance)
 * @returns Promise<Principal> — machine principal from the trigger's action config
 * @throws Error — on invalid trigger, missing action config, or missing machine
 * @inputSpec triggerId: string — valid UUID in the triggers table
 * @outputSpec Principal with type='machine', provenance.sourceType='trigger', triggerId set
 * @sideEffects DB reads: triggers table, api_keys table
 * @calledBy resolvePrincipal (trigger branch)
 * @calls adminDb.from('triggers'), adminDb.from('api_keys')
 */
async function resolveTriggerPrincipal(triggerId: string, event: any): Promise<Principal> {
  // Load the trigger
  const { data: trigger, error: triggerError } = await adminDb
    .from('triggers')
    .select(`
      *,
      action:target_id (*)
    `)
    .eq('id', triggerId)
    .single()
  
  if (triggerError || !trigger) {
    throw new Error('Invalid trigger: ' + triggerId)
  }
  
  // Get the action's default machine principal
  const action = trigger.action
  if (!action?.default_machine_principal_id) {
    throw new Error('Trigger action has no machine principal configured')
  }
  
  const { data: machine, error: machineError } = await adminDb
    .from('api_keys')
    .select('*')
    .eq('id', action.default_machine_principal_id)
    .single()
  
  if (machineError || !machine) {
    throw new Error('Machine principal not found: ' + action.default_machine_principal_id)
  }
  
  return {
    id: machine.id,
    type: 'machine',
    accountId: machine.account_id,
    scopes: machine.scopes || [],
    machineType: machine.machine_type,
    isInternal: machine.is_internal,
    provenance: {
      sourceType: 'trigger',
      createdBy: machine.created_by,
      invokedAt: new Date().toISOString(),
      triggerId: triggerId,
      eventId: event.body?.eventId || event.headers?.['x-event-id']
    }
  }
}

/**
 * Resolves a human principal from a Supabase JWT Bearer token.
 *
 * Validates the token with `supabase.auth.getUser`, resolves the internal
 * person UUID from the auth user, then loads the person's role via `role_id` FK.
 * Role slugs are the source of truth for `PermissionEngine.isSystemAdmin` checks.
 *
 * If the person's `auth_uid` is not yet set, it is backfilled on first login
 * (side effect on the people table).
 *
 * @param token - Raw JWT string extracted from `Authorization: Bearer <token>`
 * @param event - Raw Netlify event (used for IP/user-agent provenance)
 * @returns Promise<Principal> — human principal with roles from the DB
 * @throws Error('Invalid authentication token') — on expired or invalid JWT
 * @throws Error('Person not found') — if people record doesn't exist for this auth user
 * @inputSpec token: string — valid non-expired Supabase JWT
 * @outputSpec Principal with type='human', roles from people.role_id → roles.slug
 * @sideEffects DB reads: supabase.auth.getUser, people table (with role join)
 * @sideEffects DB write (conditional): people.auth_uid backfill on first login
 * @calledBy resolvePrincipal (jwt branch)
 * @calls supabase.auth.getUser, resolveInternalPersonId, adminDb.from('people')
 * @testIntegration tests/integration/auth.test.ts
 */
async function resolveHumanPrincipal(token: string, event: any): Promise<Principal> {
  // Validate JWT with Supabase
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    return ANONYMOUS_PRINCIPAL
  }
  
  // Resolve internal person ID from auth user
  const personId = await resolveInternalPersonId(user.id, user.email)
  
  // Load person details
  const { data: person, error: personError } = await adminDb
    .from('people')
    .select('*, role:role_id(slug, name, is_system, is_protected)')
    .eq('id', personId)
    .single()
  
  if (personError || !person) {
    throw new Error('Person not found: ' + personId)
  }
  
  // Resolve role from role_id
  const roleSlugs = person.role?.slug ? [person.role.slug] : []
  
  return {
    id: personId,
    type: 'human',
    accountId: person.account_id || null,
    roles: roleSlugs,
    displayName: person.display_name || person.email,
    email: person.email,
    provenance: {
      sourceType: 'jwt',
      createdBy: personId,  // Self-created through auth
      invokedAt: new Date().toISOString(),
      ipAddress: getClientIp(event),
      userAgent: event.headers?.['user-agent'] || event.headers?.['User-Agent']
    },
    authContext: { jwt: token }
  }
}

/**
 * Resolves the internal people table UUID from a Supabase auth user ID.
 *
 * Lookup strategy (in order):
 *   1. Match by `email` — most reliable; also backfills `auth_uid` if missing
 *   2. Fallback: match by `auth_uid` directly
 *   3. Last resort: return `authUserId` as-is (person not yet in people table)
 *
 * The email-first strategy handles the case where a person was created manually
 * in the people table before the user completed Supabase Auth registration.
 *
 * @param authUserId - UUID from Supabase auth.users (supabase.auth.getUser result)
 * @param email - Email address from the Supabase auth user (optional but preferred)
 * @returns Promise<string> — internal person UUID, or authUserId as fallback
 * @throws never — graceful fallback to authUserId on any lookup failure
 * @inputSpec authUserId: string — valid Supabase auth user UUID
 * @inputSpec email: string | undefined — used for primary lookup
 * @outputSpec string — internal people.id UUID
 * @sideEffects DB reads: people table (by email, then by auth_uid)
 * @sideEffects DB write (conditional): people.auth_uid backfill when found by email
 * @calledBy resolveHumanPrincipal
 * @calls adminDb.from('people')
 */
async function resolveInternalPersonId(authUserId: string, email?: string): Promise<string> {
  // Try to find by email first (more reliable)
  if (email) {
    const { data: byEmail } = await adminDb
      .from('people')
      .select('id, auth_uid')
      .eq('email', email)
      .maybeSingle()
    
    if (byEmail) {
      // Update auth_uid if not set
      if (!byEmail.auth_uid) {
        await adminDb
          .from('people')
          .update({ auth_uid: authUserId })
          .eq('id', byEmail.id)
      }
      return byEmail.id
    }
  }
  
  // Fallback: try by auth_uid
  const { data: byAuthId } = await adminDb
    .from('people')
    .select('id')
    .eq('auth_uid', authUserId)
    .maybeSingle()
  
  if (byAuthId) return byAuthId.id
  
  // Not found - return the auth ID as fallback
  return authUserId
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Extracts the client IP address from event headers.
 *
 * Checks headers in priority order: `x-forwarded-for` (load balancer),
 * `x-real-ip` (proxy), then `requestContext.identity.sourceIp` (API Gateway).
 * Returns `undefined` if none are present.
 *
 * @param event - Raw Netlify event object
 * @returns string | undefined — first non-empty IP found
 * @throws never
 * @inputSpec event.headers: Record<string, string> | undefined
 * @outputSpec string — IPv4 or IPv6 address; may contain comma-separated list
 *   from x-forwarded-for (take first value if parsing is needed)
 * @sideEffects none
 * @calledBy resolveMachinePrincipal, resolveHumanPrincipal (for provenance)
 */
function getClientIp(event: any): string | undefined {
  return event.headers?.['x-forwarded-for'] ||
         event.headers?.['X-Forwarded-For'] ||
         event.headers?.['x-real-ip'] ||
         event.headers?.['X-Real-Ip'] ||
         event.requestContext?.identity?.sourceIp
}

/**
 * Checks whether a machine principal has been granted a specific scope.
 *
 * Scope matching supports three patterns:
 *   1. Exact: `'items:read'` matches only `'items:read'`
 *   2. Wildcard action: `'items:*'` matches `'items:read'`, `'items:write'`, etc.
 *   3. Global wildcard: `'*:*'` matches any scope
 *
 * Returns `false` for non-machine principals — role-based checks use `humanHasRole`.
 *
 * @param principal - The principal to check
 * @param scope - The required scope string in `'resource:action'` format
 * @returns boolean — true if any of the principal's scopes grant the required scope
 * @throws never
 * @inputSpec principal.type: 'machine' — returns false for human principals
 * @inputSpec scope: string — must be in 'resource:action' format
 * @inputSpec principal.scopes: string[] — list of granted scope strings
 * @outputSpec boolean
 * @sideEffects none
 * @calledBy permissions.ts (checkMachineScope), any custom code doing scope checks
 * @testUnit tests/unit/principal.test.ts — 'machineHasScope' describe block
 *
 * @example
 * ```ts
 * import { machineHasScope } from '../_shared/index'
 * if (!machineHasScope(principal, 'items:write')) {
 *   return { error: 'Insufficient scope' }
 * }
 * ```
 */
export function machineHasScope(principal: Principal, scope: string): boolean {
  if (principal.type !== 'machine') return false
  
  const scopes = principal.scopes || []
  const [resource, action] = scope.split(':')
  
  // Exact match
  if (scopes.includes(scope)) return true
  
  // Wildcard resource
  if (scopes.includes(`${resource}:*`)) return true
  
  // Global wildcard
  if (scopes.includes('*:*')) return true
  
  return false
}

/**
 * Checks whether a human principal has been assigned a specific role.
 *
 * Returns `false` for non-human (machine) principals — scope checks use
 * `machineHasScope`. Role slugs come from `people.role_id → roles.slug`
 * and are loaded at resolution time in `resolveHumanPrincipal`.
 *
 * @param principal - The principal to check
 * @param roleSlug - The role slug to look for (e.g. 'system_admin', 'agent')
 * @returns boolean — true if principal.roles includes the given slug
 * @throws never
 * @inputSpec principal.type: 'human' — returns false for machine principals
 * @inputSpec roleSlug: string — must match exactly (case-sensitive)
 * @inputSpec principal.roles: string[] | undefined
 * @outputSpec boolean
 * @sideEffects none
 * @calledBy isSystemAdmin, permissions.ts (PermissionEngine.isSystemAdmin)
 * @testUnit tests/unit/principal.test.ts — 'humanHasRole' describe block
 */
export function humanHasRole(principal: Principal, roleSlug: string): boolean {
  if (principal.type !== 'human') return false
  return principal.roles?.includes(roleSlug) || false
}

/**
 * Returns true if the principal holds the `system_admin` role.
 *
 * This is the canonical system admin check used by `middleware.ts`
 * (`requireSystemContextWithAudit`) and re-exported from `permissions.ts`
 * (`PermissionEngine.isSystemAdmin`). system_admin bypasses all three
 * permission surfaces.
 *
 * @param principal - The principal to check
 * @returns boolean — true only if type='human' and roles includes 'system_admin'
 * @throws never
 * @inputSpec principal: Principal — any resolved principal
 * @outputSpec boolean — false for machine principals, anonymous, or missing roles
 * @sideEffects none
 * @calledBy middleware.ts (requireSystemContextWithAudit), permissions.ts (PermissionEngine),
 *   any handler doing system-admin-only checks
 * @calls humanHasRole
 * @testUnit tests/unit/principal.test.ts — 'isSystemAdmin' describe block
 */
export function isSystemAdmin(principal: Principal): boolean {
  return humanHasRole(principal, 'system_admin')
}

/**
 * Selects the correct Supabase database client for the given principal.
 *
 * This is the only place in the codebase where the two-client selection
 * decision is made. The result is stored in `ctx.db` and used for all
 * subsequent DB queries in the request.
 *
 * Selection logic:
 *   - Human principal with JWT → `getUserDb(jwt)` — enforces RLS
 *   - Machine principal → `adminDb` — RLS policies check machine ID in policies
 *   - Anonymous → `adminDb` (but anonymous requests are rejected before DB access)
 *
 * @param principal - The resolved principal
 * @returns SupabaseClient — RLS-scoped for humans, admin for machines
 * @throws never
 * @inputSpec principal.type: 'human' | 'machine'
 * @inputSpec principal.authContext.jwt: string | undefined — required for human client
 * @outputSpec SupabaseClient — getUserDb result (human) or adminDb (machine)
 * @sideEffects none (client construction only)
 * @calledBy middleware.ts (createHandler — `const ctxDb = getPrincipalDb(principal)`)
 * @calls getUserDb (db.ts), adminDb (db.ts)
 * @testUnit tests/unit/principal.test.ts — 'getPrincipalDb' describe block
 */
export function getPrincipalDb(principal: Principal) {
  if (principal.type === 'human' && principal.authContext?.jwt) {
    return getUserDb(principal.authContext.jwt)
  }
  
  // Machines use admin client - RLS policies check their ID
  return adminDb
}

/**
 * Serializes a principal into a safe, structured object for audit log entries.
 *
 * Strips `authContext` entirely (never log JWT or API key values). The returned
 * object is safe to store in the `metadata` JSONB column of the `logs` table.
 *
 * @param principal - Any resolved principal including ANONYMOUS_PRINCIPAL
 * @returns object — audit-safe principal summary
 * @throws never
 * @inputSpec principal: Principal — any resolved principal
 * @outputSpec { id, type, account_id } + role/scope fields depending on type
 * @outputSpec authContext is NEVER included in output
 * @sideEffects none
 * @calledBy audit.ts (emitAudit — in metadata.principal)
 * @testUnit tests/unit/principal.test.ts — 'formatPrincipalForAudit' describe block
 *
 * @example
 * ```ts
 * await emitAudit(ctx, 'items.delete', { type: 'item', id }, {
 *   principal_snapshot: formatPrincipalForAudit(ctx.principal)
 * })
 * ```
 */
export function formatPrincipalForAudit(principal: Principal): object {
  return {
    id: principal.id,
    type: principal.type,
    account_id: principal.accountId,
    ...(principal.type === 'human' && {
      roles: principal.roles,
      display_name: principal.displayName
    }),
    ...(principal.type === 'machine' && {
      machine_type: principal.machineType,
      is_internal: principal.isInternal,
      scopes: principal.scopes
    }),
    provenance: principal.provenance
  }
}
