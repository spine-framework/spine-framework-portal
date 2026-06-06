# Spine Developer Guides

Guides for building custom apps, functions, and components on Spine Core.

## Guides

| Guide | What it covers |
|-------|---------------|
| [01-create-an-app.md](./01-create-an-app.md) | Scaffold, configure, and register a new custom app |
| [02-create-a-function.md](./02-create-a-function.md) | Write a custom Netlify function using core utilities |
| [03-create-a-component.md](./03-create-a-component.md) | Build a React component inside a custom app |
| [04-webhook-handlers.md](./04-webhook-handlers.md) | Register a webhook handler without touching core |
| [05-testing.md](./05-testing.md) | Test custom code using the core test harness |

## Architecture in One Sentence

> **Core provides mechanism. Custom provides data.**

Core never imports from `custom/`. Custom code imports from core using the `@core` alias.

## Key Paths

| Path | Purpose |
|------|---------|
| `custom/apps/{slug}/` | Your app lives here |
| `custom/apps/{slug}/manifest.json` | App metadata, routes, roles |
| `custom/apps/{slug}/index.tsx` | React entry point |
| `custom/apps/{slug}/components/` | App-specific components |
| `custom/functions/` | Custom Netlify functions |
| `.framework/functions/_shared/` | Core utilities (import via `@core/_shared`) |

## Quick Start

```bash
# 1. Scaffold a new app (creates files + registers in DB)
npm run spine-framework create-app my-app -- --name "My App" --role member

# 2. Assemble and run
npm run assemble && netlify dev
```
