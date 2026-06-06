/**
 * @module trigger-engine
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Event-driven trigger dispatch system. API handlers call `fire*Triggers` after
 * a successful write to check whether any active triggers should fire. Matching
 * triggers cause `runPipeline` to be invoked with structured `triggerData`.
 *
 * Public surface:
 *   - `checkAndFireTriggers` — full trigger evaluation and firing loop
 *   - `fireCreateTriggers` — convenience wrapper for `*_created` events
 *   - `fireUpdateTriggers` — convenience wrapper for `*_updated` events
 *   - `fireDeleteTriggers` — convenience wrapper for `*_deleted` events
 *
 * Trigger condition evaluation (in order, all must pass):
 *   1. `config.entity_type` — exact match on entityType param
 *   2. `config.type_slug` — match on `entityData.type_slug` (items only)
 *   3. `config.filters` — field-level predicates with operators
 *      (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`)
 *
 * INVARIANT: trigger evaluation and firing errors are caught per-trigger —
 *   a single failing trigger never prevents other triggers from firing.
 * INVARIANT: `checkAndFireTriggers` never throws — all errors are caught
 *   and logged. Callers do not need to wrap in try/catch.
 * INVARIANT: `adminDb` (service role) is used for trigger lookups and stats
 *   updates; `runPipeline` then uses the passed `ctx` for stage execution.
 *
 * @seeAlso pipeline-runner.ts (runPipeline — called when a trigger fires)
 * @seeAlso audit.ts (emitAudit for trigger.fired / trigger.failed)
 * @seeAlso index.ts (fire*Triggers re-exported for v2-custom/ and CLI)
 */

import { CoreContext } from './middleware'
import { adminDb } from './db'
import { emitAudit } from './audit'
import { runPipeline } from './pipeline-runner'

// ─── TYPES ───────────────────────────────────────────────────────────────

/**
 * All entity lifecycle event types that triggers can subscribe to.
 *
 * Format: `<entity>_<lifecycle>` where entity is one of:
 * `item | account | person | thread | message | attachment | link`
 * and lifecycle is `created | updated | deleted`.
 *
 * @calledBy checkAndFireTriggers, fireCreateTriggers, fireUpdateTriggers,
 *   fireDeleteTriggers, all API handlers that write to these entity tables
 */
export type EventType = 
  | 'item_created' | 'item_updated' | 'item_deleted'
  | 'account_created' | 'account_updated' | 'account_deleted'
  | 'person_created' | 'person_updated' | 'person_deleted'
  | 'thread_created' | 'thread_updated' | 'thread_deleted'
  | 'message_created' | 'message_updated' | 'message_deleted'
  | 'attachment_created' | 'attachment_updated' | 'attachment_deleted'
  | 'link_created' | 'link_updated' | 'link_deleted'

/**
 * Trigger record shape as loaded from the `triggers` table.
 *
 * @inputSpec event_type: EventType string stored in triggers.event_type
 * @inputSpec pipeline_id: UUID — target pipeline to run when this trigger fires
 * @inputSpec config.filters: Record<string, any> — field-level predicates
 * @inputSpec config.entity_type: string | undefined — entity type filter
 * @inputSpec config.type_slug: string | undefined — item type slug filter
 */
interface Trigger {
  id: string
  name: string
  event_type: string
  pipeline_id: string
  config: {
    filters?: Record<string, any>
    entity_type?: string
    type_slug?: string
  }
  is_active: boolean
}

// ─── PRIMARY EXPORT ────────────────────────────────────────────────────────────

/**
 * Queries active triggers for `eventType`, evaluates each against the entity
 * data, and fires the associated pipeline for every matching trigger.
 *
 * Execution per trigger:
 *   1. `evaluateTriggerConditions` — all conditions must pass
 *   2. `runPipeline(trigger.pipeline_id, triggerData, ctx)` — fire pipeline
 *   3. Update `triggers.last_triggered` and increment `trigger_count` via RPC
 *   4. Emit `trigger.fired` audit log (or `trigger.failed` on error)
 *
 * `triggerData` passed to the pipeline:
 * ```json
 * {
 *   "event": "item_updated",
 *   "entity": { "type": "item", "id": "<uuid>", "data": {...} },
 *   "trigger": { "id": "<uuid>", "name": "My Trigger" },
 *   "fired_at": "2024-01-15T10:00:00.000Z"
 * }
 * ```
 *
 * @param eventType - The lifecycle event (e.g. 'item_updated')
 * @param entityType - The entity table name (e.g. 'item', 'person')
 * @param entityId - UUID of the entity that changed
 * @param entityData - Full record data for condition evaluation
 * @param ctx - CoreContext with requestId, accountId, and principal
 * @returns Promise<void> — always resolves; never throws
 * @throws never — all errors are caught per-trigger and logged
 * @inputSpec eventType: EventType — must be one of the 21 defined event types
 * @inputSpec entityId: string — UUID of the changed entity
 * @inputSpec entityData: any — full record (used for condition evaluation)
 * @outputSpec void
 * @sideEffects DB read: triggers table
 * @sideEffects DB write (per matching trigger): triggers.last_triggered, trigger_count
 * @sideEffects Calls runPipeline (per matching trigger) — which writes pipeline_executions
 * @sideEffects DB write: emitAudit (trigger.fired or trigger.failed per trigger)
 * @calledBy All API handlers after successful create/update/delete writes
 * @calledBy fireCreateTriggers, fireUpdateTriggers, fireDeleteTriggers
 * @calls evaluateTriggerConditions, runPipeline, emitAudit
 * @testUnit tests/unit/trigger-engine.test.ts
 * @testIntegration tests/integration/trigger-engine.test.ts
 *
 * @example
 * ```ts
 * // In an API handler after a successful item update:
 * await fireUpdateTriggers('item', updatedItem.id, updatedItem, ctx)
 * ```
 */
export async function checkAndFireTriggers(
  eventType: EventType,
  entityType: string,
  entityId: string,
  entityData: any,
  ctx: CoreContext
): Promise<void> {
  // Find matching active triggers
  const { data: triggers, error } = await adminDb
    .from('triggers')
    .select('*')
    .eq('event_type', eventType)
    .eq('is_active', true)
    .order('created_at')

  if (error) {
    console.error(`[${ctx.requestId}] Trigger query error:`, error)
    return
  }

  if (!triggers || triggers.length === 0) {
    return
  }

  // Evaluate each trigger's conditions
  for (const trigger of triggers) {
    try {
      const shouldFire = evaluateTriggerConditions(trigger, entityType, entityData)
      
      if (!shouldFire) {
        continue
      }

      // Prepare trigger data for pipeline
      const triggerData = {
        event: eventType,
        entity: {
          type: entityType,
          id: entityId,
          data: entityData
        },
        trigger: {
          id: trigger.id,
          name: trigger.name
        },
        fired_at: new Date().toISOString()
      }

      // Fire the pipeline
      const result = await runPipeline(trigger.pipeline_id, triggerData, ctx)

      // Update trigger statistics
      await adminDb
        .from('triggers')
        .update({
          last_triggered: new Date().toISOString(),
          trigger_count: adminDb.rpc('increment_trigger_count', { p_trigger_id: trigger.id })
        })
        .eq('id', trigger.id)

      await emitAudit(ctx, 'trigger.fired', {
        type: 'trigger',
        id: trigger.id,
        account_id: ctx.accountId ?? undefined
      }, {
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        pipeline_id: trigger.pipeline_id,
        execution_id: result.executionId,
        execution_status: result.status
      })

    } catch (error: any) {
      console.error(`[${ctx.requestId}] Trigger ${trigger.id} failed:`, error)
      
      await emitAudit(ctx, 'trigger.failed', {
        type: 'trigger',
        id: trigger.id,
        account_id: ctx.accountId ?? undefined
      }, {
        event_type: eventType,
        error: error.message
      })
    }
  }
}

// ─── CONDITION EVALUATION ───────────────────────────────────────────────────────────

/**
 * Returns true if all of a trigger's conditions match the entity event.
 *
 * Condition checks (in order):
 *   1. `config.entity_type` must equal `entityType` (if set)
 *   2. `config.type_slug` must equal `entityData.type_slug` (if set)
 *   3. Each `config.filters` key must match the entity field:
 *      - Array: value must be in the array
 *      - Object: `evaluateOperator` checks each `$op: expected` pair
 *      - Scalar: exact equality
 *
 * @param trigger - Trigger record with config
 * @param entityType - Entity table name from the calling handler
 * @param entityData - Full record data for field-level filter checks
 * @returns boolean — true if all conditions pass; false to skip this trigger
 * @throws never
 * @calledBy checkAndFireTriggers (per trigger in the matching set)
 * @calls getNestedValue, evaluateOperator
 */
function evaluateTriggerConditions(
  trigger: Trigger,
  entityType: string,
  entityData: any
): boolean {
  const config = trigger.config || {}

  // Check entity type filter
  if (config.entity_type && config.entity_type !== entityType) {
    return false
  }

  // Check type_slug filter (for items)
  if (config.type_slug && entityData?.type_slug !== config.type_slug) {
    return false
  }

  // Check custom filters
  if (config.filters) {
    for (const [key, expectedValue] of Object.entries(config.filters)) {
      const actualValue = getNestedValue(entityData, key)
      
      if (Array.isArray(expectedValue)) {
        // Array means "any of these values"
        if (!expectedValue.includes(actualValue)) {
          return false
        }
      } else if (typeof expectedValue === 'object' && expectedValue !== null) {
        // Object means operators: { $gt: 5, $lt: 10 }
        if (!evaluateOperator(actualValue, expectedValue)) {
          return false
        }
      } else {
        // Simple equality
        if (actualValue !== expectedValue) {
          return false
        }
      }
    }
  }

  return true
}

/**
 * Extracts a value from a nested object using dot-notation path.
 *
 * @param obj - Source object
 * @param path - Dot-separated key path (e.g. 'data.status', 'type_slug')
 * @returns The value at the path, or `undefined` if any segment is missing
 * @throws never
 * @calledBy evaluateTriggerConditions (filter key resolution)
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current?.[key]
  }, obj)
}

/**
 * Evaluates MongoDB-style operator conditions against an actual value.
 *
 * Supported operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`,
 * `$in`, `$nin`, `$exists`. Unknown operators return false.
 *
 * @param actual - Actual field value from the entity
 * @param operators - Object of `{ $op: expectedValue }` pairs
 * @returns boolean — true only if all operators pass
 * @throws never — warns on unknown operators
 * @inputSpec operators: Record<string, any> — all keys must start with `$`
 * @calledBy evaluateTriggerConditions (object filter branch)
 */
function evaluateOperator(actual: any, operators: Record<string, any>): boolean {
  for (const [op, expected] of Object.entries(operators)) {
    switch (op) {
      case '$eq':
        if (actual !== expected) return false
        break
      case '$ne':
        if (actual === expected) return false
        break
      case '$gt':
        if (!(actual > expected)) return false
        break
      case '$gte':
        if (!(actual >= expected)) return false
        break
      case '$lt':
        if (!(actual < expected)) return false
        break
      case '$lte':
        if (!(actual <= expected)) return false
        break
      case '$in':
        if (!Array.isArray(expected) || !expected.includes(actual)) return false
        break
      case '$nin':
        if (!Array.isArray(expected) || expected.includes(actual)) return false
        break
      case '$exists':
        const exists = actual !== undefined && actual !== null
        if (exists !== expected) return false
        break
      default:
        console.warn(`Unknown operator: ${op}`)
        return false
    }
  }
  return true
}

// ─── CONVENIENCE HELPERS ────────────────────────────────────────────────────────────

/**
 * Fires `<entityType>_created` triggers. Thin wrapper around
 * `checkAndFireTriggers` that constructs the correct EventType.
 *
 * @param entityType - Entity table name (e.g. 'item', 'person')
 * @param entityId - UUID of the newly created entity
 * @param entityData - The created record (for condition evaluation)
 * @param ctx - CoreContext
 * @returns Promise<void> — always resolves
 * @throws never
 * @sideEffects same as checkAndFireTriggers
 * @calledBy Any API handler's create path (e.g. items.ts, people.ts)
 * @calls checkAndFireTriggers
 * @testUnit tests/unit/trigger-engine.test.ts — 'fireCreateTriggers'
 */
export async function fireCreateTriggers(
  entityType: string,
  entityId: string,
  entityData: any,
  ctx: CoreContext
): Promise<void> {
  const eventType = `${entityType}_created` as EventType
  await checkAndFireTriggers(eventType, entityType, entityId, entityData, ctx)
}

/**
 * Fires `<entityType>_updated` triggers. Thin wrapper around
 * `checkAndFireTriggers` that constructs the correct EventType.
 *
 * @param entityType - Entity table name (e.g. 'item', 'person')
 * @param entityId - UUID of the updated entity
 * @param entityData - The updated record (for condition evaluation)
 * @param ctx - CoreContext
 * @returns Promise<void> — always resolves
 * @throws never
 * @sideEffects same as checkAndFireTriggers
 * @calledBy Any API handler's update path
 * @calls checkAndFireTriggers
 */
export async function fireUpdateTriggers(
  entityType: string,
  entityId: string,
  entityData: any,
  ctx: CoreContext
): Promise<void> {
  const eventType = `${entityType}_updated` as EventType
  await checkAndFireTriggers(eventType, entityType, entityId, entityData, ctx)
}

/**
 * Fires `<entityType>_deleted` triggers. Thin wrapper around
 * `checkAndFireTriggers` that constructs the correct EventType.
 *
 * @param entityType - Entity table name (e.g. 'item', 'person')
 * @param entityId - UUID of the deleted entity
 * @param entityData - The record snapshot before deletion (for condition evaluation)
 * @param ctx - CoreContext
 * @returns Promise<void> — always resolves
 * @throws never
 * @sideEffects same as checkAndFireTriggers
 * @calledBy Any API handler's delete path
 * @calls checkAndFireTriggers
 */
export async function fireDeleteTriggers(
  entityType: string,
  entityId: string,
  entityData: any,
  ctx: CoreContext
): Promise<void> {
  const eventType = `${entityType}_deleted` as EventType
  await checkAndFireTriggers(eventType, entityType, entityId, entityData, ctx)
}
