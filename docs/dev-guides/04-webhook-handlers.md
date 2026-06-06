# Guide 04: Webhook Handlers

## What this guide covers

How to register a custom webhook handler that reacts to integration events without modifying core.

---

## How it works

Core's `integration-routes.ts` resolves webhook handlers dynamically from the `webhook_handlers` database table at runtime. Custom handlers self-register into that table — core never imports them directly.

```
Integration event arrives
  → core looks up handler name in webhook_handlers table
  → calls the registered Netlify function
  → your custom function runs
```

---

## Step 1: Create the handler function

```typescript
// custom/functions/custom_my-handler.ts
import { createHandler, registerWebhookHandler } from '@core/_shared'

// Self-register on cold start
registerWebhookHandler({
  name: 'my-handler',
  functionName: 'custom_my-handler',
  description: 'Handles item.created events from my integration',
  events: ['item.created', 'item.updated'],
})

export const handler = createHandler(async (event, ctx) => {
  const payload = ctx.body

  // payload.event   — event name e.g. 'item.created'
  // payload.data    — the item/record that triggered the event
  // ctx.principal   — the system or user that triggered it
  // ctx.db          — RLS-scoped database client

  console.log('Received event:', payload.event)

  // Do your work
  const { error } = await ctx.db
    .from('items')
    .insert({
      type_slug: 'my_log',
      data: { source_event: payload.event, source_id: payload.data?.id },
      account_id: ctx.principal.account_id,
    })

  if (error) throw error

  return { received: true }
})
```

---

## registerWebhookHandler options

```typescript
registerWebhookHandler({
  name: string           // Unique handler name — used to look up this handler
  functionName: string   // Netlify function name (must match the file prefix)
  description?: string   // Human-readable description
  events?: string[]      // Event names this handler responds to (informational)
})
```

Registration is idempotent — calling it multiple times (e.g. on every cold start) is safe. It upserts by `name`.

---

## Step 2: Register the handler in the database

The `registerWebhookHandler` call runs on cold start and writes to `webhook_handlers`. You can also seed it manually:

```sql
INSERT INTO webhook_handlers (name, function_name, description, events, is_active)
VALUES (
  'my-handler',
  'custom_my-handler',
  'Handles item.created events',
  '["item.created", "item.updated"]',
  true
)
ON CONFLICT (name) DO UPDATE
  SET function_name = EXCLUDED.function_name,
      is_active = EXCLUDED.is_active;
```

---

## Step 3: Route events to your handler

Integration routes look up the handler by name. To route an incoming webhook to your handler, the integration config should reference `"my-handler"` as the handler name. This is typically set in the `integrations` table or the integration's config payload.

---

## Step 4: Assemble and test

```bash
npm run assemble:functions

# Trigger manually (replace with your webhook payload)
curl -X POST http://localhost:8888/api/integration-routes \
  -H "Content-Type: application/json" \
  -d '{"handler": "my-handler", "event": "item.created", "data": {"id": "123"}}'
```

---

## Verify registration

```sql
SELECT name, function_name, events, is_active
FROM webhook_handlers
WHERE name = 'my-handler';
```

---

## Next steps

- [05-testing.md](./05-testing.md) — Test your handler with the core test harness
