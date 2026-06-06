/**
 * @module debug-auth
 * @audience core-contributor
 * @layer api-handler
 * @stability internal
 *
 * Development/diagnostic endpoint for verifying that authentication
 * middleware is resolving principals correctly. **Never expose this in
 * production without access controls.**
 *
 * **Routed by:** `GET /.netlify/functions/debug-auth`
 *
 * **Actions (via ?method):**
 * | ?method  | handler  | description                         |
 * |----------|----------|-------------------------------------|
 * | debug    | debug    | env check + principal presence      |
 * | testJwt  | testJwt  | validates JWT, returns principal ID |
 *
 * **Authorization:** None — intentionally unauthenticated so broken JWT
 * flows can be diagnosed. Reveals only presence/absence of env vars and
 * principal shape, never secret values.
 *
 * @seeAlso auth.ts (production auth context endpoint)
 * @seeAlso middleware.ts (createHandler — JWT resolution logic)
 */

import { createHandler } from './_shared/middleware'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

/**
 * Diagnostic snapshot: confirms the middleware is running and reports
 * whether a principal was resolved plus env var presence/absence.
 *
 * @returns `{ data: { message, hasPrincipal, principalType, requestId, envVars } }`
 * @sideEffects none
 * @calledBy handler (?method=debug or default)
 */
const debug = createHandler(async (ctx, _body) => {
  const envObj = (globalThis as any).process?.env || {}
  return {
    data: {
      message: 'Debug auth endpoint',
      hasPrincipal: !!ctx.principal,
      principalType: ctx.principal?.type || 'none',
      requestId: ctx.requestId,
      envVars: {
        supabaseUrl: envObj.SUPABASE_URL ? 'SET' : 'NOT_SET',
        supabaseAnonKey: envObj.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
      }
    }
  }
})

/**
 * Validates that the provided JWT was successfully decoded by middleware.
 * Returns principal type, id, and accountId on success.
 *
 * @returns `{ data: { tokenValid, principal } }` or `{ data: null, error: string }`
 * @sideEffects none
 * @calledBy handler (?method=testJwt)
 */
const testJwt = createHandler(async (ctx, _body) => {
  const envObj = (globalThis as any).process?.env || {}
  if (!ctx.principal) {
    return {
      data: null,
      error: 'No principal resolved from token'
    }
  }
  
  return {
    data: {
      tokenValid: true,
      principal: {
        type: ctx.principal.type,
        id: ctx.principal.id,
        accountId: ctx.accountId
      }
    }
  }
})

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

/**
 * Netlify function entry point. Routes by ?method (debug | testJwt),
 * defaulting to debug. Note: uses raw Netlify event/context signature
 * rather than `createHandler` wrapper to allow unauthenticated access.
 * @calledBy Netlify function routing (GET)
 */
export async function handler(event: any, context: any) {
  const method = event.queryStringParameters?.method || 'debug'
  
  const ctx = await createHandler(async (ctx, _body) => {
    switch (method) {
      case 'debug':
        return await debug(ctx, _body)
      case 'testJwt':
        return await testJwt(ctx, _body)
      default:
        return await debug(ctx, _body)
    }
  })(event, context)
  
  return ctx
}
