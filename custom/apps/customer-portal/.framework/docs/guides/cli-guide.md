# Spine CLI Reference

The `spine` CLI is a thin adapter over Spine core functions. Every command constructs a `CoreContext` and calls the same logic used by API handlers and imports — no HTTP involved.

---

## Installation

```bash
# From project root
npm run spine -- --help

# Or link globally
npm link
spine --help
```

---

## Configuration

The CLI reads credentials from `v2-core/.xenv` or environment variables:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✓ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Service role key (admin ops) |
| `SUPABASE_ANON_KEY` | For user auth | Anon key for JWT-scoped ops |
| `SPINE_CLI_ACCOUNT_ID` | Recommended | Default account scope |
| `SPINE_CLI_JWT` | For human auth | User JWT token |
| `SPINE_CLI_API_KEY` | For machine auth | Machine API key |
| `SPINE_CLI_DEBUG` | Optional | Set to `1` for stack traces |

**Authentication priority:**
1. `SPINE_CLI_API_KEY` → machine principal
2. `SPINE_CLI_JWT` → human principal
3. Neither → `SYSTEM_PRINCIPAL` (admin ops only)

---

## Global Options

```
--account <id>   Override the account ID for this command
--json           Output as JSON (available on most commands)
```

---

## Commands

### `spine auth`

```bash
# Show the resolved identity for current env
spine auth whoami

# Validate credentials — exits 0 if valid, 1 if not
spine auth check
```

**Example: `whoami` output**
```
Spine CLI — Current Identity
────────────────────────────────────────
Principal ID:   cab578c2-c295-476a-a8c5-dca3445aa4ac
Type:           human
Account:        cd74879c-3bfa-4dce-9bbd-67b31eaa23e2
Name:           K Pettit
Email:          kpettit851@gmail.com
Roles:          system_admin, admin
Request ID:     f3e2a1b0-...
```

---

### `spine pipelines`

```bash
# List all active pipelines
spine pipelines list
spine pipelines list --account <id> --all --json

# Get pipeline details
spine pipelines get <id>

# Execute a pipeline
spine pipelines run <id>
spine pipelines run <id> --data '{"item_id":"abc123"}'
spine pipelines run <id> --account <account-id> --json

# List recent executions
spine pipelines executions <id>
spine pipelines executions <id> --limit 20 --json
```

**Example: `run` output**
```
Running pipeline e3f1a2b0-...

✓ Pipeline completed
  Execution ID: 9d8c7b6a-...
  Duration:     342ms
  Stages:       3
    ✓ [0] update_item (45ms)
    ✓ [1] send_notification (89ms)
    ✓ [2] http_request (208ms)
```

---

### `spine items`

```bash
# List items (all types or filtered)
spine items list
spine items list --type support_ticket --limit 50
spine items list --account <id> --json

# Get a single item
spine items get <id>
spine items get <id> --json

# Create an item
spine items create --type support_ticket --title "Login broken" --account <id>
spine items create --type support_ticket --data '{"priority":"high","status":"open"}' --account <id>

# Update item fields
spine items update <id> --data '{"status":"resolved"}'
spine items update <id> --title "New title"

# Soft-delete (sets is_active = false)
spine items delete <id>

# Hard delete (permanent)
spine items delete <id> --hard
```

---

### `spine agents`

```bash
# Send a message to an agent thread
spine agents run <thread-id> --message "How do I reset my password?"
spine agents run <thread-id> --message "Summarize open tickets" --json

# List agent threads
spine agents threads list
spine agents threads list --account <id> --limit 10

# Get thread details + messages
spine agents threads get <thread-id>
spine agents threads get <thread-id> --limit 50 --json
```

**Example: `run` output**
```
Sending message to thread 7a6b5c4d-...

─── Agent Response ───
Based on your account settings, to reset your password: click "Forgot Password"
on the login page and enter your email address...
─────────────────────
Confidence: 87%
```

---

### `spine migrations`

```bash
# List all applied migrations
spine migrations list
spine migrations list --json

# Compare local files vs applied
spine migrations status
spine migrations status --json
```

**Example: `status` output**
```
Migration Status
────────────────────────────────────────────────────────────
  ✓ 001_schema.sql                           applied
  ✓ 002_accounts.sql                         applied
  ✓ 003_people.sql                           applied
  ...
  ○ 065_new_feature.sql                      pending

  64 applied, 1 pending
```

---

## Agentic IDE Usage

The CLI is designed for use in Windsurf, Cursor, and other agentic IDEs. Recommended workflow file pattern:

```markdown
---
description: Run a Spine pipeline from the IDE
---

1. Set up credentials in v2-core/.xenv
// turbo
2. Run: npm run spine -- auth check
// turbo
3. Run: npm run spine -- pipelines run <id> --data '{"key":"value"}' --json
```

For machine-to-machine operations in IDE workflows, use `SPINE_CLI_API_KEY` with appropriate scopes rather than a human JWT.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Error (message printed to stderr) |

Set `SPINE_CLI_DEBUG=1` to see full stack traces on errors.
