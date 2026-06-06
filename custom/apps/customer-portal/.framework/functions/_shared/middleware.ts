/**
 * @module middleware
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * HTTP handler factory and request context types for all Spine Netlify functions.
 * This module owns the boundary between raw HTTP events and the typed execution
 * context (`RequestContext`) used by every handler. It also provides guard
 * utilities (`requireUserContext`, `requireSystemContextWithAudit`) used to
 * enforce authentication at the top of handlers.
 *
 * The key invariant: `createHandler` always resolves a `Principal` via
 * `resolvePrincipal` before calling the inner handler. Handlers never receive
 * an unauthenticated context — anonymous requests are rejected at the wrapper.
 *
 * IMPORTANT: `result.data` is never unwrapped in `createHandler`. Handlers
 * return records directly. Unwrapping would collide with records that have a
 * `.data` JSONB column.
 *
 * @seeAlso principal.ts (resolvePrincipal, getPrincipalDb, isSystemAdmin)
 * @seeAlso audit.ts (emitAudit — called after every successful handler)
 * @seeAlso db.ts (adminDb, getUserDb — selected by getPrincipalDb)
 * @seeAlso index.ts (re-exports CoreContext, createHandler, requireUserContext)
 */

import { 
  Principal, 
  resolvePrincipal, 
  isSystemAdmin, 
  getPrincipalDb
} from './principal'
import { emitAudit } from './audit'

// ─── CONTEXT TYPES ───────────────────────────────────────────────────────────

/**
 * Minimal execution context passed to all Spine core functions.
 *
 * This is the canonical context for `pipeline-runner`, `trigger-engine`,
 * `agent-runner`, `audit`, and any custom code in `v2-custom/`. It contains
 * only what core logic needs: identity, account scope, and a DB client.
 *
 * `RequestContext` (used inside HTTP handlers) extends this with HTTP-specific
 * fields (`appId`, `query`). Direct importers and CLI callers construct
 * `CoreContext` directly without going through `createHandler`.
 *
 * @inputSpec principal: Principal — must be a resolved principal (not null)
 * @inputSpec accountId: string | null — null is allowed for system-level ops only
 * @inputSpec db: SupabaseClient — use adminDb for system ops, getUserDb for RLS
 * @inputSpec requestId: string — UUID; ties execution to audit log entries
 * @calledBy pipeline-runner.ts, trigger-engine.ts, agent-runner.ts, audit.ts,
 *   tests/integration/helpers.ts (makeTestCtx), cli/context.ts
 *
 * @example Import usage (v2-custom/)
 * ```ts
 * import { CoreContext, adminDb, SYSTEM_PRINCIPAL } from '../_shared/index'
 * const ctx: CoreContext = {
 *   principal: SYSTEM_PRINCIPAL,
 *   accountId: 'uuid-of-account',
 *   db: adminDb,
 *   requestId: crypto.randomUUID()
 * }
 * await runPipeline(pipelineId, data, ctx)
 * ```
 *
 * @example CLI usage
 * ```bash
 * # CLI constructs CoreContext from .xenv credentials automatically
 * spine pipelines run <pipeline-id>
 * ```
 */
export interface CoreContext {
  /** Resolved principal for this execution */
  principal: Principal
  /** Primary account scope — null for system-level operations */
  accountId: string | null
  /** Database client — use adminDb for system ops, getUserDb for RLS-scoped */
  db: any
  /** Unique ID for this execution (used in audit logs) */
  requestId: string
}

/**
 * HTTP-layer execution context — extends `CoreContext` with request-specific fields.
 *
 * Constructed inside `createHandler` after principal resolution. Not used by
 * core logic directly — core functions accept `CoreContext`. The extra fields
 * are available to handlers that need them (e.g., `query.action`, `appId`).
 *
 * @inputSpec appId: string | null — from `x-app-id` header; null if absent
 * @inputSpec query: Record<string, string> — parsed queryStringParameters from event
 * @calledBy All 19 API handler functions (as the first argument)
 * @seeAlso CoreContext (parent interface)
 */
export interface RequestContext extends CoreContext {
  /** App ID from `x-app-id` header — used for app-scoped operations */
  appId: string | null
  /** Parsed query string parameters from the Netlify event */
  query: Record<string, string>
  /** Request path from the Netlify event */
  requestPath: string
}

/**
 * Signature for all Spine HTTP handler functions.
 *
 * Every handler file exports a default that calls `createHandler(myHandler)`.
 * The `body` parameter is the parsed JSON body, or null for GET requests.
 *
 * @inputSpec ctx: RequestContext — fully resolved context; never null
 * @inputSpec body: any — parsed JSON body or null; undefined for GET requests
 * @outputSpec Promise<any> — return value is wrapped in `{ data: result }` by createHandler
 */
export type HandlerFunction = (ctx: RequestContext, body?: any) => Promise<any>

/**
 * Standard envelope shape returned by `createHandler` to the HTTP client.
 *
 * On success: `{ data: <handler result>, error: null, meta: { requestId, duration } }`
 * On error: `{ data: null, error: <message> }` with appropriate HTTP status code.
 *
 * @outputSpec data: any — handler return value, never unwrapped
 * @outputSpec error: string | undefined — error message; present only on failure
 * @outputSpec meta: object | undefined — requestId + duration on success
 */
export interface HandlerResult {
  data?: any
  error?: string
  meta?: any
}

// ─── HANDLER FACTORY ─────────────────────────────────────────────────────────

/**
 * Wraps a handler function with principal resolution, request parsing, audit
 * logging, and error handling. This is the entry point for every Netlify function.
 *
 * Execution flow:
 *   1. Detect nested calls (event already has requestId + principal) → pass through
 *   2. Generate `requestId`, parse headers, query params
 *   3. Call `resolvePrincipal(event)` → reject anonymous with 401
 *   4. Call `getPrincipalDb(principal)` → select correct DB client
 *   5. Build `RequestContext`, parse + merge body
 *   6. Call inner handler, measure duration
 *   7. Emit `request.<method>` audit log (account-scoped requests only)
 *   8. Return `json({ data: result, error: null, meta })` envelope
 *   9. On any thrown error → return `error(message, 500)`
 *
 * @param handler - The inner handler function implementing the route logic
 * @returns Netlify-compatible async function `(event, context) => Response`
 * @throws never — all errors are caught and returned as HTTP 500
 * @inputSpec handler: HandlerFunction — must return a Promise
 * @outputSpec Netlify Lambda response object with statusCode, headers, body
 * @sideEffects DB read: principal resolution (people, api_keys tables)
 * @sideEffects DB write: emitAudit to logs table (account-scoped requests only)
 * @calledBy Every function in functions/*.ts as the default export wrapper
 * @calls resolvePrincipal, getPrincipalDb, emitAudit, json, error
 * @testIntegration tests/integration/admin-data-accounts.test.ts
 *
 * @example API handler file pattern
 * ```ts
 * import { createHandler, RequestContext } from './_shared/middleware'
 * export const handler = createHandler(async (ctx: RequestContext, body) => {
 *   const action = ctx.query.action || 'list'
 *   if (action === 'list') return listItems(ctx)
 *   throw new Error(`Unknown action: ${action}`)
 * })
 * ```
 */
export function createHandler(handler: HandlerFunction) {
  return async (event: any, context: any) => {
    // Detect nested call: if event is already a RequestContext with a principal,
    // skip event parsing and call the raw handler directly
    if (event && event.requestId && event.principal) {
      return handler(event, context)
    }

    const requestId = crypto.randomUUID()
    const startTime = Date.now()
    
    try {
      // Parse headers
      const appId = event.headers?.['x-app-id'] || event.headers?.['X-App-Id']
      
      // Parse query string parameters
      const queryParams: Record<string, string> = {}
      if (event.queryStringParameters) {
        Object.assign(queryParams, event.queryStringParameters)
      }
      if (!queryParams.method && event.httpMethod) {
        queryParams.method = event.httpMethod
      }

      const principal = await resolvePrincipal(event)
      
      if (!principal || principal.id === 'anonymous') {
        return error('Authentication required', 401)
      }
      
      // Get RLS-scoped database client based on principal type
      const ctxDb = getPrincipalDb(principal)
      
      // Build request context
      const ctx: RequestContext = {
        requestId,
        principal,
        db: ctxDb,
        accountId: principal.accountId,
        appId: appId || null,
        query: queryParams,
        requestPath: event.path || '/',
      }
      
      // Parse body
      let body = null
      if (event.body) {
        try {
          body = JSON.parse(event.body)
        } catch (e) {
          return error('Invalid JSON in request body', 400)
        }
      }
      if (ctx.query.id) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          body = {}
        }
        if (!('id' in body)) {
          body.id = ctx.query.id
        }
      }
      
      // Capture request details for audit
      const httpMethod = event.httpMethod || queryParams.method || 'GET'
      const requestPath = event.path || '/'
      
      // Execute handler
      const result = await handler(ctx, body)
      const durationMs = Date.now() - startTime
      
      // Emit audit log for successful request
      if (ctx.accountId) {
        await emitAudit(ctx, `request.${httpMethod.toLowerCase()}`, {
          type: 'request',
          id: requestId,
          account_id: ctx.accountId
        }, {
          path: requestPath,
          method: httpMethod,
          duration_ms: durationMs,
          principal_type: principal.type,
          principal_id: principal.id,
          app_id: ctx.appId
        })
      }
      
      // Return success response.
      // Never unwrap result.data here — handlers return the record directly.
      // Using result.data would collide with records that have a .data JSONB column.
      return json({
        data: result,
        error: null,
        meta: {
          requestId,
          duration: durationMs
        }
      })
      
    } catch (err: any) {
      console.error(`[${requestId}] Handler error:`, err)
      const status = typeof err.statusCode === 'number' ? err.statusCode : 500
      return error(err.message || 'Internal server error', status)
    }
  }
}

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────

/**
 * Builds a JSON HTTP response object compatible with Netlify Functions.
 *
 * Always includes CORS headers permitting requests from any origin. Used
 * internally by `createHandler` and directly by handlers that need a custom
 * status code (e.g., 201 Created).
 *
 * @param data - Any JSON-serializable value to include as the response body
 * @param status - HTTP status code (default: 200)
 * @returns Netlify Lambda response object
 * @throws never
 * @inputSpec data: any — must be JSON-serializable; circular refs will throw at stringify
 * @inputSpec status: number — valid HTTP status code (default 200)
 * @outputSpec { statusCode, headers, body: string } — body is JSON.stringify(data)
 * @sideEffects none
 * @calledBy createHandler, error, cors, and directly by some handlers
 * @testUnit none — trivial; verified by integration tests on every request
 */
export function json(data: any, status: number = 200) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Account-Id, X-App-Id',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
    },
    body: JSON.stringify(data)
  }
}

/**
 * Builds a JSON error response with `{ data: null, error: message }` shape.
 *
 * Use this to return structured error responses from handlers. The message
 * is safe to surface to clients — do not pass internal error details.
 *
 * @param message - Human-readable error message safe to return to client
 * @param status - HTTP status code (default: 400)
 * @returns Netlify Lambda response object
 * @throws never
 * @inputSpec message: string — client-safe error description
 * @inputSpec status: number — HTTP status code (400, 401, 403, 404, 500)
 * @outputSpec { statusCode: status, body: '{"data":null,"error":"<message>"}' }
 * @sideEffects none
 * @calledBy createHandler (on caught errors), requireUserContext,
 *   requireSystemContextWithAudit, and many individual handlers
 */
export function error(message: string, status: number = 400) {
  return json({
    data: null,
    error: message
  }, status)
}

/**
 * Parses the JSON body from a Netlify event object.
 *
 * Returns `null` if there is no body. Throws a descriptive error on malformed
 * JSON so the error surfaces cleanly from `createHandler`'s catch block.
 *
 * @param event - Raw Netlify event object
 * @returns Parsed body object or null
 * @throws Error('Invalid JSON in request body') — when body is present but not valid JSON
 * @inputSpec event.body: string | null | undefined — raw JSON string from HTTP request
 * @outputSpec any — parsed JSON object, or null if no body
 * @sideEffects none
 * @calledBy Handlers that need body outside of createHandler's automatic parsing
 */
export function parseBody(event: any): any {
  if (!event.body) return null
  
  try {
    return JSON.parse(event.body)
  } catch (e) {
    throw new Error('Invalid JSON in request body')
  }
}

// ─── AUTH GUARDS ─────────────────────────────────────────────────────────────

/**
 * Overloaded guard that requires a resolved human principal with an account scope.
 *
 * **Overload 1 — wrapper:** wrap a handler to enforce auth before it runs.
 * **Overload 2 — inline:** call with `ctx` directly; returns an error response
 *   object if auth is missing, or `null` if auth is present (allowing the
 *   caller to do `const authErr = requireUserContext(ctx); if (authErr) return authErr`).
 *
 * Rejects requests where:
 *   - `ctx.principal` is absent
 *   - `ctx.principal.id === 'anonymous'`
 *   - `ctx.accountId` is null or empty (machine principals without an account)
 *
 * @inputSpec ctx or handler: RequestContext or HandlerFunction
 * @outputSpec HandlerFunction (overload 1) or HandlerResult | null (overload 2)
 * @throws Error('User context required') — in wrapper mode if not authenticated
 * @sideEffects none
 * @calledBy API handlers that require an authenticated human with account scope
 * @testIntegration tests/integration/isolation.test.ts
 *
 * @example Inline guard pattern (preferred)
 * ```ts
 * const authErr = requireUserContext(ctx)
 * if (authErr) return authErr
 * // ctx.principal and ctx.accountId are guaranteed non-null below here
 * ```
 *
 * @example Wrapper pattern
 * ```ts
 * export const handler = createHandler(requireUserContext(async (ctx, body) => {
 *   return listItems(ctx)
 * }))
 * ```
 */
export function requireUserContext(handler: HandlerFunction): HandlerFunction
export function requireUserContext(ctx: RequestContext): HandlerResult | null
export function requireUserContext(arg: HandlerFunction | RequestContext): HandlerFunction | HandlerResult | null {
  if (typeof arg === 'function') {
    const handler = arg
    return async (ctx: RequestContext, body?: any) => {
      if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
        throw new Error('User context (person and account) required')
      }
      return handler(ctx, body)
    }
  }

  const ctx = arg
  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    return error('User context (person and account) required', 403) as any
  }
  return null
}

/**
 * Overloaded guard that requires a `system_admin` principal.
 *
 * **Overload 1 — wrapper:** wrap a handler; throws if not system_admin.
 * **Overload 2 — inline:** call with `ctx`; returns error response or null.
 *   Also accepts an optional `triggeredBy` string to set on the context for
 *   audit trail chaining (e.g. pipeline execution ID).
 *
 * Rejects requests where:
 *   - `ctx.principal` is absent or anonymous
 *   - `ctx.principal` does not have the `system_admin` role
 *
 * @param arg - Handler to wrap, or RequestContext to validate inline
 * @param triggeredBy - Optional: ID of the triggering entity (set on ctx)
 * @returns HandlerFunction (overload 1) or HandlerResult | null (overload 2)
 * @throws Error('System context required') — in wrapper mode if not system_admin
 * @inputSpec ctx.principal.roles: string[] — must include 'system_admin'
 * @outputSpec HandlerFunction | HandlerResult | null
 * @sideEffects sets `ctx.triggeredBy` when validation passes (inline mode)
 * @calledBy system-cron.ts, pipeline-executions.ts, and admin-only handlers
 * @testIntegration tests/integration/isolation.test.ts
 *
 * @example Inline guard pattern
 * ```ts
 * const authErr = requireSystemContextWithAudit(ctx, 'cron-job-id')
 * if (authErr) return authErr
 * ```
 */
export function requireSystemContextWithAudit(handler: HandlerFunction): HandlerFunction
export function requireSystemContextWithAudit(ctx: RequestContext, triggeredBy?: string): HandlerResult | null
export function requireSystemContextWithAudit(
  arg: HandlerFunction | RequestContext,
  triggeredBy?: string,
): HandlerFunction | HandlerResult | null {
  if (typeof arg === 'function') {
    const handler = arg
    return async (ctx: RequestContext, body?: any) => {
      if (!ctx.principal || ctx.principal.id === 'anonymous') {
        throw new Error('Authentication required')
      }
      if (!isSystemAdmin(ctx.principal)) {
        throw new Error('System context required')
      }
      ;(ctx as any).triggeredBy = ctx.principal.id
      return handler(ctx, body)
    }
  }

  const ctx = arg
  if (!ctx.principal || ctx.principal.id === 'anonymous') {
    return error('Authentication required', 401) as any
  }
  if (!isSystemAdmin(ctx.principal)) {
    return error('System context required', 403) as any
  }
  ;(ctx as any).triggeredBy = triggeredBy || ctx.principal.id
  return null
}

// ─── UTILITY ─────────────────────────────────────────────────────────────────

/**
 * Returns a 200 JSON response for CORS preflight requests.
 *
 * Netlify automatically handles OPTIONS at the CDN level for most routes, but
 * handlers that need to explicitly handle OPTIONS can call this.
 *
 * @returns json({ message: 'CORS enabled' }, 200) with CORS headers
 * @throws never
 * @inputSpec none
 * @outputSpec Netlify Lambda response with CORS headers
 * @sideEffects none
 * @calledBy Handler files that explicitly handle OPTIONS method
 */
export function cors() {
  return json({ message: 'CORS enabled' }, 200)
}
