# Spine Core Public API

**Stability:** Evolving (pre-1.0)  
**Version:** 0.1.0  

This document describes the stable API surface for building on Spine Core. These exports from `@core/_shared` are intended for use by custom code.

---

## Stability Levels

- **Stable** — Safe to use, won't change in minor versions
- **Evolving** — May change, backward compatibility maintained when possible
- **Internal** — Not for external use, subject to breaking changes

---

## Core Context & Authentication

### `createHandler`
**Stability:** Stable

Creates a type-safe API handler with built-in authentication, authorization, and logging.

```typescript
import { createHandler } from '@core/_shared'

export const handler = createHandler(async (event, ctx) => {
  // ctx.db is RLS-scoped to the authenticated user
  // ctx.principal contains user identity, roles, permissions
  return { data: await ctx.db.from('items').select('*') }
})
```

**Context Object:**
```typescript
interface CoreContext {
  db: SupabaseClient        // RLS-scoped database client
  principal: Principal     // Authenticated user info
  logger: Logger           // Structured logging
}
```

---

### `resolvePrincipal`
**Stability:** Stable

Resolves an API key or JWT to a principal with permissions.

```typescript
import { resolvePrincipal } from '@core/_shared'

const principal = await resolvePrincipal(apiKey, adminDb)
// Returns: { id, account_id, roles, permissions, ... }
```

---

## Webhook Registry

### `resolveHandler`
**Stability:** Evolving

Dynamically loads a webhook handler by name from the registry.

```typescript
import { resolveHandler } from '@core/_shared'

const handler = await resolveHandler('cortex-webhook')
if (handler) {
  await handler(event, context)
}
```

**Usage in custom code:** See `registerWebhookHandler` below.

---

### `registerWebhookHandler`
**Stability:** Evolving

Self-register a custom webhook handler at runtime.

```typescript
import { registerWebhookHandler } from '@core/_shared'

await registerWebhookHandler({
  name: 'my-handler',           // Unique identifier
  functionName: 'custom_my-handler',  // Netlify function name
  description: 'Handles X events',
  events: ['item.created', 'user.updated']
})
```

**Benefits:**
- No core code changes to add handlers
- Self-contained registration
- Runtime discovery

---

## Pipeline Engine

### `runPipeline`
**Stability:** Evolving

Execute a pipeline with the given input and context.

```typescript
import { runPipeline } from '@core/_shared'

const result = await runPipeline(pipelineId, {
  item_id: itemId,
  account_id: accountId,
  user_id: userId
}, context)
```

---

## Database

### `adminDb`
**Stability:** Stable

Service-role database client (bypasses RLS). Use with caution.

```typescript
import { adminDb } from '@core/_shared'

// For operations requiring elevated privileges
const { data } = await adminDb.from('system_config').select('*')
```

**⚠️ Warning:** Only use for cross-tenant operations or when RLS would block legitimate system actions.

---

### `joins`
**Stability:** Stable

Database query builders for common patterns.

```typescript
import { joins } from '@core/_shared'

// Joins with common filters applied
const query = joins.itemsWithAccounts(ctx.db)
```

---

## Permissions

### `checkPermission`
**Stability:** Evolving

Check if principal has permission for an action.

```typescript
import { checkPermission } from '@core/_shared'

const allowed = await checkPermission(ctx.principal, 'item', 'update', itemId)
```

---

### `sanitizeRecordData`
**Stability:** Evolving

Removes fields user cannot see based on permissions.

```typescript
import { sanitizeRecordData } from '@core/_shared'

const safeData = sanitizeRecordData(record, ctx.principal, 'read')
```

---

## App Manifest Utilities

### `loadManifest`
**Stability:** Evolving

Load and parse an app manifest.json file.

```typescript
import { loadManifest } from '@core/_shared'

const manifest = loadManifest('custom/apps/my-app/manifest.json')
// Returns: { name, slug, required_roles, routes, nav_items, ... }
```

---

### `mergeWithManifest`
**Stability:** Evolving

Merge database app record with manifest data.

```typescript
import { mergeWithManifest } from '@core/_shared'

const app = mergeWithManifest(dbRecord)
// Returns merged data with manifest taking precedence for metadata
```

---

## Audit & Logging

### `emitAudit`
**Stability:** Stable

Emit structured audit log entry.

```typescript
import { emitAudit } from '@core/_shared'

emitAudit({
  action: 'item.updated',
  target: { type: 'item', id: itemId },
  actor: ctx.principal.id,
  metadata: { fields_changed: ['status', 'assignee'] }
})
```

---

## Schema Utilities

### `validateSchema`
**Stability:** Evolving

Validate data against JSON schema.

```typescript
import { validateSchema } from '@core/_shared'

const { valid, errors } = validateSchema(data, schema)
```

---

## Agent Runner

### `runAgent`
**Stability:** Evolving

Execute an AI agent with context.

```typescript
import { runAgent } from '@core/_shared'

const result = await runAgent(agentId, {
  input: userMessage,
  context: { account_id, user_id }
})
```

---

## Trigger Engine

### `registerTrigger`
**Stability:** Evolving

Register a trigger handler.

```typescript
import { registerTrigger } from '@core/_shared'

registerTrigger({
  event: 'item.created',
  condition: { item_type: 'ticket' },
  action: { pipeline_id: 'notify-slack' }
})
```

---

## Type Exports

### `CoreContext`
**Stability:** Stable

```typescript
import type { CoreContext } from '@core/_shared'
```

### `Principal`
**Stability:** Stable

```typescript
import type { Principal } from '@core/_shared'
```

### `AppManifest`
**Stability:** Evolving

```typescript
import type { AppManifest, NavItem } from '@core/_shared'
```

### `WebhookHandlerRegistration`
**Stability:** Evolving

```typescript
import type { WebhookHandlerRegistration } from '@core/_shared'
```

---

## Usage Examples

### Custom API Endpoint

```typescript
// custom/functions/custom_my-endpoint.ts
import { createHandler, adminDb } from '@core/_shared'

export const handler = createHandler(async (event, ctx) => {
  const { data } = await ctx.db.from('my_items').select('*')
  return { data }
})
```

### Custom Webhook Handler

```typescript
// custom/functions/custom_slack-webhook.ts
import { createHandler, registerWebhookHandler, adminDb } from '@core/_shared'

export const handler = createHandler(async (event, ctx) => {
  // Handle webhook
  return { status: 'processed' }
})

// Self-register
registerWebhookHandler({
  name: 'slack-webhook',
  functionName: 'custom_slack-webhook',
  description: 'Posts to Slack',
  events: ['item.created']
}, adminDb)
```

### Using Manifest

```typescript
// In a custom app component
import { loadManifest } from '@core/_shared'

const manifest = loadManifest('custom/apps/my-app/manifest.json')
console.log(manifest.required_roles) // ['member', 'operator']
```

---

## Breaking Changes Policy

- **Stable APIs:** No breaking changes within major version
- **Evolving APIs:** Breaking changes announced in release notes, 1 version deprecation
- **Internal APIs:** No guarantees, may break anytime

---

## Version History

### 0.1.0 (Current)
- Initial public API surface
- Webhook registry pattern (evolving)
- App manifest utilities (evolving)
- Pipeline engine access (evolving)

---

## See Also

- `docs/enterprise-framework-implementation-summary.md` — Architecture overview
- `.framework/functions/_shared/index.ts` — Source of truth for exports
- `docs/framework-developer-guide.md` — Developer guide (coming soon)
