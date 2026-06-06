# Spine v2 — Design Schema & Validation Schema Specification

**Version:** 1.0 — Generated 2026-04-26  
**Source of truth:** All definitions in this document are derived directly from the live codebase.  
**Primary sources:** `v2-core/src/types/types.ts`, `v2-core/src/components/shared/FieldRenderer.tsx`, `v2-core/functions/_shared/schema-utils.ts`, `v2-core/src/components/runtime/SchemaDetailForm.tsx`, `v2-core/src/components/runtime/DataListPage.tsx`

---

## Table of Contents

1. [Overview & Key Concepts](#1-overview--key-concepts)
2. [Top-Level Shape](#2-top-level-shape)
3. [fields — Field Definitions](#3-fields--field-definitions)
4. [views — List & Detail Views](#4-views--list--detail-views)
5. [record_permissions](#5-record_permissions)
6. [functionality — Reserved](#6-functionality--reserved)
7. [Field-Level permissions](#7-field-level-permissions)
8. [validation_schema](#8-validation_schema)
9. [system Field Flag](#9-system-field-flag)
10. [Complete Examples](#10-complete-examples)
11. [Rules & Constraints](#11-rules--constraints)

---

## 1. Overview & Key Concepts

### What is `design_schema`?

`design_schema` is a JSONB column on the `types` table. It is the complete configuration contract for a type — defining its fields, how those fields are rendered in list and detail views, who can access which fields, and what automation is bound to the type.

### What is `validation_schema`?

`validation_schema` is a separate JSONB column on the `types` table. It is **auto-generated** from `design_schema` by `generateValidationSchema()` in `schema-utils.ts`. It strips display/permission information and retains only structural validation rules. The backend uses it to sanitize and validate incoming record data.

> **Do not hand-author `validation_schema`.** It is always derived from `design_schema`.

### `data_type` vs `display_type`

These are two different concepts used in two different places:

| Concept | Where it lives | What it controls |
|---|---|---|
| `data_type` | `design_schema.fields[key].data_type` | Storage format, backend sanitization, default form input widget |
| `display_type` | `design_schema.views[viewKey].fields[key].display_type` | View-level render override — changes how the field is presented without changing the data contract |

A field with `data_type: "text"` can be rendered as `display_type: "textarea"` in a specific view. The data contract doesn't change.

### `system` vs custom fields

| `system: true` | `system: false` / absent |
|---|---|
| Value lives at `record[fieldName]` — a real DB column | Value lives at `record.data[fieldName]` — stored in JSONB |
| Set by Spine core — not writable by non-`system-admin` roles | Defined by type author — writable per field permissions |
| Examples: `id`, `title`, `is_active`, `created_at` | Examples: `priority`, `category`, `content` |

Source: `SchemaFields.tsx` line 45:
```ts
field.system ? data[name] : (data.data?.[name] ?? data[name])
```

---

## 2. Top-Level Shape

```json
{
  "fields": { },
  "views": { },
  "record_permissions": { },
  "functionality": null
}
```

| Key | Type | Required | Description |
|---|---|---|---|
| `fields` | `Record<string, FieldDefinition>` | ✅ | All field definitions, keyed by field name |
| `views` | `Record<string, ListView \| DetailView>` | ✅ | Named view configurations |
| `record_permissions` | `Record<string, string[]>` | ✅ | Record-level CRUD permissions per role |
| `functionality` | `FunctionalityBindings \| null` | — | Pipeline, agent, embedding, integration bindings |

---

## 3. `fields` — Field Definitions

The key is the **field name** in `snake_case`. This key is the canonical identifier used everywhere — in views, validation schemas, API payloads, and permissions.

### 3.1 Field Definition Properties

| Property | Type | Required | Notes |
|---|---|---|---|
| `data_type` | enum | ✅ | See full list below |
| `label` | string | ✅ | Human-readable display name |
| `required` | boolean | ✅ | Drives form validation and backend enforcement |
| `system` | boolean | — | `true` = DB column; `false`/absent = in `record.data` |
| `placeholder` | string | — | Input placeholder text — UI hint only |
| `description` | string | — | Help text rendered below the field |
| `rows` | number | — | Textarea/JSON editor row height hint |
| `min` | number | — | Minimum value for number/range fields |
| `max` | number | — | Maximum value for number/range fields |
| `step` | number | — | Step increment for number/range fields |
| `readonly` | boolean | — | Render as read-only regardless of edit mode |
| `disabled` | boolean | — | Render as disabled |
| `options` | `string[] \| {value: string, label: string}[]` | — | Required for `select`, `multiselect`, `radio` |
| `permissions` | `Record<string, string[]>` | ✅ | Field-level read/write per role |
| `validation` | object | — | Structural validation constraints (see §3.3) |

### 3.2 `data_type` — Full Enum (22 values)

These are the exact values accepted by `FieldDefinition.data_type` in `types.ts` and handled by `FieldRenderer.tsx` and `schema-utils.ts`:

| `data_type` | Input rendered | Backend sanitization | Notes |
|---|---|---|---|
| `text` | `<input type="text">` | HTML-escaped, length-constrained | Default fallback type |
| `textarea` | `<textarea>` | HTML-escaped, length-constrained | Multi-line text |
| `rich_text` | `<textarea>` (future: rich editor) | HTML sanitized (safe tags only) | Allows basic HTML formatting |
| `email` | `<input type="email">` | Lowercased, validated format | Rendered as `mailto:` link in readonly |
| `phone` | `<input type="tel">` | Stripped to digits + `+` | Pattern validation if provided |
| `url` | `<input type="url">` | Validated, http/https only | Rendered as external link in readonly |
| `number` | `<input type="number">` | Parsed to `Number`, min/max enforced | Also used for `currency`, `range` base |
| `currency` | `<input type="number">` | Rounded to 2 decimal places | Use `validation.currency_code` for display |
| `range` | `<input type="range">` + value display | Same as `number` | Requires `min` and `max` |
| `date` | `<input type="date">` | ISO date string `YYYY-MM-DD` | |
| `datetime` | `<input type="datetime-local">` | ISO datetime string | |
| `boolean` | Checkbox | Coerced from string/int if needed | Readonly: "Yes" / "No" |
| `checkbox` | Checkbox | Same as `boolean` | Alias for `boolean` |
| `select` | `<select>` | Validated against `options` | Requires `options` |
| `multiselect` | Checkbox group | Array of strings, validated against `options` | Requires `options` |
| `radio` | Radio group | Validated against `options` | Requires `options` |
| `color` | Color picker + hex text input | Validated as `#RRGGBB` or `#RGB`, normalized to uppercase 6-digit | |
| `file` | `<input type="file">` | Filename sanitized, size/type checked | |
| `image` | `<input type="file">` | Same as `file` + image dimension hints | |
| `json` | Monospace textarea | Validated as parseable JSON, script injection blocked | Readonly: formatted `<pre>` |
| `reference` | Text input (future: picker) | UUID format validated | Use `validation.reference_kind` + `reference_type` |
| `address` | Text inputs per component | Each component sanitized as text | Stored as object: `{street, city, state, postal_code, country}` |

### 3.3 `validation` Sub-Properties

| Property | Applies to | Type | Description |
|---|---|---|---|
| `minLength` | `text`, `textarea`, `rich_text` | number | Minimum character count |
| `maxLength` | `text`, `textarea`, `rich_text`, `url` | number | Maximum character count |
| `pattern` | `text`, `phone` | string | Regex pattern (JavaScript syntax) |
| `min` | `number`, `currency`, `range`, `date`, `datetime` | number / ISO string | Minimum value or date |
| `max` | `number`, `currency`, `range`, `date`, `datetime` | number / ISO string | Maximum value or date |
| `step` | `number`, `range` | number | Step increment |
| `integer` | `number` | boolean | Enforce integer-only values |
| `precision` | `currency` | number | Decimal precision |
| `maxSize` | `file`, `image` | number | Max file size in bytes |
| `allowedTypes` | `file`, `image` | string[] | Allowed MIME types (e.g. `["image/png", "image/jpeg"]`) |
| `maxWidth` | `image` | number | Max image width in pixels |
| `maxHeight` | `image` | number | Max image height in pixels |
| `currency_code` | `currency` | string | ISO 4217 code (e.g. `"USD"`) — used for display formatting |
| `reference_kind` | `reference` | string | Entity kind to reference (e.g. `"item"`, `"person"`) |
| `reference_type` | `reference` | string | Type slug to reference (e.g. `"task"`) |
| `max` (count) | `multiselect` | number | Maximum number of selections allowed |

### 3.4 Field Examples

**Minimal field** — `data_type`, `label`, `required` are always required:
```json
{
  "title": {
    "data_type": "text",
    "label": "Title",
    "required": true,
    "permissions": {
      "system-admin": ["read", "write"]
    }
  }
}
```

**Minimal custom field** — non-system fields always include tenant roles:
```json
{
  "notes": {
    "data_type": "textarea",
    "label": "Notes",
    "required": false,
    "permissions": {
      "system-admin": ["read", "write"],
      "admin": ["read", "write"],
      "member": ["read", "write"],
      "guest": ["read"]
    }
  }
}
```

**Maximal field — text:**
```json
{
  "summary": {
    "data_type": "text",
    "label": "Summary",
    "required": false,
    "system": false,
    "placeholder": "Enter a brief summary",
    "description": "A short description shown in list views",
    "readonly": false,
    "disabled": false,
    "validation": {
      "minLength": 10,
      "maxLength": 500,
      "pattern": "^[A-Za-z0-9 .,!?-]+$"
    },
    "permissions": {
      "system-admin": ["read", "write"],
      "admin": ["read", "write"],
      "member": ["read"],
      "guest": []
    }
  }
}
```

**Select field with options:**
```json
{
  "status": {
    "data_type": "select",
    "label": "Status",
    "required": true,
    "system": false,
    "options": ["todo", "in_progress", "done", "blocked"],
    "permissions": {
      "admin": ["read", "write"],
      "member": ["read", "write"],
      "guest": ["read"]
    }
  }
}
```

**Select with labeled options:**
```json
{
  "priority": {
    "data_type": "select",
    "label": "Priority",
    "required": true,
    "options": [
      { "value": "low", "label": "Low" },
      { "value": "medium", "label": "Medium" },
      { "value": "high", "label": "High" },
      { "value": "urgent", "label": "Urgent 🔥" }
    ],
    "permissions": {
      "admin": ["read", "write"],
      "member": ["read", "write"]
    }
  }
}
```

**Reference field:**
```json
{
  "assignee_id": {
    "data_type": "reference",
    "label": "Assignee",
    "required": false,
    "system": false,
    "validation": {
      "reference_kind": "person",
      "reference_type": "employee"
    },
    "permissions": {
      "admin": ["read", "write"],
      "member": ["read"]
    }
  }
}
```

**Number field with constraints:**
```json
{
  "score": {
    "data_type": "range",
    "label": "Score",
    "required": false,
    "min": 0,
    "max": 100,
    "step": 5,
    "validation": {
      "min": 0,
      "max": 100,
      "step": 5,
      "integer": true
    },
    "permissions": {
      "admin": ["read", "write"],
      "member": ["read", "write"]
    }
  }
}
```

---

## 4. `views` — List & Detail Views

Views are named configurations that control how fields are presented. The key is the view slug (e.g. `"default_list"`, `"default_detail"`). Multiple views of the same type can exist.

### 4.1 List View

Used by `DataListPage` → `DataTable`. Drives table columns, sorting, filtering, and stats.

```ts
type ListView = {
  type: "list"
  display: "table" | "card" | "board"
  label: string
  fields: Record<string, ViewFieldConfig>
  default_sort?: { field: string; direction: "asc" | "desc" }
  filters?: string[]
  stats?: Array<{ title: string; type: "count" | "filter_count"; icon?: string; color?: string; filter?: Record<string, any> }>
  group_by?: string
}
```

| Property | Required | Notes |
|---|---|---|
| `type` | ✅ | Must be `"list"` |
| `display` | ✅ | `"table"` is fully implemented; `"card"` and `"board"` are reserved |
| `label` | ✅ | Human-readable view name |
| `fields` | ✅ | Field keys + `ViewFieldConfig` per field |
| `default_sort` | — | Defaults to `created_at desc` if absent |
| `filters` | — | Array of field names to expose as filter controls |
| `stats` | — | Summary stat cards above the table |
| `group_by` | — | Field name for board grouping (board display only) |

**Minimal list view:**
```json
{
  "default_list": {
    "type": "list",
    "display": "table",
    "label": "Default List",
    "fields": {
      "title": { "sortable": true, "display_type": "text" },
      "created_at": { "sortable": true, "display_type": "timestamp" }
    }
  }
}
```

**Maximal list view:**
```json
{
  "default_list": {
    "type": "list",
    "display": "table",
    "label": "Tasks",
    "fields": {
      "title": { "sortable": true, "searchable": true, "display_type": "text" },
      "status": { "sortable": true, "display_type": "badge" },
      "priority": { "sortable": true, "display_type": "badge" },
      "due_date": { "sortable": true, "display_type": "timestamp" },
      "is_active": { "sortable": true, "display_type": "boolean" },
      "created_at": { "sortable": true, "display_type": "timestamp" }
    },
    "default_sort": { "field": "due_date", "direction": "asc" },
    "filters": ["status", "priority", "is_active"],
    "stats": [
      { "title": "Total", "type": "count", "icon": "ClipboardIcon", "color": "blue" },
      { "title": "Open", "type": "filter_count", "icon": "ClockIcon", "color": "yellow", "filter": { "status": "todo" } },
      { "title": "Done", "type": "filter_count", "icon": "CheckCircleIcon", "color": "green", "filter": { "status": "done" } }
    ]
  }
}
```

### 4.2 Detail View

Used by `SchemaDetailForm` → `SchemaFields` → `FieldRenderer`. Drives the record detail page form/display.

```ts
type DetailView = {
  type: "detail"
  label: string
  sections: Array<{
    title: string
    fields: Record<string, ViewFieldConfig>
  }>
}
```

| Property | Required | Notes |
|---|---|---|
| `type` | ✅ | Must be `"detail"` |
| `label` | ✅ | Human-readable view name |
| `sections` | ✅ | Array of sections; each has a `title` and `fields` map |

Sections render as separate cards on the detail page. Fields within a section render in two-column grid by default.

**Minimal detail view:**
```json
{
  "default_detail": {
    "type": "detail",
    "label": "Default Detail",
    "sections": [
      {
        "title": "Details",
        "fields": {
          "title": { "display_type": "text" }
        }
      }
    ]
  }
}
```

**Maximal detail view:**
```json
{
  "default_detail": {
    "type": "detail",
    "label": "Task Detail",
    "sections": [
      {
        "title": "Core Info",
        "fields": {
          "title": { "display_type": "input" },
          "status": { "display_type": "select" },
          "priority": { "display_type": "radio" },
          "due_date": { "display_type": "date_picker" }
        }
      },
      {
        "title": "Content",
        "fields": {
          "description": { "display_type": "textarea" },
          "notes": { "display_type": "rich_text" }
        }
      },
      {
        "title": "System",
        "fields": {
          "is_active": { "display_type": "checkbox" },
          "created_at": { "display_type": "timestamp" }
        }
      }
    ]
  }
}
```

### 4.3 `ViewFieldConfig` — `display_type` Enum

The `display_type` in a view overrides the default input widget without changing the field's data contract.

| `display_type` | Renders as | Notes |
|---|---|---|
| `text` | Plain text display | Read-only display in list views |
| `input` | `<input type="text">` | Editable text in detail |
| `textarea` | `<textarea>` | Multi-line editable |
| `rich_text` | Sanitized HTML textarea | Basic formatting |
| `select` | `<select>` dropdown | Requires field `options` |
| `multiselect` | Checkbox group | Requires field `options` |
| `radio` | Radio button group | Requires field `options` |
| `checkbox` | Single checkbox | Boolean toggle |
| `switch` | Toggle switch | Alias for `checkbox` |
| `date_picker` | `<input type="date">` | |
| `datetime_picker` | `<input type="datetime-local">` | |
| `color_picker` | Color input + hex field | |
| `file_upload` | File input | |
| `image_upload` | File input (image) | |
| `range_slider` | Range slider + value | Requires `min`/`max` on field |
| `badge` | Colored badge pill | Good for status/priority in list views |
| `timestamp` | Formatted date/time string | `formatDateTime()` from `lib/utils` |
| `currency` | Formatted currency string | Uses `validation.currency_code` |
| `number` | Numeric display | |
| `rating` | Reserved | Not yet implemented |
| `autocomplete` | Reserved | Not yet implemented |
| `address_form` | Reserved | Not yet implemented |
| `reference_picker` | Reserved | Not yet implemented |

---

## 5. `record_permissions`

Controls who can perform CRUD operations on records of this type.

```json
{
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"],
    "admin": ["create", "read", "update"],
    "member": ["read", "update"],
    "guest": ["read"]
  }
}
```

| Property | Notes |
|---|---|
| Keys | Role slugs — must match slugs in the `roles` table |
| Values | Array of actions. Valid values: `"create"`, `"read"`, `"update"`, `"delete"` |
| Absent role | No access — not inherited from other roles |
| Empty array `[]` | Explicitly no access |

**Minimum (system-only type):**
```json
{
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  }
}
```

**Full tenant type:**
```json
{
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"],
    "admin": ["create", "read", "update", "delete"],
    "member": ["create", "read", "update"],
    "guest": ["read"]
  }
}
```

---

## 6. `functionality` — Reserved

`functionality` is currently `null` in all system seeds. The shape is fully defined in `types.ts` (`FunctionalityBindings`) and reserved for future automation bindings. Document the structure here for forward compatibility.

```json
{
  "functionality": {
    "pipelines": [
      {
        "pipeline_id": "uuid",
        "trigger": "on_create",
        "roles": ["admin", "member"]
      }
    ],
    "ai_agents": [
      {
        "agent_id": "uuid",
        "capabilities": ["read", "summarize", "suggest"],
        "trigger": "manual",
        "roles": ["admin"]
      }
    ],
    "embeddings": [
      {
        "slug": "task-embeddings",
        "fields": ["title", "description"],
        "model": "text-embedding-3-small",
        "vector_column": "embedding",
        "trigger": "on_create_or_update"
      }
    ],
    "integrations": [
      {
        "integration_id": "uuid",
        "sync": "bidirectional",
        "field_map": {
          "title": { "external_field": "name", "direction": "both" }
        },
        "trigger": "on_create_or_update"
      }
    ],
    "constraints": [
      {
        "type": "unique",
        "fields": ["title", "account_id"],
        "message": "A task with this title already exists"
      },
      {
        "type": "conditional_required",
        "field": "due_date",
        "condition": "priority === 'urgent'",
        "message": "Due date is required for urgent tasks"
      },
      {
        "type": "immutable",
        "field": "created_by",
        "after": "create",
        "message": "Creator cannot be changed after creation"
      }
    ]
  }
}
```

**`pipeline` trigger values:** `"manual"` | `"on_create"` | `"on_update"` | `"on_field_change"` | `"on_delete"` | `"scheduled"`  
**`ai_agent` capability values:** `"read"` | `"summarize"` | `"suggest"` | `"update"`  
**`embedding` trigger values:** `"on_create"` | `"on_update"` | `"on_create_or_update"`  
**`constraint` type values:** `"unique"` | `"conditional_required"` | `"immutable"`

> **Current status:** `functionality` is not yet enforced by the backend. Set to `null` until needed.

---

## 7. Field-Level `permissions`

Nested inside each field definition. Controls who can read or write individual field values.

```json
{
  "permissions": {
    "system-admin": ["read", "write"],
    "admin": ["read", "write"],
    "member": ["read"],
    "guest": []
  }
}
```

| Valid action values | Meaning |
|---|---|
| `"read"` | Role can see this field's value |
| `"write"` | Role can modify this field's value |

**Rules:**
- Actions for field permissions are `read` and `write` only — not `create`/`delete` (those are record-level)
- Empty array `[]` = explicitly no access to this field
- Absent role key = no access
- `record_permissions` gates first — if a role can't read a record, field permissions are irrelevant
- `system: true` fields should always restrict `write` to `system-admin` by convention

---

## 8. `validation_schema`

### What it is

`validation_schema` is stored alongside `design_schema` on the `types` table. It is the server-side enforcement contract. **It is always generated by `generateValidationSchema()` in `schema-utils.ts` — never hand-authored.**

### Shape

```json
{
  "fields": {
    "field_name": {
      "data_type": "text",
      "required": true,
      "minLength": 1,
      "maxLength": 255
    }
  }
}
```

Per-field properties are: `data_type`, `required`, plus any `validation` sub-properties flattened from the field definition, plus `options` if present.

### What the backend enforces per `data_type`

| `data_type` | Sanitization applied |
|---|---|
| `text` | HTML entity escape, control chars stripped, `minLength`/`maxLength`/`pattern` enforced |
| `textarea` | Same as `text`, preserves line breaks |
| `rich_text` | Safe HTML tag allowlist, script/onX stripped, `minLength`/`maxLength` enforced |
| `email` | Lowercased, regex format validated |
| `phone` | Stripped to digits + `+`, `pattern` validated if set |
| `url` | URL parsed, http/https only enforced |
| `number` | Coerced to `Number`, `min`/`max`/`step` enforced |
| `currency` | Coerced to `Number`, rounded to 2 decimal places, `min`/`max` enforced |
| `range` | Same as `number` |
| `date` | Parsed to ISO `YYYY-MM-DD`, `min`/`max` date enforced |
| `datetime` | Parsed to ISO datetime, `min`/`max` enforced |
| `boolean` / `checkbox` | Coerced from string/int (`"true"`, `"1"`, `"yes"` → `true`) |
| `select` / `radio` | Validated against `options` array |
| `multiselect` | Array of strings, each validated against `options`, deduped, `max` count enforced |
| `color` | Validated as `#RRGGBB` or `#RGB`, normalized to uppercase 6-digit hex |
| `file` / `image` | Filename sanitized, `maxSize` and `allowedTypes` enforced |
| `json` | Parsed as JSON, script injection blocked |
| `reference` | UUID format validated |
| `address` | Each component sanitized as `text` |

### Example generated `validation_schema`

Given this `design_schema.fields`:
```json
{
  "title": { "data_type": "text", "label": "Title", "required": true, "system": true, "validation": { "minLength": 1, "maxLength": 255 } },
  "status": { "data_type": "select", "label": "Status", "required": true, "options": ["todo", "in_progress", "done"] },
  "due_date": { "data_type": "date", "label": "Due Date", "required": false }
}
```

`generateValidationSchema()` produces:
```json
{
  "fields": {
    "title": { "data_type": "text", "required": true, "minLength": 1, "maxLength": 255 },
    "status": { "data_type": "select", "required": true, "options": ["todo", "in_progress", "done"] },
    "due_date": { "data_type": "date", "required": false }
  }
}
```

---

## 9. `system` Field Flag

### Behavior

| Flag | Where value is stored | Who can write |
|---|---|---|
| `system: true` | `record[fieldName]` — real DB column | `system-admin` only (by convention) |
| `system: false` or absent | `record.data[fieldName]` — JSONB column | Per field `permissions` |

### System fields that always exist on every record

These are DB columns present on all entity tables and do not need to be defined in `design_schema.fields` to appear in views:

| Field | Type | Notes |
|---|---|---|
| `id` | `uuid` | Auto-generated |
| `title` | `text` | Primary display field |
| `is_active` | `boolean` | Soft delete flag |
| `account_id` | `uuid` | Owning account |
| `created_at` | `timestamp` | Auto-set |
| `updated_at` | `timestamp` | Auto-updated |
| `created_by` | `uuid` | FK to `people.id` |

These can be referenced in `views.fields` without being in `design_schema.fields`.

### Including system fields in `design_schema.fields`

You should include system fields you want to be editable in forms. Example:

```json
{
  "title": {
    "data_type": "text",
    "label": "Title",
    "required": true,
    "system": true,
    "validation": { "minLength": 1, "maxLength": 255 },
    "permissions": {
      "system-admin": ["read", "write"],
      "admin": ["read", "write"],
      "member": ["read", "write"]
    }
  }
}
```

---

## 10. Complete Examples

### 10.1 Minimal `design_schema`

One system field, one custom field, minimal list and detail views, system-admin only:

```json
{
  "fields": {
    "title": {
      "data_type": "text",
      "label": "Title",
      "required": true,
      "system": true,
      "permissions": {
        "system-admin": ["read", "write"]
      }
    },
    "notes": {
      "data_type": "textarea",
      "label": "Notes",
      "required": false,
      "permissions": {
        "system-admin": ["read", "write"]
      }
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Default List",
      "fields": {
        "title": { "sortable": true, "display_type": "text" },
        "created_at": { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "created_at", "direction": "desc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Default Detail",
      "sections": [
        {
          "title": "Details",
          "fields": {
            "title": { "display_type": "input" },
            "notes": { "display_type": "textarea" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

### 10.2 Maximal `design_schema` — Task Type

Full field set, multi-section detail view, stats, filters, role permissions, functionality reserved:

```json
{
  "fields": {
    "title": {
      "data_type": "text",
      "label": "Title",
      "required": true,
      "system": true,
      "validation": { "minLength": 1, "maxLength": 255 },
      "permissions": {
        "system-admin": ["read", "write"],
        "admin": ["read", "write"],
        "member": ["read", "write"],
        "guest": ["read"]
      }
    },
    "status": {
      "data_type": "select",
      "label": "Status",
      "required": true,
      "system": false,
      "options": ["todo", "in_progress", "done", "blocked"],
      "permissions": {
        "admin": ["read", "write"],
        "member": ["read", "write"],
        "guest": ["read"]
      }
    },
    "priority": {
      "data_type": "select",
      "label": "Priority",
      "required": true,
      "system": false,
      "options": [
        { "value": "low", "label": "Low" },
        { "value": "medium", "label": "Medium" },
        { "value": "high", "label": "High" },
        { "value": "urgent", "label": "Urgent" }
      ],
      "permissions": {
        "admin": ["read", "write"],
        "member": ["read", "write"],
        "guest": ["read"]
      }
    },
    "due_date": {
      "data_type": "date",
      "label": "Due Date",
      "required": false,
      "system": false,
      "permissions": {
        "admin": ["read", "write"],
        "member": ["read", "write"],
        "guest": ["read"]
      }
    },
    "description": {
      "data_type": "textarea",
      "label": "Description",
      "required": false,
      "system": false,
      "validation": { "maxLength": 5000 },
      "permissions": {
        "admin": ["read", "write"],
        "member": ["read", "write"],
        "guest": ["read"]
      }
    },
    "internal_notes": {
      "data_type": "textarea",
      "label": "Internal Notes",
      "required": false,
      "system": false,
      "validation": { "maxLength": 5000 },
      "permissions": {
        "admin": ["read", "write"],
        "member": [],
        "guest": []
      }
    },
    "score": {
      "data_type": "range",
      "label": "Completion Score",
      "required": false,
      "system": false,
      "min": 0,
      "max": 100,
      "step": 5,
      "validation": { "min": 0, "max": 100, "step": 5, "integer": true },
      "permissions": {
        "admin": ["read", "write"],
        "member": ["read", "write"]
      }
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Tasks",
      "fields": {
        "title": { "sortable": true, "searchable": true, "display_type": "text" },
        "status": { "sortable": true, "display_type": "badge" },
        "priority": { "sortable": true, "display_type": "badge" },
        "due_date": { "sortable": true, "display_type": "timestamp" },
        "created_at": { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "due_date", "direction": "asc" },
      "filters": ["status", "priority", "is_active"],
      "stats": [
        { "title": "Total", "type": "count", "icon": "ClipboardIcon", "color": "blue" },
        { "title": "Open", "type": "filter_count", "icon": "ClockIcon", "color": "yellow", "filter": { "status": "todo" } },
        { "title": "Done", "type": "filter_count", "icon": "CheckCircleIcon", "color": "green", "filter": { "status": "done" } }
      ]
    },
    "default_detail": {
      "type": "detail",
      "label": "Task Detail",
      "sections": [
        {
          "title": "Core",
          "fields": {
            "title": { "display_type": "input" },
            "status": { "display_type": "select" },
            "priority": { "display_type": "radio" },
            "due_date": { "display_type": "date_picker" }
          }
        },
        {
          "title": "Details",
          "fields": {
            "description": { "display_type": "textarea" },
            "score": { "display_type": "range_slider" }
          }
        },
        {
          "title": "Internal",
          "fields": {
            "internal_notes": { "display_type": "textarea" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"],
    "admin": ["create", "read", "update", "delete"],
    "member": ["create", "read", "update"],
    "guest": ["read"]
  },
  "functionality": null
}
```

### 10.3 Corresponding `validation_schema` (auto-generated)

```json
{
  "fields": {
    "title": { "data_type": "text", "required": true, "minLength": 1, "maxLength": 255 },
    "status": { "data_type": "select", "required": true, "options": ["todo", "in_progress", "done", "blocked"] },
    "priority": { "data_type": "select", "required": true, "options": [{"value":"low","label":"Low"},{"value":"medium","label":"Medium"},{"value":"high","label":"High"},{"value":"urgent","label":"Urgent"}] },
    "due_date": { "data_type": "date", "required": false },
    "description": { "data_type": "textarea", "required": false, "maxLength": 5000 },
    "internal_notes": { "data_type": "textarea", "required": false, "maxLength": 5000 },
    "score": { "data_type": "range", "required": false, "min": 0, "max": 100, "step": 5, "integer": true }
  }
}
```

---

## 11. Rules & Constraints

### Field-level `permissions` — when to set them
- Field `permissions` are **only needed to restrict access below the record-level grant**
- If `record_permissions` already grants a role full access, repeating that grant at the field level is redundant — omit it
- System-only types (all fields `system: true`, `record_permissions` grants `system-admin` only) need **no field-level permissions at all**
- Custom fields (`system: false`) that should be visible to tenant roles (`admin`, `member`, `guest`) **must** declare those roles in field `permissions`, since the record-level grant alone does not grant field visibility to those roles
- A field with no matching role entry (and no record-level field override) is invisible and unwritable to that role
- `validation: null` is acceptable (used in all system seeds) — omitting `validation` entirely is also fine

### Field names
- Must be `snake_case`
- Must be unique within a type
- The key in `design_schema.fields` IS the field name — it is used as the data key in API payloads and `record.data`

### Views
- `views.fields` keys should reference fields defined in `design_schema.fields` OR known system columns (`id`, `title`, `is_active`, `created_at`, `updated_at`, `created_by`)
- Referencing an undefined field key in a view is non-fatal (field is silently skipped) but should be avoided
- A type must have at least one view named `"default_list"` and one named `"default_detail"` for the runtime UI to work

### `options` requirement
- Required for `data_type: "select"`, `"multiselect"`, `"radio"` — field will not render correctly without it
- Options can be plain strings `["a", "b"]` or labeled objects `[{value, label}]` — not mixed

### `reference` fields
- `validation.reference_kind` and `validation.reference_type` should be set to enable future reference picker UI
- Value stored is a UUID string

### `validation_schema`
- Always auto-generated by `generateValidationSchema()` — do not hand-edit
- When `design_schema` is updated, `validation_schema` must be regenerated and saved together

### `system: true` fields
- By convention, `write` permission should be restricted to `system-admin` only
- Do not include system fields in `design_schema.fields` unless you want them editable in forms

### `record_permissions`
- At minimum, include `"system-admin": ["create", "read", "update", "delete"]`
- Valid actions: `"create"`, `"read"`, `"update"`, `"delete"` — no others

### `functionality`
- Set to `null` until automation bindings are needed
- Do not set non-null values unless the runtime enforcement is confirmed active

---

## 12. Runtime Entity — Minimal `design_schema` Examples

Each example below includes **only the user-facing system columns** for that entity's DB table — all marked `system: true`. Since `record_permissions` grants `system-admin` full access, **no field-level `permissions` are set** — they are only needed when restricting access below the record-level grant.

These serve as the starting point for any custom type built on that entity. Add custom fields (with `system: false`) and their field-level `permissions` on top of these.

> Excluded from all examples: `id`, `type_id`, `account_id`, `app_id`, `data`, `design_schema`, `validation_schema`, `created_by`, `updated_by`, `auth_uid`, `role_id`, `owner_account_id` — these are internal FK/system columns not exposed in UI forms.

---

### 12.1 `items`

DB columns: `title`, `description`, `status`, `is_active`, `item_type`, `created_at`, `updated_at`

```json
{
  "fields": {
    "title": {
      "data_type": "text",
      "label": "Title",
      "required": true,
      "system": true,
      "validation": null
    },
    "description": {
      "data_type": "textarea",
      "label": "Description",
      "required": false,
      "system": true,
      "validation": null
    },
    "status": {
      "data_type": "text",
      "label": "Status",
      "required": true,
      "system": true,
      "validation": null
    },
    "is_active": {
      "data_type": "boolean",
      "label": "Active",
      "required": true,
      "system": true,
      "validation": null
    },
    "item_type": {
      "data_type": "text",
      "label": "Item Type",
      "required": true,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Items",
      "fields": {
        "title":      { "sortable": true, "display_type": "text" },
        "status":     { "sortable": true, "display_type": "badge" },
        "item_type":  { "sortable": true, "display_type": "text" },
        "is_active":  { "sortable": true, "display_type": "badge" },
        "created_at": { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "created_at", "direction": "desc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Item Detail",
      "sections": [
        {
          "title": "Core",
          "fields": {
            "title":       { "display_type": "input" },
            "description": { "display_type": "textarea" },
            "status":      { "display_type": "input" },
            "item_type":   { "display_type": "text" },
            "is_active":   { "display_type": "checkbox" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.2 `people`

DB columns: `full_name`, `email`, `phone`, `avatar_url`, `status`, `is_active`, `created_at`, `updated_at`

```json
{
  "fields": {
    "full_name": {
      "data_type": "text",
      "label": "Full Name",
      "required": true,
      "system": true,
      "validation": null
    },
    "email": {
      "data_type": "email",
      "label": "Email",
      "required": true,
      "system": true,
      "validation": null
    },
    "phone": {
      "data_type": "phone",
      "label": "Phone",
      "required": false,
      "system": true,
      "validation": null
    },
    "avatar_url": {
      "data_type": "url",
      "label": "Avatar URL",
      "required": false,
      "system": true,
      "validation": null
    },
    "status": {
      "data_type": "text",
      "label": "Status",
      "required": true,
      "system": true,
      "validation": null
    },
    "is_active": {
      "data_type": "boolean",
      "label": "Active",
      "required": true,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "People",
      "fields": {
        "full_name":  { "sortable": true, "display_type": "text" },
        "email":      { "sortable": true, "display_type": "text" },
        "status":     { "sortable": true, "display_type": "badge" },
        "is_active":  { "sortable": true, "display_type": "badge" },
        "created_at": { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "created_at", "direction": "desc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Person Detail",
      "sections": [
        {
          "title": "Identity",
          "fields": {
            "full_name":  { "display_type": "input" },
            "email":      { "display_type": "input" },
            "phone":      { "display_type": "input" },
            "avatar_url": { "display_type": "input" }
          }
        },
        {
          "title": "Status",
          "fields": {
            "status":    { "display_type": "input" },
            "is_active": { "display_type": "checkbox" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.3 `accounts`

DB columns: `slug`, `display_name`, `description`, `is_active`, `created_at`, `updated_at`

```json
{
  "fields": {
    "slug": {
      "data_type": "text",
      "label": "Slug",
      "required": true,
      "system": true,
      "validation": null
    },
    "display_name": {
      "data_type": "text",
      "label": "Display Name",
      "required": true,
      "system": true,
      "validation": null
    },
    "description": {
      "data_type": "textarea",
      "label": "Description",
      "required": false,
      "system": true,
      "validation": null
    },
    "is_active": {
      "data_type": "boolean",
      "label": "Active",
      "required": true,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Accounts",
      "fields": {
        "display_name": { "sortable": true, "display_type": "text" },
        "slug":         { "sortable": true, "display_type": "text" },
        "is_active":    { "sortable": true, "display_type": "badge" },
        "created_at":   { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "created_at", "direction": "desc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Account Detail",
      "sections": [
        {
          "title": "Identity",
          "fields": {
            "display_name": { "display_type": "input" },
            "slug":         { "display_type": "input" },
            "description":  { "display_type": "textarea" },
            "is_active":    { "display_type": "checkbox" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.4 `threads`

DB columns: `title`, `target_type`, `visibility`, `status`, `created_at`, `updated_at`

```json
{
  "fields": {
    "title": {
      "data_type": "text",
      "label": "Title",
      "required": false,
      "system": true,
      "validation": null
    },
    "target_type": {
      "data_type": "text",
      "label": "Target Type",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "visibility": {
      "data_type": "text",
      "label": "Visibility",
      "required": true,
      "system": true,
      "validation": null
    },
    "status": {
      "data_type": "text",
      "label": "Status",
      "required": true,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Threads",
      "fields": {
        "title":       { "sortable": true, "display_type": "text" },
        "target_type": { "sortable": true, "display_type": "text" },
        "visibility":  { "sortable": true, "display_type": "badge" },
        "status":      { "sortable": true, "display_type": "badge" },
        "created_at":  { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "created_at", "direction": "desc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Thread Detail",
      "sections": [
        {
          "title": "Core",
          "fields": {
            "title":       { "display_type": "input" },
            "target_type": { "display_type": "text" },
            "visibility":  { "display_type": "input" },
            "status":      { "display_type": "input" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.5 `messages`

DB columns: `content`, `direction`, `sequence`, `visibility`, `created_at`

```json
{
  "fields": {
    "content": {
      "data_type": "textarea",
      "label": "Content",
      "required": true,
      "system": true,
      "validation": null
    },
    "direction": {
      "data_type": "text",
      "label": "Direction",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "sequence": {
      "data_type": "number",
      "label": "Sequence",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "visibility": {
      "data_type": "text",
      "label": "Visibility",
      "required": true,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Messages",
      "fields": {
        "content":    { "sortable": false, "display_type": "text" },
        "direction":  { "sortable": true,  "display_type": "badge" },
        "sequence":   { "sortable": true,  "display_type": "number" },
        "visibility": { "sortable": true,  "display_type": "badge" },
        "created_at": { "sortable": true,  "display_type": "timestamp" }
      },
      "default_sort": { "field": "sequence", "direction": "asc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Message Detail",
      "sections": [
        {
          "title": "Content",
          "fields": {
            "content":    { "display_type": "textarea" },
            "direction":  { "display_type": "text" },
            "sequence":   { "display_type": "number" },
            "visibility": { "display_type": "input" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.6 `roles`

DB columns: `slug`, `name`, `description`, `is_system`, `is_active`, `is_protected`, `created_at`, `updated_at`

```json
{
  "fields": {
    "slug": {
      "data_type": "text",
      "label": "Slug",
      "required": true,
      "system": true,
      "validation": null
    },
    "name": {
      "data_type": "text",
      "label": "Name",
      "required": true,
      "system": true,
      "validation": null
    },
    "description": {
      "data_type": "textarea",
      "label": "Description",
      "required": false,
      "system": true,
      "validation": null
    },
    "is_system": {
      "data_type": "boolean",
      "label": "System Role",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "is_active": {
      "data_type": "boolean",
      "label": "Active",
      "required": true,
      "system": true,
      "validation": null
    },
    "is_protected": {
      "data_type": "boolean",
      "label": "Protected",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Roles",
      "fields": {
        "name":         { "sortable": true, "display_type": "text" },
        "slug":         { "sortable": true, "display_type": "text" },
        "is_system":    { "sortable": true, "display_type": "badge" },
        "is_active":    { "sortable": true, "display_type": "badge" },
        "created_at":   { "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "name", "direction": "asc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "Role Detail",
      "sections": [
        {
          "title": "Identity",
          "fields": {
            "name":        { "display_type": "input" },
            "slug":        { "display_type": "input" },
            "description": { "display_type": "textarea" }
          }
        },
        {
          "title": "Flags",
          "fields": {
            "is_system":    { "display_type": "checkbox" },
            "is_active":    { "display_type": "checkbox" },
            "is_protected": { "display_type": "checkbox" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```

---

### 12.7 `apps`

DB columns: `slug`, `name`, `description`, `icon`, `color`, `version`, `app_type`, `source`, `is_active`, `is_system`, `min_role`, `created_at`, `updated_at`

```json
{
  "fields": {
    "slug": {
      "data_type": "text",
      "label": "Slug",
      "required": true,
      "system": true,
      "validation": null
    },
    "name": {
      "data_type": "text",
      "label": "Name",
      "required": true,
      "system": true,
      "validation": null
    },
    "description": {
      "data_type": "textarea",
      "label": "Description",
      "required": false,
      "system": true,
      "validation": null
    },
    "icon": {
      "data_type": "text",
      "label": "Icon",
      "required": false,
      "system": true,
      "validation": null
    },
    "color": {
      "data_type": "text",
      "label": "Color",
      "required": false,
      "system": true,
      "validation": null
    },
    "version": {
      "data_type": "text",
      "label": "Version",
      "required": true,
      "system": true,
      "validation": null
    },
    "app_type": {
      "data_type": "text",
      "label": "App Type",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "source": {
      "data_type": "text",
      "label": "Source",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "is_active": {
      "data_type": "boolean",
      "label": "Active",
      "required": true,
      "system": true,
      "validation": null
    },
    "is_system": {
      "data_type": "boolean",
      "label": "System App",
      "required": true,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "min_role": {
      "data_type": "text",
      "label": "Minimum Role",
      "required": false,
      "system": true,
      "validation": null
    },
    "created_at": {
      "data_type": "datetime",
      "label": "Created",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    },
    "updated_at": {
      "data_type": "datetime",
      "label": "Updated",
      "required": false,
      "system": true,
      "readonly": true,
      "validation": null
    }
  },
  "views": {
    "default_list": {
      "type": "list",
      "display": "table",
      "label": "Apps",
      "fields": {
        "name":      { "sortable": true, "display_type": "text" },
        "slug":      { "sortable": true, "display_type": "text" },
        "version":   { "sortable": true, "display_type": "text" },
        "app_type":  { "sortable": true, "display_type": "badge" },
        "is_active": { "sortable": true, "display_type": "badge" },
        "created_at":{ "sortable": true, "display_type": "timestamp" }
      },
      "default_sort": { "field": "name", "direction": "asc" }
    },
    "default_detail": {
      "type": "detail",
      "label": "App Detail",
      "sections": [
        {
          "title": "Identity",
          "fields": {
            "name":        { "display_type": "input" },
            "slug":        { "display_type": "input" },
            "description": { "display_type": "textarea" },
            "icon":        { "display_type": "input" },
            "color":       { "display_type": "input" }
          }
        },
        {
          "title": "Configuration",
          "fields": {
            "version":   { "display_type": "input" },
            "app_type":  { "display_type": "text" },
            "source":    { "display_type": "text" },
            "min_role":  { "display_type": "input" }
          }
        },
        {
          "title": "Flags",
          "fields": {
            "is_active": { "display_type": "checkbox" },
            "is_system": { "display_type": "checkbox" }
          }
        },
        {
          "title": "System",
          "fields": {
            "created_at": { "display_type": "timestamp" },
            "updated_at": { "display_type": "timestamp" }
          }
        }
      ]
    }
  },
  "record_permissions": {
    "system-admin": ["create", "read", "update", "delete"]
  },
  "functionality": null
}
```
