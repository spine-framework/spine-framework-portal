/**
 * @module src/lib/supabase
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Browser-side Supabase client singleton and session helpers for the Spine
 * frontend. Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
 * Vite env at build time; throws immediately on missing values so
 * misconfigured builds fail loudly rather than silently.
 *
 * INVARIANT: `supabase` is a module-level singleton — do not call
 *   `createClient` again in components or hooks. Import this module instead.
 *
 * @seeAlso src/lib/api.ts (uses supabase.auth.getSession for apiFetch headers)
 * @seeAlso src/contexts/AuthContext.tsx (wraps supabase.auth for React state)
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// ─── CLIENT SINGLETON ─────────────────────────────────────────────────────────

/**
 * Browser-side Supabase client with persistent session, auto-refresh, and
 * URL-based session detection enabled. This is the only Supabase client
 * instance in the frontend; all auth and RLS-scoped queries flow through it.
 *
 * @inputSpec VITE_SUPABASE_URL: string — valid Supabase project URL
 * @inputSpec VITE_SUPABASE_ANON_KEY: string — anon (public) key
 * @throws Error('Missing Supabase environment variables') at module load if
 *   either env var is absent
 * @sideEffects Reads localStorage for persisted session on construction
 * @calledBy src/lib/api.ts (getAuthHeaders), src/contexts/AuthContext.tsx
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// ─── SESSION HELPERS ─────────────────────────────────────────────────────────

/**
 * Returns the current Supabase auth session, or `null` if unauthenticated.
 *
 * @returns Session object or null
 * @throws Supabase AuthError on unexpected failure
 * @sideEffects none (read-only)
 * @calledBy AuthContext.tsx, login flows
 */
export const getCurrentSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session
}

/**
 * Returns the currently authenticated Supabase user, or `null` if not signed in.
 *
 * @returns User object or null
 * @throws Supabase AuthError on unexpected failure
 * @sideEffects none (read-only)
 * @calledBy AuthContext.tsx
 */
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

/**
 * Forces a session token refresh. Call this when a request returns 401 due
 * to an expired JWT. Supabase auto-refresh normally handles this, but this
 * function is exposed for explicit refresh flows.
 *
 * @returns `{ session, user }` after refresh
 * @throws Supabase AuthError if refresh fails (e.g. refresh token expired)
 * @sideEffects Updates localStorage session via Supabase client
 * @calledBy AuthContext.tsx (manual token refresh)
 */
export const refreshSession = async () => {
  const { data, error } = await supabase.auth.refreshSession()
  if (error) throw error
  return data
}
