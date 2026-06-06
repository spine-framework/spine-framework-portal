/**
 * @module index
 * @audience installer
 * @layer shared-core
 * @stability stable
 *
 * Spine v2 Core — Public Import Surface
 *
 * This is the **single, stable entry point** for all custom code importing
 * Spine core functionality. Everything exported here is a committed contract.
 * Internal helpers not listed here are free to change without notice.
 *
 * ## Usage
 *
 * ### In custom functions (v2-custom/functions/)
 * ```ts
 * import { runPipeline, adminDb, SYSTEM_PRINCIPAL, CoreContext } from '../_shared'
 *
 * const ctx: CoreContext = {
 *   principal: SYSTEM_PRINCIPAL,
 *   accountId: myAccountId,
 *   db: adminDb,
 *   requestId: crypto.randomUUID()
 * }
 * const result = await runPipeline(pipelineId, triggerData, ctx)
 * ```
 *
 * ### In CLI commands
 * ```ts
 * import { runPipeline, adminDb, resolvePrincipal, CoreContext } from '../functions/_shared'
 * ```
 *
 * ### Stability contract
 * - All exports in this file are stable across patch and minor versions
 * - Breaking changes require a major version bump and migration guide
 * - Do NOT import from individual `_shared/*.ts` files directly — use this index
 *
 * @seeAlso middleware.ts (CoreContext, createHandler, HTTP helpers)
 * @seeAlso principal.ts (Principal interface, SYSTEM_PRINCIPAL, resolvePrincipal)
 * @seeAlso db.ts (adminDb, getUserDb, joins)
 * @seeAlso pipeline-runner.ts (runPipeline, ExecutionResult)
 * @seeAlso trigger-engine.ts (fire*Triggers, EventType)
 * @seeAlso agent-runner.ts (runAgent, AgentConfig, InferenceResult)
 * @seeAlso permissions.ts (PermissionEngine, sanitizeRecordData)
 * @seeAlso schema-utils.ts (generateValidationSchema, ValidationSchema)
 * @seeAlso audit.ts (emitAudit)
 */

// ============================================
// Context — Execution context types
// ============================================

/**
 * CoreContext — the minimal execution context accepted by all Spine core functions.
 * Construct one directly for import/CLI usage; API handlers get it from createHandler().
 *
 * @example
 * ```ts
 * const ctx: CoreContext = {
 *   principal: SYSTEM_PRINCIPAL,
 *   accountId: 'uuid-here',
 *   db: adminDb,
 *   requestId: crypto.randomUUID()
 * }
 * ```
 */
export type { CoreContext } from './middleware'

/**
 * RequestContext — CoreContext extended with HTTP-specific fields.
 * Only needed if you are writing an API handler function.
 */
export type { RequestContext, HandlerFunction, HandlerResult } from './middleware'

/**
 * createHandler — wraps a handler function with auth, principal resolution, and audit.
 * Use this when writing Netlify function handlers.
 */
export { createHandler, requireUserContext, requireSystemContextWithAudit, json, error as errorResponse, cors } from './middleware'

// ============================================
// Identity — Principal model
// ============================================

/**
 * Principal — unified identity for all actors (humans, machines, cron, triggers).
 */
export type { Principal } from './principal'

/**
 * resolvePrincipal — resolves a Principal from an incoming HTTP event.
 * Used in custom handler wrappers.
 */
export { resolvePrincipal } from './principal'

/**
 * isSystemAdmin — returns true if principal has the system_admin role.
 */
export { isSystemAdmin } from './principal'

/**
 * machineHasScope — checks whether a machine principal has a given scope.
 * Supports wildcards: "items:*", "*:*".
 */
export { machineHasScope, humanHasRole } from './principal'

/**
 * getPrincipalDb — returns the appropriate DB client for a principal.
 * Humans get RLS-scoped client; machines get adminDb.
 */
export { getPrincipalDb } from './principal'

/**
 * formatPrincipalForAudit — structures a principal for audit log metadata.
 */
export { formatPrincipalForAudit } from './principal'

/**
 * ANONYMOUS_PRINCIPAL — static principal for unauthenticated requests.
 */
export { ANONYMOUS_PRINCIPAL } from './principal'

/**
 * SYSTEM_PRINCIPAL — static principal for internal system operations.
 * Use this when constructing a CoreContext for CLI or import usage without
 * a real authenticated user.
 */
export { SYSTEM_PRINCIPAL } from './principal'

// ============================================
// Database — Supabase clients
// ============================================

/**
 * adminDb — Supabase service_role client. Bypasses RLS.
 * Use for system operations, migrations, machine principal actions.
 */
export { adminDb } from './db'

/**
 * getUserDb — Returns a JWT-scoped Supabase client with RLS enforced.
 * Use for human-principal requests.
 */
export { getUserDb } from './db'

/**
 * joins — PostgREST relationship hint strings for common FK relationships.
 * @example `.select(\`*, \${joins.type}, \${joins.app}\`)`
 */
export { joins } from './db'

export type { DbResult } from './db'

// ============================================
// Pipeline Runtime
// ============================================

/**
 * runPipeline — execute a pipeline by ID with trigger data.
 *
 * @param pipelineId - UUID of the pipeline to run
 * @param triggerData - Arbitrary data passed to all pipeline stages
 * @param ctx - CoreContext (principal + accountId + db + requestId)
 * @returns ExecutionResult with per-stage output and final status
 * @throws If pipeline not found or inactive
 *
 * @example API handler
 * ```ts
 * const result = await runPipeline(body.pipeline_id, body.data, ctx)
 * ```
 *
 * @example Custom import
 * ```ts
 * import { runPipeline, adminDb, SYSTEM_PRINCIPAL } from '../_shared'
 * const ctx = { principal: SYSTEM_PRINCIPAL, accountId, db: adminDb, requestId: crypto.randomUUID() }
 * const result = await runPipeline('uuid', { item_id: '...' }, ctx)
 * ```
 *
 * @example CLI
 * ```bash
 * spine pipelines run <pipeline-id> --data '{"item_id":"..."}'
 * ```
 */
export { runPipeline } from './pipeline-runner'
export type { ExecutionResult, StageResult } from './pipeline-runner'

// ============================================
// Trigger Engine
// ============================================

/**
 * checkAndFireTriggers — evaluate and fire all active triggers matching an event.
 *
 * @param eventType - e.g. 'item_created', 'account_updated'
 * @param entityType - table name string
 * @param entityId - UUID of the affected entity
 * @param entityData - full entity data for condition evaluation
 * @param ctx - CoreContext
 *
 * @example
 * ```ts
 * await checkAndFireTriggers('item_created', 'items', item.id, item, ctx)
 * ```
 */
export { checkAndFireTriggers, fireCreateTriggers, fireUpdateTriggers, fireDeleteTriggers } from './trigger-engine'
export type { EventType } from './trigger-engine'

// ============================================
// Agent Runner
// ============================================

/**
 * runAgent — run AI agent inference for a user message in a thread.
 *
 * Resolves agent config from thread → agent → prompt_config chain,
 * assembles RAG context, calls LLM, handles tool dispatch and escalation.
 *
 * @param threadId - UUID of the thread
 * @param userMessage - The user's message text
 * @param ctx - CoreContext
 * @returns Saved agent message record
 *
 * @example
 * ```ts
 * const msg = await runAgent(threadId, 'How do I reset my password?', ctx)
 * ```
 */
export { runAgent, resolveAgentConfig } from './agent-runner'
export type { AgentConfig, InferenceResult, ToolCall, ToolResult } from './agent-runner'

// ============================================
// Permissions
// ============================================

/**
 * PermissionEngine — the single source of truth for all authorization.
 *
 * @example
 * ```ts
 * const canRead = await PermissionEngine.canAccessRecord(ctx, record, 'read')
 * const sanitized = await PermissionEngine.sanitizeRecordData(ctx, record, 'support_ticket')
 * ```
 */
export { PermissionEngine } from './permissions'
export type { PermissionResult } from './permissions'

// Legacy permission helpers (stable, bound to PermissionEngine instance)
export { sanitizeRecordData, validateUpdatePermissions, canAccessRecord } from './permissions'

// ============================================
// Schema Utilities
// ============================================

/**
 * generateValidationSchema — derive a structural validation schema from a design schema.
 * Called automatically on type create/update; also useful in custom code.
 */
export { generateValidationSchema } from './schema-utils'
export type { ValidationSchema } from './schema-utils'

// ============================================
// Audit
// ============================================

/**
 * emitAudit — emit a structured audit log entry with full principal provenance.
 *
 * @param ctx - CoreContext
 * @param action - e.g. 'items.create', 'pipeline.completed'
 * @param target - { type, id, account_id }
 * @param metadata - additional structured context
 *
 * @example
 * ```ts
 * await emitAudit(ctx, 'deal.stage_changed', { type: 'items', id: deal.id }, {
 *   before: { stage: 'prospect' },
 *   after: { stage: 'qualified' }
 * })
 * ```
 */
export { emitAudit } from './audit'

// ============================================
// Webhook Registry
// ============================================

/**
 * resolveHandler — dynamically load a webhook handler by name.
 *
 * Used by integration-routes.ts to resolve handlers at runtime
 * without static imports, enabling custom handlers to self-register.
 *
 * @param handlerName — The handler identifier from webhook_handlers table
 * @returns Handler function or null if not found
 *
 * @example
 * ```ts
 * const handler = await resolveHandler('cortex-webhook')
 * if (handler) await handler(event, context)
 * ```
 */
export { resolveHandler, lookupHandler, loadHandler } from './webhook-registry'

/**
 * registerWebhookHandler — self-register a custom webhook handler.
 *
 * Use in custom Netlify functions to register as webhook handlers
 * without modifying core code.
 *
 * @param config — Handler registration details
 *
 * @example
 * ```ts
 * import { registerWebhookHandler } from '@core/_shared'
 * import { adminDb } from '@core/_shared'
 *
 * registerWebhookHandler({
 *   name: 'my-handler',
 *   functionName: 'custom_my-handler',
 *   events: ['item.created']
 * }, adminDb)
 * ```
 */
export { registerWebhookHandler, deregisterWebhookHandler, isHandlerRegistered } from './webhook-registration'
export type { WebhookHandlerRegistration } from './webhook-registration'

// ============================================
// App Manifest Utilities
// ============================================

/**
 * loadManifest — load and parse an app manifest.json file.
 *
 * Used by apps.ts to merge database records with file-based
 * app configuration (name, routes, nav_items, required_roles).
 *
 * @param manifestPath — Path to manifest.json relative to project root
 * @returns Parsed AppManifest or null if not found/invalid
 *
 * @example
 * ```ts
 * const manifest = loadManifest('custom/apps/cortex/manifest.json')
 * console.log(manifest.required_roles) // ['member']
 * ```
 */
export { loadManifest, mergeWithManifest, clearManifestCache, discoverManifests } from './app-manifest'
export type { AppManifest, NavItem } from './app-manifest'

// ============================================
// Testing Utilities
// ============================================

/**
 * Testing utilities for custom code developers.
 *
 * Use these helpers to test your custom functions without
 * full deployment. Includes mock contexts, principals, and
 * assertion helpers.
 *
 * @example
 * ```ts
 * import { makeTestContext, mockPrincipal, cleanup } from '@core/testing'
 *
 * describe('My Handler', () => {
 *   const ctx = makeTestContext({
 *     principal: mockPrincipal({ roles: ['member'] })
 *   })
 * })
 * ```
 */
export {
  makeTestContext,
  mockPrincipal,
  mockLogger,
  mockEvent,
  mockNetlifyContext,
  cleanup,
  setupTests,
  expectSuccessResponse,
  expectErrorResponse
} from './testing'
export type { TestContext, TestPrincipal, TestLogger } from './testing'
