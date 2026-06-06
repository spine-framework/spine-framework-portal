# Spine v2 Assembly & Launch Process Guide

## Source Directories vs Served Directories

**Edit here (source of truth):**
- `v2-core/src/` — core frontend (all apps, components, hooks, pages)
- `v2-core/functions/` — core Netlify functions
- `v2-custom/src/` — custom frontend overrides (`custom_*.tsx` files only)
- `v2-custom/functions/` — custom function overrides (`custom_*.ts` files only)

**Never edit these (generated/assembled output):**
- `functions/` (repo root) — assembled and served by Netlify CLI
- `src/v2-assembled/` — assembled for prod builds only (not used in dev)

---

## Dev vs Prod

### Dev (`netlify dev`)

**Frontend** — not assembled. Vite serves `v2-core/` directly as its root:
```
vite.config.ts → root: 'v2-core'
```
`v2-custom/src/` is reachable via `server.fs.allow`, so `CustomAppLoader.tsx` loads
full custom app trees (e.g. `v2-custom/src/apps/customer-portal/`) via `import.meta.glob`
at runtime — no file copying needed for frontend in dev.

**Functions** — must be assembled. Netlify CLI serves functions from `functions/` at the
repo root (`netlify.toml [functions] directory = "functions"`). Run `npm run assemble:v2`
before starting dev whenever you add or change a function.

### Prod (`npm run build`)

`package.json` runs full assembly before the Vite build:
```
prebuild → npm run assemble:v2 && npm run verify
build    → tsc -b && vite build --config vite.config.ts
```

---

## Assembly: What `npm run assemble:v2` Does

Calls `scripts/assemble-v2.sh`, which runs these three steps **in order**:

**Step 1 — Custom overlay** (`scripts/assemble-v2-custom.sh`)
- Finds all `custom_*.tsx` files under `v2-custom/src/` → flat-copies into `v2-core/src/`
- Finds all `custom_*.ts` files under `v2-custom/functions/` → flat-copies into `v2-core/functions/`
- Files NOT named `custom_*` are ignored by assembly (but full app trees in `v2-custom/src/apps/`
  are still accessible to Vite dev server via `fs.allow`)

**Step 2 — Functions** 
- Wipes `functions/` (repo root)
- Copies `v2-core/functions/` → `functions/` (now includes any custom_*.ts from step 1)

**Step 3 — Frontend (prod only)**
- Wipes `src/v2-assembled/`
- Copies `v2-core/src/` → `src/v2-assembled/` (now includes any custom_*.tsx from step 1)
- Fixes `index.html` script path: `/src/main.tsx` → `./main.tsx`

The order matters: custom files must land in `v2-core/` **before** the root copy runs,
so they are included in the output in a single pass.

---

## Standard Dev Launch

```bash
# First time, or after adding/modifying any function:
npm run assemble:v2

# Start the dev server:
netlify dev
```

**What `netlify dev` does:**
1. Runs `scripts/netlify-dev-wrapper.sh` (via `netlify.toml [dev].command`)
2. Wrapper fires Vite directly: `exec node_modules/.bin/vite --config vite.config.ts`
3. Vite serves `v2-core/` on port 3001 with HMR
4. Netlify CLI proxies port 8888 → 3001 and serves `functions/` (repo root)

---

## Process Management

```bash
# Check ports
lsof -i:3001   # Vite
lsof -i:8888   # Netlify proxy

# Kill both
pkill -f vite && pkill -f netlify

# Clean restart
pkill -f vite && pkill -f netlify && sleep 1 && netlify dev
```

---

## Troubleshooting

### Function returning 404
`functions/` (repo root) is stale or missing the new function. Reassemble then restart:
```bash
npm run assemble:v2
# restart netlify dev
```

### `custom_*.tsx` override not taking effect
Reassemble so the file lands in `v2-core/src/`:
```bash
npm run assemble:v2
```
Vite HMR picks it up automatically if the dev server is already running.

### Vite never binds to port 3001
`npm run dev` and `npx vite` silently hang under Netlify CLI. The wrapper must use the
direct binary. Verify `scripts/netlify-dev-wrapper.sh` contains:
```bash
exec "$PROJECT_ROOT/node_modules/.bin/vite" --config "$PROJECT_ROOT/vite.config.ts"
```
Never change this to `npm run dev` or `npx vite`.

---

## Key Files

| File | Role |
|---|---|
| `scripts/assemble-v2.sh` | Full assembly orchestrator — runs steps 1→2→3 |
| `scripts/assemble-v2-custom.sh` | Step 1: overlays `custom_*` files into `v2-core/` |
| `scripts/netlify-dev-wrapper.sh` | Dev entry point — fires Vite binary directly |
| `netlify.toml` | `[dev].command` → wrapper; `[functions] directory = "functions"` |
| `vite.config.ts` | `root: 'v2-core'`; `fs.allow` includes `v2-custom`; `@core`/`@custom` aliases |
| `v2-core/src/components/CustomAppLoader.tsx` | Loads `v2-custom/src/apps/*/index.tsx` via `import.meta.glob` |
| `functions/` (repo root) | Assembled output — served by Netlify CLI; never edit directly |
| `src/v2-assembled/` | Assembled output — prod build only; never edit directly |
