# Spine npm Packages Plan

**Created:** May 28, 2026  
**Version target:** 0.x (breaking change freedom until stable)  
**CLI standard:** All commands via `spine-framework` — no shorthand aliases  
**Status:** Planning  

---

## Goal

Publish Spine Core and its apps as independent npm packages that any developer or agentic IDE can install and run from scratch.

```bash
npm install spine-framework
spine-framework init                              # stand up DB schema + seed
spine-framework install-app spine-framework-cortex
spine-framework install-app spine-framework-portal
npm run assemble && netlify dev
```

---

## Package Model

### Three packages, one dependency direction

```
spine-framework                    ← core platform, no spine dependencies
spine-framework-cortex             → peerDep: spine-framework
spine-framework-portal             → peerDep: spine-framework
```

No cross-dependency between `spine-framework-cortex` and `spine-framework-portal`. Each is wholly self-sufficient.

### What each package contains

**spine-framework**
- Core DB schema (`000_foundation.sql`) and seed data (`001_seed.sql`)
- Core Netlify functions (auth, items, pipelines, accounts, people, webhooks, etc.)
- Core frontend shell (routing, auth context, AppShell, UI primitives, hooks)
- CLI (`spine-framework init`, `spine-framework create-app`, `spine-framework migrate`, etc.)
- Assembly scripts
- Public API surface (`_shared/index.ts`)

**spine-framework-cortex**
- Frontend: all Cortex pages, components, sidebar
- `manifest.json` — routes, roles, nav
- `seed/types.json` — type definitions Cortex needs upserted on install
- No DB migrations, no owned tables

**spine-framework-portal**
- Frontend: all Portal pages, components, sidebar
- `manifest.json` — routes, roles, nav
- `seed/types.json` — type definitions Portal needs upserted on install
- No DB migrations, no owned tables

### App data model principle

> Apps never touch DB structure. Apps upsert type records into core's `types` table using `design_schema` to define their data shape.

Cortex and Portal share the same core tables (`items`, `types`, `accounts`, `people`). They are independent — no imports between them.

---

## Phases

### Phase 1: Merge + Production Validation
**Goal:** Ship current state to prod, verify nothing is broken before forking.

**Checklist:**
- [ ] Migrations 014 (webhook registry) and 015 (apps table simplify) applied in prod
- [ ] All apps load correctly (manifest-driven routing works)
- [ ] Webhook registry doesn't break existing integrations
- [ ] Boundary check passes (`npm run test:boundary`)
- [ ] Demo site functional

**Branch:** `main`  
**Timeline:** Before demo (2 weeks)

---

### Phase 2: Fork for npm Work
**Goal:** Protect the stable demo branch while doing structural npm work.

**Actions:**
- Create branch `v0-npm-packages` from `main` after Phase 1 merges
- All Phases 3–6 happen on `v0-npm-packages`
- `main` remains the demo-stable branch
- Merge back only when end-to-end install story is verified

**Branch:** `v0-npm-packages`

---

### Phase 3: Migrations Audit + Foundation SQL
**Goal:** Single authoritative schema for a fresh install. The critical path item — nothing else in this plan works without it.

**Decisions to make before writing SQL:**
- [x] ~~Include `links` table in core?~~ **Resolved: yes.** `links` and `link_types` already exist in production with 21 rows. Goes in `000_foundation.sql`.
- [ ] Which types are core seed data vs app seed data? System roles yes. Default item types — draw the line.
- [ ] RLS policy audit — capture all policies explicitly (easily missed in schema dumps)
- [ ] ⚠️ `account_paths`, `test_runs`, `test_results` have RLS disabled — decide on policies before including in foundation SQL

**Deliverables:**
- [ ] Audit document: current live DB schema vs migration files — flag all drift
- [ ] `000_foundation.sql` — creates all core tables, indexes, constraints, RLS policies, functions, triggers in correct dependency order. **Confirmed tables (34 total):** `accounts`, `people`, `types`, `apps`, `roles`, `items`, `threads`, `messages`, `links`, `link_types`, `attachments`, `watchers`, `pipelines`, `pipeline_executions`, `triggers`, `trigger_executions`, `timers`, `ai_agents`, `embeddings`, `integrations`, `prompt_configs`, `api_keys`, `api_key_usage_logs`, `logs`, `actions`, `schedules`, `schedule_executions`, `account_paths`, `test_runs`, `test_results`, `item_progress`, `webhook_handlers`, `app_installations`, `embeddings`
- [ ] `001_seed.sql` — inserts: system roles, core link types (`account_signals`, `account_opportunities`), bootstrap data core needs to boot. **App-owned link types (`tagged_with`, `analyzed_by`) go in app seed, not here.**
- [ ] Old migrations moved to `archive/migrations/` with a `README` marking them historical

**Verification:**
```bash
# Must pass: blank Supabase project + run 000 + 001 = working app
spine-framework init   # runs 000_foundation.sql then 001_seed.sql
```

---

### Phase 4: Separate Core, Cortex, Portal
**Goal:** Each is an independently packageable unit with no cross-contamination.

**Core separation:**
- [ ] Verify `.framework/` has zero imports from `custom/`
- [ ] Verify `.framework/` has zero Cortex/Portal-specific references
- [ ] Boundary check extended to catch Cortex↔Portal cross-imports

**Cortex separation:**
- [ ] All Cortex frontend confirmed in `custom/apps/cortex/`
- [ ] Extract Cortex type definitions from live DB → `custom/apps/cortex/seed/types.json`
- [ ] Extract Cortex link types (`tagged_with`, `analyzed_by`) → `custom/apps/cortex/seed/link-types.json`
- [x] ~~Verify no Portal imports in Cortex~~ **Confirmed clean** (validated May 28, 2026)
- [x] ~~Verify Cortex imports only from `@core` and its own files~~ **Confirmed clean**

**Portal separation:**
- [ ] All Portal frontend confirmed in `custom/apps/customer-portal/`
- [ ] Extract Portal type definitions from live DB → `custom/apps/customer-portal/seed/types.json`
- [ ] Extract any Portal-owned link types → `custom/apps/customer-portal/seed/link-types.json`
- [x] ~~Verify no Cortex imports in Portal~~ **Confirmed clean** (validated May 28, 2026)
- [x] ~~Verify Portal imports only from `@core` and its own files~~ **Confirmed clean**

**End state directory map:**
```
spine-framework/          ← becomes the spine-framework npm package
  .framework/
    functions/
    src/
    migrations/
      000_foundation.sql
      001_seed.sql
    cli/

spine-framework-cortex/   ← becomes the spine-framework-cortex npm package
  manifest.json
  index.tsx
  components/
  pages/
  seed/
    types.json

spine-framework-portal/   ← becomes the spine-framework-portal npm package
  manifest.json
  index.tsx
  components/
  pages/
  seed/
    types.json
```

---

### Phase 5: npm Packages
**Goal:** Three publishable packages with working install flows.

**spine-framework package.json additions:**
```json
{
  "name": "spine-framework",
  "version": "0.1.0",
  "private": false,
  "bin": {
    "spine-framework": "./dist/cli/index.js"
  },
  "exports": {
    "./_shared": "./dist/functions/_shared/index.js",
    "./src/*": "./dist/src/*"
  }
}
```

**spine-framework-cortex / spine-framework-portal package.json:**
```json
{
  "name": "spine-framework-cortex",
  "version": "0.1.0",
  "private": false,
  "peerDependencies": {
    "spine-framework": ">=0.1.0"
  }
}
```

**CLI commands to build/verify:**

| Command | Description |
|---------|-------------|
| `spine-framework init` | Run 000 + 001 migrations against configured Supabase project |
| `spine-framework migrate` | Run pending migrations |
| `spine-framework install-app spine-framework-cortex` | Copy app files + upsert type seed records |
| `spine-framework uninstall-app spine-framework-cortex` | Remove app record + type seed records |
| `spine-framework create-app <slug>` | Scaffold a new custom app |
| `spine-framework status` | Show installed apps and migration state |

**Build pipeline:**
- [ ] Add `tsc` build step for functions and CLI → `dist/`
- [ ] Add Vite library mode build for frontend components → `dist/src/`
- [ ] Generate `.d.ts` type declarations
- [ ] `prepublishOnly` script runs build + boundary check + tests

**Registry:** GitHub Packages (private) first. Public npm only after end-to-end install verified.

---

### Phase 6: End-to-End Install Verification
**Goal:** Prove the install story works from a completely blank starting point. Must pass before any publish.

**Fresh install checklist:**
- [ ] Blank Supabase project (no existing schema)
- [ ] `npm install spine-framework`
- [ ] `spine-framework init` → DB schema created, seed data present, app boots
- [ ] Admin panel functional
- [ ] `spine-framework install-app spine-framework-cortex` → Cortex loads, type records seeded
- [ ] `spine-framework install-app spine-framework-portal` → Portal loads, type records seeded
- [ ] Both apps functional and independent
- [ ] `spine-framework create-app my-test` → scaffolds correctly
- [ ] `npm run assemble && netlify dev` → dev server runs cleanly

**This checklist is the publish gate. All items must pass.**

---

### Phase 7: Documentation
**Goal:** A developer or agentic IDE can go from zero to running in one session.

**Docs needed:**

| Document | Audience |
|----------|---------|
| Getting Started (from zero) | New developer / agentic IDE |
| `spine-framework init` walkthrough | Developer |
| Installing apps | Developer |
| Building a custom app | Developer (dev-guides already exist) |
| Core API reference | Developer (API.md exists, extend) |
| Upgrade guide | Existing Spine developer |
| Contributing to core | Core contributor |

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Version target | `0.x` | Breaking change freedom until stable |
| CLI namespace | `spine-framework` only | No shorthand aliases |
| App DB model | Type records only, no app-owned tables | Clean install, clean uninstall, no schema drift |
| Cortex ↔ Portal | Fully independent, no cross-imports | Each is self-sufficient |
| Shared type records | Both apps use same core tables | Core owns schema, apps own their type definitions |
| Registry | GitHub Packages (private) → npm (public) | Validate before exposing |
| Links table | **In core** — `links` + `link_types` in `000_foundation.sql` | Already live in production with 21 rows. `app_id` column on `link_types` distinguishes core vs app-owned relationship types. |
| App-owned link types | Seeded by app (`seed/link-types.json`), not by core | `tagged_with`, `analyzed_by` are Cortex-owned; `account_signals`, `account_opportunities` are core-owned |

---

## Open Questions

1. **Supabase project config** — How does `spine-framework init` know which Supabase project to target? `.env` file, interactive prompt, or CLI flag?
2. **Assembly in package model** — Does `assemble.sh` read from `node_modules/spine-framework-cortex/` after install, or does `install-app` copy files into `custom/apps/`? Copy is simpler and matches current model.
3. **Frontend build** — Does `spine-framework` ship pre-built frontend components (library mode) or source that gets assembled into the host project? Source + assemble matches current model and avoids Vite/React version conflicts.
4. **RLS on `account_paths`, `test_runs`, `test_results`** — These 3 tables have RLS disabled in production. Decide on policies before writing `000_foundation.sql`. Without policies, enabling RLS will block all access.

---

## Related Documents

- `docs/enterprise-framework-implementation-summary.md` — current state of enterprise framework work
- `docs/dev-guides/` — developer guides for building on Spine (Phases 3–7 prerequisite)
- `.framework/API.md` — public API surface
- `.framework/migrations/` — current migration files (to be audited in Phase 3)
- `scripts/boundary-check.sh` — architectural boundary enforcement
