/**
 * @module audit
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Unified audit logging for all operations in Spine. Every state-changing
 * operation should call `emitAudit` to write a structured row to the `logs`
 * table with full principal provenance. Audit failures never throw — a failed
 * log write must never break the operation that triggered it.
 *
 * INVARIANT: always call `emitAudit` after a successful write, not before.
 *   Pass `result: 'failure'` only when the operation itself failed.
 * INVARIANT: never pass sensitive secrets (API keys, tokens) in metadata.
 *
 * @seeAlso principal.ts (formatPrincipalForAudit — shapes the principal field)
 * @seeAlso middleware.ts (CoreContext — ctx.requestId ties logs to HTTP requests)
 * @seeAlso logs.ts (API handler that queries the logs table)
 * @seeAlso permissions.ts (getPrincipalPermissionSummary — used in metadata)
 */

import { CoreContext } from './middleware'
import { adminDb } from './db'
import { Principal, formatPrincipalForAudit } from './principal'

// ─── PRIMARY AUDIT FUNCTION ───────────────────────────────────────────────────

// ─── CHUNK_START: SHARED_AUDIT_EMIT ──────────────────────────────────────────────
/**
 * @chunk-id    SHARED_AUDIT_EMIT_1_0_0
 * @version     1.0.0
 * @hash        d9c3dbc103f5f2f0543dc4c154bbad256e59c885643a20bc20ca07198eabd67c
 * @macro       Audit Log Emitter
 * @micro       Writes structured audit logs to logs table with principal provenance
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      action: string — Dot-namespaced action (e.g. 'items.create')
 * @inputs      target: {type, id?, account_id?} — Resource being acted upon
 * @inputs      metadata: {changes?, result?, error?, ...} — Optional context
 * @outputs     void — Always resolves, never rejects
 * @depends-on  [adminDb, formatPrincipalForAudit]
 * @depended-by [All state-changing API functions, pipeline-runner, trigger-engine]
 * @side-effects [DB insert to logs table, console.error on failure]
 * @tags        audit, logging, security, compliance
 */
export async function emitAudit(
  ctx: CoreContext,
  action: string,
  target: { type: string; id?: string; account_id?: string },
  metadata?: {
    changes?: { before?: any; after?: any }
    result?: 'success' | 'failure' | 'denied'
    error?: string
    [key: string]: any
  }
): Promise<void> {
  try {
    // Use the RLS-scoped db from context, or fallback to adminDb
    const logDb = ctx.db || adminDb
    
    await logDb.from('logs').insert({
      level: metadata?.result === 'failure' || metadata?.result === 'denied' ? 'warning' : 'info',
      source: 'audit',
      message: `${action} by ${ctx.principal?.type || 'unknown'}:${ctx.principal?.id || 'anonymous'}`,
      metadata: {
        principal: ctx.principal ? formatPrincipalForAudit(ctx.principal) : null,
        action,
        target: {
          type: target.type,
          id: target.id,
          account_id: target.account_id || ctx.accountId
        },
        request_id: ctx.requestId,
        ...metadata
      },
      account_id: target.account_id || ctx.accountId || ctx.principal?.accountId || null
    })
  } catch (err) {
    console.error('Failed to emit audit log:', err)
    // Don't throw - audit failures shouldn't break operations
  }
}
// ─── CHUNK_END: SHARED_AUDIT_EMIT ────────────────────────────────────────────────

// ─── LEGACY EXPORTS ───────────────────────────────────────────────────────────

// ─── CHUNK_START: SHARED_AUDIT_EMIT_LOG ──────────────────────────────────────────────
/**
 * @chunk-id    SHARED_AUDIT_EMIT_LOG_1_0_0
 * @version     1.0.0
 * @hash        148fb1ce7badf1d3df08e2daa38bac4c084c94ba2f262c782c9df092a22890dd
 * @macro       Legacy Audit Log Wrapper
 * @micro       Backward compatibility wrapper around emitAudit
 * @inputs      ctx: CoreContext — Request context
 * @inputs      eventType: string — Action string (maps to emitAudit's action)
 * @inputs      target: {type, id} | undefined — Resource target
 * @inputs      changes: {before?, after?} | undefined — Change data
 * @inputs      metadata: Record<string, any> — Additional context
 * @outputs     void — Always resolves
 * @depends-on  [emitAudit]
 * @depended-by [Legacy code, should not be used in new code]
 * @side-effects [DB insert via emitAudit, console.error on failure]
 * @tags        audit, logging, legacy, wrapper, deprecated
 */
export async function emitLog(
  ctx: CoreContext,
  eventType: string,
  target?: { type: string; id: string },
  changes?: { before?: any; after?: any },
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await emitAudit(ctx, eventType, {
      type: target?.type || 'unknown',
      id: target?.id,
      account_id: ctx.accountId || undefined
    }, {
      changes,
      ...metadata
    })
  } catch (error) {
    console.error('Failed to emit log:', error)
    // Don't throw - logging failures shouldn't break operations
  }
}
// ─── CHUNK_END: SHARED_AUDIT_EMIT_LOG ────────────────────────────────────────────────

// ─── CHUNK_START: SHARED_AUDIT_EMIT_ACTIVITY ──────────────────────────────────────────────
/**
 * @chunk-id    SHARED_AUDIT_EMIT_ACTIVITY_1_0_0
 * @version     1.0.0
 * @hash        58e532a743fdae480ca24d311be66e82612477309270ec7462fd7dfd695d5282
 * @macro       Legacy Activity Logger
 * @micro       Wraps emitLog with activity. prefix for backward compatibility
 * @inputs      ctx: CoreContext — Request context
 * @inputs      type: string — Activity type (prefixed with 'activity.')
 * @inputs      details: Record<string, any> — Metadata context
 * @outputs     void — Always resolves
 * @depends-on  [emitLog]
 * @depended-by [Legacy code, should not be used in new code]
 * @side-effects [DB insert via emitLog → emitAudit, console.error on failure]
 * @tags        audit, logging, legacy, activity, deprecated
 */
export async function emitActivity(
  ctx: CoreContext,
  type: string,
  details: Record<string, any> = {}
): Promise<void> {
  await emitLog(ctx, `activity.${type}`, undefined, undefined, details)
}
// ─── CHUNK_END: SHARED_AUDIT_EMIT_ACTIVITY ────────────────────────────────────────────────
