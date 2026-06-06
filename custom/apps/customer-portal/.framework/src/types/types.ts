/**
 * @module src/types/types
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Core TypeScript type definitions for the Spine frontend. These types
 * mirror the `design_schema` and API response shapes used across hooks,
 * components, and pages.
 *
 * **Type hierarchy:**
 * ```
 * DesignSchema
 *   ├── fields: Record<string, FieldDefinition>
 *   ├── views: Record<string, View>   ← ListView | DetailView
 *   ├── record_permissions
 *   └── functionality?: FunctionalityBindings
 * ItemType  ← row in v2.types table
 * Item       ← row in v2.items table
 * ```
 *
 * **`system` flag on `FieldDefinition`:** When `system: true`, the field
 * maps to a real DB column (e.g. `title`, `status`). When absent or false,
 * the field value lives in the `data` JSONB column.
 *
 * @seeAlso src/hooks/useSchemaRecord.ts (consumes FieldDefinition[])
 * @seeAlso src/hooks/useForm.ts (consumes FieldDefinition[] for validation)
 * @seeAlso src/hooks/useListSchema.ts (consumes DesignSchema + View)
 * @seeAlso functions/_shared/schema-utils.ts (server-side schema generation)
 */

// ─── FIELD DEFINITIONS ───────────────────────────────────────────────────────────

/**
 * Definition of a single field in a `design_schema`. Drives both UI rendering
 * and client-side validation in `useForm`.
 *
 * @prop data_type - Controls rendering widget and validation rules
 * @prop label - Human-readable display label
 * @prop required - Whether the field must be non-empty on save
 * @prop system - If true, maps to a top-level DB column; false/absent → `data` JSONB
 * @prop name - Injected at runtime by hooks; not stored in the schema itself
 * @prop validation - Type-specific constraint overrides
 * @prop options - Choice list for select/multiselect/radio fields
 * @prop permissions - Role-based read/write access map; absent = all roles allowed
 */
export interface FieldDefinition {
  data_type: 'text' | 'textarea' | 'rich_text' | 'email' | 'phone' | 'url' | 
             'number' | 'currency' | 'range' | 'date' | 'datetime' | 'boolean' | 
             'checkbox' | 'select' | 'multiselect' | 'radio' | 'color' | 
             'file' | 'image' | 'json' | 'reference' | 'address'
  label: string
  required: boolean
  system?: boolean // true = DB column, false/absent = custom field in .data
  // Runtime identity — populated by SchemaFields when building field arrays from schema
  name?: string
  // UI hints — informational only, do not affect data contract or permissions
  placeholder?: string
  description?: string
  rows?: number
  min?: number
  max?: number
  step?: number
  readonly?: boolean
  disabled?: boolean
  validation?: {
    pattern?: string
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    step?: number
    integer?: boolean
    precision?: number
    maxSize?: number
    allowedTypes?: string[]
    maxWidth?: number
    maxHeight?: number
    currency_code?: string
    reference_kind?: string
    reference_type?: string
  }
  // Type-specific constraint properties (move out of validation for clarity)
  options?: (string | { value: string; label: string })[] // For select/multiselect/radio
  permissions?: {
    [role: string]: string[] // Array of actions: ["read", "write"]
  }
}

// ─── VIEW TYPES ─────────────────────────────────────────────────────────────────

/**
 * Per-field display/behaviour config within a view. Stored as
 * `design_schema.views[viewSlug].fields[fieldName]`.
 *
 * @prop display_type - Override the default widget for this field in this view
 * @prop sortable - Whether the column header shows a sort toggle in list views
 * @prop searchable - Whether the field is included in free-text search
 */
export interface ViewFieldConfig {
  display_type: 'input' | 'textarea' | 'rich_text' | 'select' | 'multiselect' | 
                 'radio' | 'checkbox' | 'switch' | 'date_picker' | 'datetime_picker' | 
                 'color_picker' | 'file_upload' | 'image_upload' | 'range_slider' | 
                 'rating' | 'autocomplete' | 'address_form' | 'reference_picker' |
                 'text' | 'badge' | 'timestamp' | 'currency' | 'number'
  sortable?: boolean
  searchable?: boolean
}

/**
 * A list view definition. Rendered by `DataListPage` as a table, card grid,
 * or Kanban board depending on `display`.
 *
 * @prop fields - Ordered map of field name → `ViewFieldConfig`
 * @prop default_sort - Initial sort applied before user interaction
 * @prop filters - Field names to expose as filter controls
 * @prop stats - Summary stat cards shown above the list
 * @prop group_by - Field to use as board column grouping (`display: 'board'` only)
 */
export interface ListView {
  type: 'list'
  display: 'table' | 'card' | 'board'
  label: string
  fields: Record<string, ViewFieldConfig>
  default_sort?: {
    field: string
    direction: 'asc' | 'desc'
  }
  filters?: string[]
  stats?: Array<{
    title: string
    type: 'count' | 'filter_count'
    icon?: string
    color?: string
    filter?: Record<string, any>
  }>
  group_by?: string // For board display
}

/**
 * A single section within a `DetailView`. Groups related fields under
 * an optional title. Field permissions from the schema still apply —
 * there are no section-level permission overrides.
 */
export interface DetailViewSection {
  title: string
  fields: Record<string, ViewFieldConfig>
  // Note: No view-level permissions - field permissions from schema apply
}

/**
 * A detail view definition. Rendered by `DataDetailPage` as a sectioned
 * record form.
 */
export interface DetailView {
  type: 'detail'
  label: string
  sections: DetailViewSection[]
}

/** Discriminated union of all supported view types. */
export type View = ListView | DetailView

// ─── FUNCTIONALITY BINDINGS ──────────────────────────────────────────────────────────

/**
 * Optional automation and integration bindings attached to a `DesignSchema`.
 * Each array entry describes a trigger condition and the target pipeline,
 * agent, embedding, integration, or constraint.
 *
 * These bindings are evaluated by API handlers and the system cron — not
 * by the frontend. They are included here as a type contract so the frontend
 * can read and display binding metadata without making blind `any` casts.
 */
export interface FunctionalityBindings {
  pipelines?: Array<{
    pipeline_id: string
    trigger: 'manual' | 'on_create' | 'on_update' | 'on_field_change' | 'on_delete' | 'scheduled'
    field?: string // For on_field_change
    condition?: string // Expression string
    roles: string[]
  }>
  ai_agents?: Array<{
    agent_id: string
    capabilities: ('read' | 'summarize' | 'suggest' | 'update')[]
    trigger: 'manual' | 'on_create' | 'on_update' | 'on_field_change'
    roles: string[]
  }>
  embeddings?: Array<{
    slug: string
    fields: string[]
    model: string
    vector_column: string
    trigger: 'on_create' | 'on_update' | 'on_create_or_update'
  }>
  integrations?: Array<{
    integration_id: string
    sync: 'bidirectional' | 'inbound' | 'outbound'
    field_map: Record<string, {
      external_field: string
      direction: 'both' | 'inbound' | 'outbound' | 'none'
      transform?: string
    }>
    trigger: 'on_create' | 'on_update' | 'on_create_or_update'
  }>
  constraints?: Array<{
    type: 'unique' | 'conditional_required' | 'immutable'
    fields?: string[] // For unique
    field?: string // For conditional_required and immutable
    condition?: string // For conditional_required
    message: string
    after?: 'create' | 'update' // For immutable
  }>
}

// ─── DESIGN SCHEMA ────────────────────────────────────────────────────────────────

/**
 * The complete design schema for a `types` record. Stored as a JSONB column
 * (`design_schema`) and stamp-copied onto records at create time.
 *
 * @prop record_permissions - Role → allowed CRUD actions map for the entire record
 * @prop fields - All field definitions keyed by field name
 * @prop views - Named view definitions (`list`, `detail`, etc.)
 * @prop functionality - Optional automation bindings (pipelines, agents, etc.)
 */
export interface DesignSchema {
  record_permissions: {
    [role: string]: string[] // Array of actions: ["create", "read", "update", "delete"]
  }
  fields: Record<string, FieldDefinition>
  views: Record<string, View>
  functionality?: FunctionalityBindings
}

// ─── RECORD SHAPES ─────────────────────────────────────────────────────────────────

/**
 * A row from the `v2.types` table. Represents a type definition (item type,
 * account type, person type, etc.) including its full `design_schema`.
 *
 * @prop kind - Discriminator: `'item'` | `'account'` | `'person'` | etc.
 * @prop design_schema - Full schema defining fields, views, and functionality
 * @prop validation_schema - Auto-generated JSON Schema used for server-side validation
 * @prop ownership - `'pack'` | `'tenant'` (pack-ownership tracking)
 */
export interface ItemType {
  id: string
  name: string
  slug: string
  kind: string
  description?: string
  icon?: string
  color?: string
  design_schema: DesignSchema
  validation_schema: {
    fields: Record<string, {
      data_type: string
      required?: boolean
      [key: string]: any // Type-specific validation properties
    }>
  }
  ownership: string
  is_active: boolean
  app_id?: string
  app?: any
  created_at: string
  updated_at: string
}

/**
 * A row from the `v2.items` table. The `data` JSONB column holds all
 * custom field values; system fields (`title`, `status`, etc.) are top-level.
 *
 * @prop design_schema - Stamp of the type's schema at create time (for resilience
 *   to schema changes; may be stale relative to `types` table)
 * @prop validation_schema - Stamp of the validation schema at create time
 */
export interface Item {
  id: string
  item_type_id: string
  item_type_slug?: string
  title: string
  description?: string
  status: string
  is_active: boolean
  data: Record<string, any>
  created_at: string
  updated_at: string
  created_by?: string
  account_id: string
  app_id?: string
  design_schema?: Record<string, any> // Schema snapshot at creation time
  validation_schema?: Record<string, any> // Validation schema snapshot at creation time
}

// ─── FORM & QUERY TYPES ───────────────────────────────────────────────────────────

/** A field-level validation failure from `useForm` or server-side validation. */
export interface ValidationError {
  field: string
  message: string
}

/** Snapshot of form state — used as a shared type between `useForm` and form components. */
export interface FormState {
  data: Record<string, any>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  isValid: boolean
}

/** Pagination query parameters for list endpoints. */
export interface PaginationParams {
  limit?: number
  offset?: number
  page?: number
}

/** Sort order specification for list endpoints. */
export interface SortParams {
  field: string
  direction: 'asc' | 'desc'
}

/** Arbitrary key→value filter map for list endpoints. */
export interface FilterParams {
  [key: string]: any
}

/** Combined search, sort, filter, and pagination params for list queries. */
export interface SearchParams extends PaginationParams {
  search?: string
  sort?: SortParams
  filters?: FilterParams
}

// ─── UI DISPLAY TYPES ────────────────────────────────────────────────────────────────

/** A rendered column descriptor for list/table UI components. */
export interface EntityColumn {
  key: string
  label: string
  sortable?: boolean
  type?: string
  display_type?: string
  badgeColors?: Record<string, string>
  maxLength?: number
}

/** A stat card shown above entity list pages (count or filtered count). */
export interface EntityStat {
  title: string
  type: 'count' | 'filter_count'
  icon: string
  color: string
  filter?: Record<string, any>
}

/** A filter control definition for entity list pages. */
export interface EntityFilter {
  key: string
  label: string
  type: 'search' | 'enum' | 'boolean'
  options?: string[]
}

// ─── ITEM PROGRESS ───────────────────────────────────────────────────────────

/**
 * A per-person, per-item progress record. Tracks pipeline status, score, and
 * arbitrary interaction data for courses, onboarding, tasks, and quizzes.
 *
 * `title` is auto-composed as "<item title> — <person name>".
 * `description` is auto-composed as "Completed · score 85 · 2 attempts".
 * `data` holds extensible fields: attempts, time_spent, last_position, etc.
 *
 * INVARIANT: (person_id, item_id) is unique — state, not a log.
 */
export interface ItemProgress {
  id: string
  type_id: string
  account_id: string
  app_id: string | null
  person_id: string
  item_id: string
  title: string | null
  description: string | null
  status: 'not_started' | 'in_progress' | 'completed' | string
  score: number | null
  data: {
    attempts?: number
    time_spent?: number
    last_position?: number
    started_at?: string
    completed_at?: string
    [key: string]: any
  }
  is_active: boolean
  design_schema: Record<string, any>
  validation_schema: Record<string, any>
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
