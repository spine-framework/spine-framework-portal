# Spine

**A multi-tenant, event-driven operational OS for modern SaaS systems.**

Spine is not a CRM, a helpdesk, or a workflow tool. It is the operational nervous system underneath applications — the central coordination layer that handles identity, state machines, audit trails, event emission, automation, webhooks, semantic intelligence, and theming so that vertical products don't have to rebuild these primitives.

> See [docs/MANIFESTO.md](docs/MANIFESTO.md) for the full design philosophy.

## What Spine Knows

| Primitive | Not Domain-Specific |
|---|---|
| Accounts | Not "companies" or "clients" |
| Persons | Not "employees" or "candidates" |
| Workflow Items | Not "deals" or "jobs" |
| Events | Not "notifications" |
| Automation Rules | Not "zapier zaps" |
| Embeddings | Not "documents" |

Spine provides the operational backbone. Your vertical product provides the meaning.

## Architecture

- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui
- **API**: Netlify Functions (TypeScript)
- **Database**: Supabase Postgres + pgvector
- **Auth**: Supabase Auth (JWT) — browser handles login/session; all data access via API

### Core Principles

- **Event-driven**: Every state change produces an outbox event. Every event can trigger automations and webhooks.
- **Multi-tenant**: Every row scoped by `account_id`. Every request resolves person, account, and role context.
- **Automation-native**: Automation rules are first-class primitives with condition evaluation and action execution.
- **Audit-first**: Every write emits `audit_log` (before/after diff) and `activity_event` records. Nothing mutates silently.
- **AI-aware**: Multi-vector embeddings (pgvector) with auto-indexing on write and semantic search.
- **API-first**: Frontend never touches the database. All reads/writes go through Netlify Functions.
- **RBAC**: Two-tier — `account_role` (admin/operator/member) + `system_role` (system_admin/system_operator/support_operator).

## Modules

| Module | Description |
|---|---|
| **Identity & Tenancy** | Accounts, persons, profiles, memberships, invites, RBAC, auto-provisioning |
| **Workflow Engine** | Definitions, stage builder, items, kanban, stage transitions, automation rules |
| **Support** | Tickets, threaded messages, knowledge base articles |
| **Activity & Audit** | Append-only activity feed + immutable audit log |
| **Integrations** | Outbox events, webhook subscriptions, HMAC-signed deliveries with retry/backoff/dead-letter |
| **Automation** | Event-triggered rules with conditions, actions (transition, emit, webhook, update) |
| **Intelligence** | Multi-vector embeddings, auto-embed on write, semantic search UI |
| **Theming** | DB-stored tokens, 3 presets (Clean/Bold/Muted), live Theme Editor |

## Setup

> ### TODO
> - [ ] Enable **Leaked password protection** in Supabase: Dashboard → **Auth → Settings → Password security**.

### Prerequisites

- Node.js 18+
- Netlify CLI (`npm i -g netlify-cli`)
- Supabase project (with pgvector enabled)

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Database Setup

Apply migrations in order (001–016) via Supabase SQL editor or CLI:

```bash
# Each file in supabase/migrations/ should be applied sequentially
```

### Local Development

```bash
npm install
netlify dev
```

This starts:
- Vite dev server on port 5173
- Netlify Functions proxy on port 8888
- App at `http://localhost:8888`

New users are auto-provisioned on first login — no manual database setup required.

### Build

```bash
npm run build
```

## Project Structure

```
├── core/                         # Canonical Spine runtime (DO NOT EDIT)
│   ├── functions/               # 59 endpoint handlers
│   │   ├── _shared/              # Shared utilities (middleware, db, audit, etc.)
│   │   └── *.ts                  # Core API endpoints
│   └── src/                     # Core React frontend
│       ├── components/           # UI components (ui/, layout/, shared/, etc.)
│       ├── pages/                # Route pages (admin, portal, public)
│       ├── lib/                  # Utilities (api, auth, config, theme, etc.)
│       └── hooks/                # React hooks (useAuth, useCustomFields, etc.)
├── custom/                       # Your extensions (MODIFY FREELY)
│   ├── functions/               # Custom serverless functions (override/extend core)
│   └── src/                     # Custom frontend code
│       └── manifest/routes.ts   # Custom route + nav registrations
├── src/                         # Assembled frontend output (auto-generated, .gitignored)
├── netlify/functions/            # Assembled API output (auto-generated, .gitignored)
├── supabase/
│   └── migrations/              # 33 SQL migrations
├── scripts/
│   ├── assemble-functions.sh     # Merge core/functions + custom/functions
│   ├── assemble-frontend.sh     # Merge core/src + custom/src → src/
│   ├── build-manifest.sh         # Generate integrity hashes
│   └── verify-integrity.sh       # Verify core integrity
├── docs/
│   ├── MANIFESTO.md              # Design philosophy
│   ├── FRONTEND.md               # Frontend architecture
│   ├── EXTENDING.md              # Extension guide
│   └── API.md                    # API reference
├── netlify.toml
└── package.json
```

# Testing GIT flow