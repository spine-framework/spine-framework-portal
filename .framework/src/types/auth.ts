/**
 * @module src/types/auth
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Authentication and principal type definitions for the Spine frontend.
 * These shapes mirror the response from `GET /api/auth?action=context` and
 * are used throughout `AuthContext`, hooks, and any component that needs
 * to reason about the current user's identity, account, or permissions.
 *
 * **Server source:** `functions/auth.ts` → `get_account_hierarchy` RPC resolves
 * `User.account`, `User.roles`, `User.permissions`, and `User.accessible_accounts`.
 *
 * @seeAlso src/contexts/AuthContext.tsx (stores and exposes User)
 * @seeAlso src/types/types.ts (design-schema types; separate concern)
 * @seeAlso functions/auth.ts (API endpoint that returns User shape)
 */

// ─── PRINCIPAL ─────────────────────────────────────────────────────────────────

/**
 * The resolved user/principal context returned by the auth API and stored
 * in `AuthContext`. Populated from the `people`, `accounts`, and `roles`
 * tables via the `get_account_hierarchy` RPC.
 *
 * @prop id - UUID of the `people` row (matches `auth.users.id`)
 * @prop email - Primary email address
 * @prop full_name - Display name
 * @prop account_id - UUID of the user's primary account
 * @prop account - Hydrated primary `Account` object (optional join)
 * @prop roles - Flat list of role slugs (e.g. `['admin', 'member']`)
 * @prop permissions - Flat list of permission slugs
 * @prop is_system_admin - Convenience flag set when `system_admin` is in roles
 * @prop accessible_accounts - All accounts the user can act on (multi-tenancy)
 */
export interface User {
  id: string
  email: string
  full_name: string
  account_id: string
  account?: Account
  roles: string[] // Simplified for now
  permissions: string[] // Simplified for now
  is_system_admin?: boolean
  accessible_accounts?: Account[]
}

/**
 * A Spine account record. Used as the primary organisational scope for all
 * data access.
 *
 * @prop slug - URL-safe unique identifier
 * @prop display_name - Human-readable name shown in UI
 * @prop account_type - `'tenant'` | `'organization'` | `'individual'`
 * @prop owner_account_id - Parent account UUID for tenant hierarchy
 * @prop metadata - Arbitrary extra fields set by the application layer
 */
export interface Account {
  id: string
  slug: string
  display_name: string
  name?: string
  account_type?: string
  owner_account_id?: string
  metadata?: Record<string, any>
}

// ─── ROLES & PERMISSIONS ──────────────────────────────────────────────────────────

/**
 * A role record from the `v2.roles` table.
 *
 * @prop slug - Unique role identifier used in permission checks
 * @prop permissions - Granular permission list attached to this role
 */
export interface Role {
  id: string
  slug: string
  name: string
  description?: string
  permissions: Permission[]
}

/**
 * A single permission grant.
 *
 * @prop resource - The entity or system resource being guarded
 * @prop action - The allowed action (`'read'`, `'write'`, `'delete'`, etc.)
 * @prop scope - Optional scope qualifier (e.g. `'own'` vs `'any'`)
 */
export interface Permission {
  id: string
  resource: string
  action: string
  scope?: string
}

// ─── AUTH FLOW ─────────────────────────────────────────────────────────────────

/**
 * Shape of a successful auth response (Supabase sign-in).
 * Not used directly by Spine — the frontend uses `supabase.auth.signInWithPassword`
 * and then calls `fetchUserContext`; this type documents the underlying contract.
 */
export interface AuthResponse {
  user: User
  access_token: string
  refresh_token: string
  expires_in: number
}

/** Credentials for `supabase.auth.signInWithPassword` via `AuthContext.login`. */
export interface LoginCredentials {
  email: string
  password: string
}

/** Registration data for new user sign-up flows. */
export interface RegisterData {
  email: string
  password: string
  full_name: string
  account_name?: string
}
