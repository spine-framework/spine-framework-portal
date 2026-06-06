# Spine Import Guide

Custom code in `v2-custom/functions/` can import Spine core functions directly, bypassing HTTP entirely. This is the **primary interface for agentic IDEs** — no HTTP calls, no auth tokens, full access to the execution engine.

---

## The Import Surface

All stable exports are available from a single entry point:

```ts
import { ... } from '../_shared/index.ts'
```

> **Do not** import from individual `_shared/*.ts` files directly. Only `index.ts` is a committed contract.

---

## CoreContext

Every core function accepts a `CoreContext` — the minimal execution context:

```ts
import {
  CoreContext,
  adminDb,
  SYSTEM_PRINCIPAL,
  runPipeline
} from '../_shared/index.ts'

const ctx: CoreContext = {
  principal: SYSTEM_PRINCIPAL,     // who is performing the action
  accountId: 'uuid-of-account',    // account scope (null for system-level)
  db: adminDb,                     // database client
  requestId: crypto.randomUUID()   // for audit logs
}
```

### Constructing a human principal context

When a custom function is invoked by a user:

```ts
import {
  CoreContext,
  getPrincipalDb,
  resolvePrincipal
} from '../_shared/index.ts'

export const handler = async (event: any) => {
  const principal = await resolvePrincipal(event)
  const db = getPrincipalDb(principal)

  const ctx: CoreContext = {
    principal,
    accountId: principal.accountId,
    db,
    requestId: crypto.randomUUID()
  }

  // Now call any core function
  const result = await runPipeline(pipelineId, data, ctx)
  return { data: result, error: null }
}
```

---

## runPipeline

Execute a pipeline by ID:

```ts
import { runPipeline, CoreContext } from '../_shared/index.ts'

const result = await runPipeline(
  'pipeline-uuid',          // pipeline ID
  { item_id: 'abc123' },    // trigger data — passed to all stages
  ctx                       // CoreContext
)

// result: ExecutionResult
console.log(result.status)          // 'completed' | 'failed' | 'cancelled'
console.log(result.stages)          // StageResult[] with per-stage output
console.log(result.durationMs)      // total execution time
```

---

## checkAndFireTriggers

Fire triggers after an entity event:

```ts
import { fireCreateTriggers } from '../_shared/index.ts'

// After creating an item, fire all matching triggers
await fireCreateTriggers('items', item.id, item, ctx)

// Or use the full form for custom event types:
import { checkAndFireTriggers } from '../_shared/index.ts'
await checkAndFireTriggers('item_created', 'items', item.id, item, ctx)
```

---

## runAgent

Send a message to an AI agent thread:

```ts
import { runAgent } from '../_shared/index.ts'

const response = await runAgent(
  'thread-uuid',            // thread ID (must have an agent assigned)
  'How do I reset my password?',
  ctx
)

console.log(response.content)       // agent's reply text
```

---

## PermissionEngine

Check and enforce permissions in custom code:

```ts
import { PermissionEngine } from '../_shared/index.ts'

// Check if the principal can read a record
const canRead = await PermissionEngine.canAccessRecord(ctx, record, 'read')
if (!canRead) {
  return { data: null, error: 'Forbidden', statusCode: 403 }
}

// Sanitize a record — strips fields the principal cannot read
const safe = await PermissionEngine.sanitizeRecordData(ctx, record, 'support_ticket')

// Validate update data — rejects writes to restricted fields
const { valid, error } = await PermissionEngine.validateUpdatePermissions(ctx, updateData, existingRecord)
```

---

## emitAudit

Emit structured audit log entries from custom code:

```ts
import { emitAudit } from '../_shared/index.ts'

await emitAudit(ctx, 'deal.stage_changed', {
  type: 'items',
  id: deal.id,
  account_id: ctx.accountId ?? undefined
}, {
  changes: {
    before: { stage: 'prospect' },
    after: { stage: 'qualified' }
  }
})
```

---

## Available Exports Reference

| Export | Type | Description |
|---|---|---|
| `CoreContext` | interface | Minimal context for all core functions |
| `RequestContext` | interface | CoreContext + HTTP fields (for API handlers) |
| `createHandler` | function | Wraps a handler with auth + audit |
| `Principal` | interface | Unified identity for all actors |
| `SYSTEM_PRINCIPAL` | const | Static system-level principal |
| `ANONYMOUS_PRINCIPAL` | const | Unauthenticated principal |
| `resolvePrincipal` | function | Resolve Principal from HTTP event |
| `getPrincipalDb` | function | Get RLS-scoped DB client for principal |
| `adminDb` | const | Service-role Supabase client |
| `getUserDb` | function | JWT-scoped Supabase client |
| `runPipeline` | function | Execute a pipeline |
| `checkAndFireTriggers` | function | Fire matching triggers for an event |
| `fireCreateTriggers` | function | Fire `*_created` triggers |
| `fireUpdateTriggers` | function | Fire `*_updated` triggers |
| `fireDeleteTriggers` | function | Fire `*_deleted` triggers |
| `runAgent` | function | Run AI agent inference |
| `resolveAgentConfig` | function | Resolve agent config from thread |
| `PermissionEngine` | instance | Permission evaluation singleton |
| `generateValidationSchema` | function | Derive validation schema from design schema |
| `emitAudit` | function | Emit structured audit log |

See [`_shared/index.ts`](../../functions/_shared/index.ts) for full TSDoc on each export.
