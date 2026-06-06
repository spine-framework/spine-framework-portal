/**
 * @module src/components/shared/SchemaFields
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Schema-driven field grid. Renders an ordered list of `FieldDefinition`
 * entries via `FieldRenderer`, managing the name→value mapping and
 * propagating `onChange` calls back to the parent.
 *
 * **Value source resolution** (per field):
 * - `system` flag set → `data[name]` (top-level column)
 * - `system` flag unset → `data.data?.[name] ?? data[name]` (JSONB field
 *   with column fallback)
 *
 * **Layout:** two-column responsive grid by default (`twoColumn=true`);
 * pass `twoColumn=false` for a single-column stacked layout.
 *
 * **Exports:**
 * - `SchemaFields` — full editable/read-only field grid
 * - `SchemaFieldDisplay` — read-only single-field key:value display row
 * - `SchemaField` (unexported) — internal wrapper binding name to value
 *
 * @seeAlso src/components/shared/FieldRenderer.tsx
 * @seeAlso src/types/types.ts (FieldDefinition)
 * @seeAlso src/components/runtime/SchemaDetailForm.tsx (primary consumer)
 */

import React from 'react'
import { FieldDefinition } from '../../types/types'
import { FieldRenderer } from './FieldRenderer'

/**
 * Props for `SchemaFields`.
 *
 * @prop fields - Ordered array of field definitions to render
 * @prop data - Record containing current field values; may be flat or
 *   nested under a `.data` key for JSONB fields
 * @prop onChange - `(name, value)` callback; omit for pure read-only display
 * @prop readonly - Passes read-only mode down to every `FieldRenderer`
 * @prop errors - Per-field validation error messages
 * @prop twoColumn - Two-column responsive grid (default: `true`)
 * @prop displayTypes - Widget override map keyed by field name (from view config)
 */
interface SchemaFieldsProps {
  fields: FieldDefinition[]
  data: Record<string, any>
  onChange?: (name: string, value: any) => void
  readonly?: boolean
  errors?: Record<string, string>
  /** Render fields in a two-column grid (default: true) */
  twoColumn?: boolean
  /** display_type per field key, sourced from view config — never from field definitions */
  displayTypes?: Record<string, string>
}

/**
 * Renders a full schema field grid.
 *
 * @param props - `SchemaFieldsProps`
 * @returns Two-column (or single-column) field grid, or an empty-state message
 * @sideEffects none (delegates changes to `onChange`)
 */
export function SchemaFields({
  fields,
  data,
  onChange,
  readonly = false,
  errors = {},
  twoColumn = true,
  displayTypes = {}
}: SchemaFieldsProps) {
  if (!fields || fields.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">No schema fields defined for this type.</p>
    )
  }

  return (
    <div className={twoColumn ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}>
      {fields.filter(f => !!f.name).map((field) => {
        const name = field.name!
        return (
          <SchemaField
            key={name}
            field={field}
            value={field.system ? data[name] : (data.data?.[name] ?? data[name])}
            onChange={onChange}
            readonly={readonly || field.readonly}
            error={errors[name]}
            displayType={displayTypes[name]}
          />
        )
      })}
    </div>
  )
}

/** Internal props for the `SchemaField` name-binding wrapper. */
interface SchemaFieldProps {
  field: FieldDefinition
  value: any
  onChange?: (name: string, value: any) => void
  readonly?: boolean
  error?: string
  displayType?: string
}

function SchemaField({ field, value, onChange, readonly, error, displayType }: SchemaFieldProps) {
  return (
    <FieldRenderer
      field={field}
      value={value}
      onChange={readonly ? undefined : (val) => field.name && onChange?.(field.name, val)}
      readonly={readonly}
      error={error}
      displayType={displayType}
    />
  )
}

/**
 * Read-only display of a single schema field value as a label:value row.
 * Useful for compact detail views outside the full form layout.
 *
 * @param field - Field definition (used for label and data_type formatting)
 * @param value - Raw value to display
 * @returns A `<div>` with label on the left and formatted value on the right
 * @sideEffects none (pure rendering)
 */
export function SchemaFieldDisplay({
  field,
  value
}: {
  field: FieldDefinition
  value: any
}) {
  const displayValue = formatFieldValue(field, value)

  return (
    <div className="flex justify-between items-start py-2">
      <dt className="text-xs text-slate-500 font-medium flex-shrink-0 mr-4">
        {field.label || field.name}:
      </dt>
      <dd className="text-sm text-slate-900 text-right">
        {displayValue}
      </dd>
    </div>
  )
}

/**
 * Formats a raw field value for read-only display, applying type-specific
 * transformations:
 * - `boolean`/`checkbox` → `'Yes'` / `'No'`
 * - `date` / `datetime` → locale string
 * - `select` → resolves option label from `field.options`
 * - `multiselect` → comma-joined option labels
 * - `json` → `<pre>` code block
 * - `url` → `<a>` link
 * - Null/undefined/empty → em-dash placeholder
 *
 * @param field - Field definition
 * @param value - Raw value
 * @returns Formatted `ReactNode`
 */
function formatFieldValue(field: FieldDefinition, value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-400 italic">—</span>
  }

  switch (field.data_type) {
    case 'boolean':
    case 'checkbox':
      return value ? 'Yes' : 'No'

    case 'date':
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return String(value)
      }

    case 'datetime':
      try {
        return new Date(value).toLocaleString()
      } catch {
        return String(value)
      }

    case 'select': {
      const option = field.options?.find(o => typeof o === 'object' && o.value === value)
      return option && typeof option === 'object' ? option.label : String(value)
    }

    case 'multiselect': {
      if (!Array.isArray(value)) return String(value)
      return value.map(v => {
        const option = field.options?.find(o => typeof o === 'object' && o.value === v)
        return option && typeof option === 'object' ? option.label : v
      }).join(', ')
    }

    case 'json':
      return (
        <pre className="text-xs bg-slate-50 rounded p-2 max-w-xs overflow-x-auto">
          {JSON.stringify(value, null, 2)}
        </pre>
      )

    case 'url':
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline"
        >
          {value}
        </a>
      )

    default:
      return String(value)
  }
}
