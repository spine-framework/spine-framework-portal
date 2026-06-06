/**
 * @module src/lib/api
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Authenticated fetch wrapper and account context for all Spine frontend
 * API calls. Injects the Supabase JWT and `X-Account-Id` header into every
 * request made via `apiFetch`.
 *
 * **Account context** is a module-level singleton set once after login:
 * ```ts
 * setAccountId(ctx.account_id) // called in AuthContext after auth.context()
 * ```
 * All subsequent `apiFetch` calls include `X-Account-Id` automatically.
 *
 * INVARIANT: Call `setAccountId` before making any authenticated API requests.
 *   If `_accountId` is null, the backend may reject scoped requests.
 *
 * @seeAlso src/lib/supabase.ts (supabase client used for getSession)
 * @seeAlso src/hooks/useApi.ts (wraps apiFetch with React state management)
 * @seeAlso src/contexts/AuthContext.tsx (calls setAccountId after login)
 */

import { supabase } from './supabase'

// ─── ACCOUNT CONTEXT ─────────────────────────────────────────────────────────

let _accountId: string | null = null

/**
 * Sets the module-level account ID injected into all subsequent `apiFetch`
 * calls as `X-Account-Id`. Pass `null` to clear (e.g. on logout).
 *
 * @param id - UUID of the active account, or null to clear
 * @sideEffects Mutates module-level `_accountId`
 * @calledBy src/contexts/AuthContext.tsx (after successful login)
 */
export function setAccountId(id: string | null) {
  _accountId = id
}

/**
 * Returns the currently active account ID, or null if not set.
 *
 * @returns UUID string or null
 * @sideEffects none
 * @calledBy src/hooks/useApi.ts, any component needing the current account scope
 */
export function getAccountId(): string | null {
  return _accountId
}

// ─── INTERNAL HELPERS ─────────────────────────────────────────────────────────

/**
 * Normalises any `HeadersInit` variant to a plain `Record<string, string>`
 * so headers can be safely spread and merged.
 * @throws never
 */
function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
   if (!headers) return {}

   if (headers instanceof Headers) {
     return Object.fromEntries(headers.entries())
   }

   if (Array.isArray(headers)) {
     return Object.fromEntries(headers)
   }

   return Object.fromEntries(
     Object.entries(headers).map(([key, value]) => [key, String(value)])
   )
 }

// ─── AUTH HEADERS ─────────────────────────────────────────────────────────────────

/**
 * Builds the auth header map for a request: `Authorization: Bearer <jwt>`
 * and, if set, `X-Account-Id: <accountId>`.
 *
 * Called internally by `apiFetch` — do not call directly unless constructing
 * a manual `fetch` outside of `apiFetch`.
 *
 * @returns Plain header object; empty if no active session
 * @throws never — missing session returns empty headers, not an error
 * @sideEffects DB read: supabase.auth.getSession (reads localStorage)
 * @calledBy apiFetch
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  if (_accountId) {
    headers['X-Account-Id'] = _accountId
  }

  return headers
}

// ─── FETCH WRAPPER ────────────────────────────────────────────────────────────────

/**
 * Authenticated fetch wrapper. Injects `Authorization` + `X-Account-Id`
 * headers, strips invalid Bearer values (`null`/`undefined`/empty), and
 * forwards all other options (including `signal` for AbortController).
 *
 * Use this for ALL Spine API calls from the frontend. Never call `fetch`
 * directly for API routes.
 *
 * @param path - API path, e.g. `'/.netlify/functions/items'`
 * @param options - Standard `RequestInit` options (method, body, signal, etc.)
 * @returns Raw `Response` — callers must check `response.ok` / status
 * @throws Network errors from `fetch` (e.g. `TypeError: Failed to fetch`)
 * @inputSpec path: string — relative URL to a Netlify function
 * @inputSpec options.signal: AbortSignal | undefined — forwarded for cancellation
 * @outputSpec Response — with auth headers injected; not yet parsed
 * @sideEffects Network request; reads localStorage via getAuthHeaders
 * @calledBy src/hooks/useApi.ts, useEntityList.ts, useEntityRecord.ts
 *
 * @example
 * ```ts
 * const res = await apiFetch('/.netlify/functions/items?action=list')
 * if (!res.ok) throw new Error(await res.text())
 * const { data } = await res.json()
 * ```
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  console.log('apiFetch called with:', { path, options, signal: options.signal })
  const authHeaders = await getAuthHeaders()
  const optionHeaders = normalizeHeaders(options.headers)
  const optionAuthorization = optionHeaders.Authorization || optionHeaders.authorization

  if (
    optionAuthorization &&
    ['Bearer null', 'Bearer undefined', 'null', 'undefined', ''].includes(optionAuthorization.trim())
  ) {
    delete optionHeaders.Authorization
    delete optionHeaders.authorization
  }

  const fetchOptions = {
    ...options,
    headers: {
      ...authHeaders,
      ...optionHeaders,
    },
  }
  console.log('apiFetch final options:', { fetchOptions, signal: fetchOptions.signal })
  return fetch(path, fetchOptions)
}
