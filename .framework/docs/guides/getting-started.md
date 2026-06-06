# Getting Started with Spine v2

Spine is a backend framework that runs on Supabase + Netlify Functions. It provides multi-tenancy, authentication, authorization, pipeline automation, and AI agent infrastructure — all accessible via three interfaces:

| Interface | Use case |
|---|---|
| **API** | External services, frontends, webhooks |
| **Import** | Custom functions running in the same process |
| **CLI** | Terminal operations, agentic IDE workflows, testing |

---

## Prerequisites

- Node.js 20+
- A Supabase project
- Netlify CLI (`npm install -g netlify-cli`)

---

## 1. Clone and configure

```bash
git clone https://github.com/your-org/spine-ia
cd spine-ia
npm install
```

Copy the example environment file:

```bash
cp v2-core/.xenv.example v2-core/.xenv
```

Edit `v2-core/.xenv` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
SUPABASE_ANON_KEY=eyJhbGci...
DB_SCHEMA=public
```

---

## 2. Apply migrations

```bash
# Apply all migrations to your Supabase project
supabase db push
```

Or via Supabase CLI against a specific project:

```bash
supabase migration up --project-id your-project-id
```

---

## 3. Start the dev server

```bash
netlify dev
```

This assembles `v2-core/` + `v2-custom/` and starts the Netlify dev proxy on port 8888.

---

## 4. Verify the API

```bash
curl http://localhost:8888/.netlify/functions/health
# {"data":{"status":"ok","version":"2.0.0"}, "error":null}
```

---

## 5. Test the CLI

```bash
npm run spine -- auth whoami
```

Expected output:
```
Spine CLI — Current Identity
────────────────────────────────────────
Principal ID:   system
Type:           machine
Account:        (none)
Request ID:     <uuid>
```

---

## Next Steps

- [Import Guide](./import-guide.md) — use Spine functions directly in custom code
- [CLI Reference](./cli-guide.md) — full CLI command reference
- [API Governance](../api-governance.md) — API versioning and contract rules
- [Authorization Model](../authorization-model.md) — roles, scopes, and permissions
