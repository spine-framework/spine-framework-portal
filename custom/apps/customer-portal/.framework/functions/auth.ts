/**
 * @module auth
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Authentication context endpoint. Returns the full user session context for
 * the authenticated principal: person record, account, role, permissions, and
 * accessible child accounts (via the `get_account_hierarchy` RPC).
 *
 * **Routed by:** `GET /.netlify/functions/auth`
 *
 * **Actions:**
 * | method | handler  |
 * |--------|----------|
 * | GET    | context  |
 * | HEALTH | health   |
 *
 * **Authorization:** `context` requires a non-anonymous authenticated
 * principal. `health` is unauthenticated.
 *
 * **Returned session shape:**
 * ```ts
 * {
 *   id: string             // person UUID
 *   email: string
 *   full_name: string
 *   account_id: string
 *   account: { id, slug, display_name, parent_id }
 *   roles: string[]        // role slugs (e.g. ['system_admin'])
 *   permissions: string[]  // derived from role.slug or role.permissions
 *   accessible_accounts: AccountHierarchyRow[]
 * }
 * ```
 *
 * INVARIANT: `system_admin` role always receives the full permission set
 *   ['read', 'write', 'admin', 'system'] regardless of `role.permissions`.
 *
 * @seeAlso middleware.ts (createHandler builds ctx.principal from JWT)
 * @seeAlso _shared/db.ts (get_account_hierarchy RPC)
 * @seeAlso roles.ts (role records referenced by FK)
 */

import { createHandler } from './_shared/middleware'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

/**
 * Returns the full authenticated user context. Fetches person, account,
 * and role in a single query, then calls `get_account_hierarchy` to
 * resolve accessible child accounts.
 *
 * @returns Session object (see module-level shape doc)
 * @throws Error('Authentication required') if principal is anonymous
 * @throws Error('User not found: <id>') if person row is inactive or missing
 * @sideEffects DB read: people table (with account + role joins)
 * @sideEffects DB read: get_account_hierarchy RPC
 * @calledBy handler (GET)
 * @testUnit tests/unit/auth.test.ts — 'context'
 * @testIntegration tests/integration/auth.test.ts — 'returns valid context'
 */
export const context = createHandler(async (ctx, _body) => {
  // Authentication is required
  if (!ctx.principal || ctx.principal.id === 'anonymous') {
    throw new Error('Authentication required')
  }

  console.log('Backend: Fetching user context for person:', ctx.principal.id)

  // Single query gets everything - person, account, role using simplified model
  const { data: personData, error: personError } = await ctx.db
    .from('people')
    .select(`
      id,
      email,
      full_name,
      avatar_url,
      account_id,
      role_id,
      account:accounts!people_account_id_fkey(
        id,
        slug,
        display_name,
        parent_id
      ),
      role:roles(
        id,
        slug,
        name,
        is_system
      )
    `)
    .eq('id', ctx.principal.id)
    .eq('is_active', true)
    .single()

  if (personError) {
    console.error('Backend: Error fetching person:', personError)
  }

  if (!personData) {
    throw new Error('User not found: ' + ctx.principal.id)
  }

  console.log('Backend: Person data found:', {
    id: personData.id,
    email: personData.email,
    account_id: personData.account_id,
    role_id: personData.role_id
  })

  // Extract account and role (handle array responses)
  const account = Array.isArray(personData.account) ? personData.account[0] : personData.account
  const role = Array.isArray(personData.role) ? personData.role[0] : personData.role

  // Get child accounts recursively
  let accessibleAccounts = []
  if (personData.account_id) {
    const { data: childAccounts } = await ctx.db
      .rpc('get_account_hierarchy', { 
        parent_account_id: personData.account_id 
      })
    
    accessibleAccounts = childAccounts || []
    console.log('Backend: Found', accessibleAccounts.length, 'accessible accounts')
  }

  // Determine permissions from role - system_admin role has full permissions
  let effectivePermissions = []
  const roleSlug = role?.slug
  
  if (roleSlug === 'system_admin') {
    effectivePermissions = ['read', 'write', 'admin', 'system']
  } else if (role?.permissions && Array.isArray(role.permissions)) {
    effectivePermissions = role.permissions
  }

  console.log('Backend: User context complete:', {
    id: personData.id,
    email: personData.email,
    account: account?.slug,
    role: roleSlug,
    permissionsCount: effectivePermissions.length
  })

  // Return complete user context
  // Note: system_admin status is determined by 'system_admin' in roles array
  return {
    id: personData.id,
    email: personData.email,
    full_name: personData.full_name,
    account_id: personData.account_id,
    account: account,
    roles: [roleSlug].filter(Boolean),
    permissions: effectivePermissions,
    is_system_admin: roleSlug === 'system_admin',
    accessible_accounts: accessibleAccounts
  }
})

/**
 * Lightweight health check for the auth function. Returns service name
 * and current timestamp. No authentication required.
 *
 * @returns `{ status: 'healthy', timestamp: string, service: 'auth' }`
 * @calledBy handler (HEALTH method)
 * @calledBy load balancer health probes
 */
export const health = createHandler(async (ctx, _body) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'auth'
  }
})

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

/**
 * Netlify function entry point. Routes by HTTP method:
 * GET → context | HEALTH → health
 * @throws Error('Unsupported method: <method>') on unmatched method
 * @calledBy Netlify function routing
 */
export const handler = createHandler(async (ctx, _body) => {
  const method = ctx.query?.method || 'GET'

  switch (method) {
    case 'GET':
      return await context(ctx, _body)
    case 'HEALTH':
      return await health(ctx, _body)
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
})
