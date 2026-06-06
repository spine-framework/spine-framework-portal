/**
 * @module src/hooks/useSchemaRecord
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Schema-record data management hooks. Two complementary hooks:
 *
 * - **`useSchemaRecord`** — given an already-fetched record and its schema
 *   type, returns structured `FieldDefinition[]`, a managed `data` state
 *   seeded from `record.data` with schema defaults, and field setters.
 *   Used on detail/edit pages where the record is fetched by a parent hook.
 *
 * - **`useTypeSelection`** — fetches all types of a given `kind` and exposes
 *   a `selectedTypeId` state. Used on create pages for the type-first flow
 *   where the user picks a type before filling in fields.
 *
 * **Data seeding invariant:** `useSchemaRecord` re-seeds `data` state only
 * when `record.id` or `schemaType.id` changes, not on every render. This
 * prevents losing unsaved edits during re-renders.
 *
 * @seeAlso src/hooks/useEntityRecord.ts (fetches the record passed here)
 * @seeAlso src/hooks/useForm.ts (consumes FieldDefinition[] from this hook)
 * @seeAlso src/types/types.ts (FieldDefinition, ItemType)
 */

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { FieldDefinition, ItemType } from '../types/types'

// ─── TYPES ───────────────────────────────────────────────────────────────────

/**
 * A record from the `types` table as loaded for schema resolution.
 * @prop design_schema - Full design schema including fields and views
 */
export interface SchemaType {
  id: string
  name: string
  slug: string
  kind?: string
  icon?: string
  color?: string
  app_id?: string
  design_schema: ItemType['design_schema']
}

/**
 * A generic record that may carry its resolved type in a nested `type` join.
 * @prop data - The JSONB `data` column; all custom field values live here
 */
export interface SchemaRecord {
  id: string
  type_id?: string
  type?: SchemaType
  data: Record<string, any>
  [key: string]: any
}

/** Options for `useSchemaRecord`. */
export interface UseSchemaRecordOptions {
  typeApiKind: string // e.g. 'account', 'person', 'item'
}

/**
 * Return value of `useSchemaRecord`.
 *
 * @prop fields - Ordered `FieldDefinition[]` from schema; empty if no schema
 * @prop data - Managed field values (seeded from `record.data` + defaults)
 * @prop setData - Replace the entire data map
 * @prop setField - Update a single field by name
 * @prop schemaType - The resolved schema type (passed through)
 * @prop loading - Always false (data is derived, not fetched here)
 * @prop error - Always null
 */
export interface UseSchemaRecordResult {
  fields: FieldDefinition[]
  data: Record<string, any>
  setData: (data: Record<string, any>) => void
  setField: (name: string, value: any) => void
  schemaType: SchemaType | null
  loading: boolean
  error: string | null
}

// ─── useSchemaRecord ─────────────────────────────────────────────────────────

/**
 * Given an already-fetched record and its resolved schema type, returns
 * structured field definitions and a managed data state for the record's
 * `.data` JSONB column, with schema defaults seeded on load.
 *
 * Does NOT fetch anything — this is a pure derived-state hook.
 *
 * @param record - Fetched record (or null while loading)
 * @param schemaType - Resolved schema type (or null while loading)
 * @returns `UseSchemaRecordResult`
 *
 * @inputSpec record.data: Record<string, any> | undefined — custom field values
 * @inputSpec schemaType.design_schema.fields: FieldDefinition map
 * @outputSpec fields: FieldDefinition[] — ordered array with `.name` injected
 * @sideEffects React state mutations (data re-seed on record/type change only)
 * @calledBy DataDetailPage.tsx, create pages
 *
 * @example
 * ```tsx
 * const { fields, data, setField } = useSchemaRecord(record, schemaType)
 * ```
 */
export function useSchemaRecord(
  record: SchemaRecord | null,
  schemaType: SchemaType | null
): UseSchemaRecordResult {
  const [data, setDataState] = useState<Record<string, any>>({})

  // Re-seed data state only when the record id or schema type id changes
  const recordId = record?.id ?? null
  const schemaTypeId = schemaType?.id ?? null

  useEffect(() => {
    if (!record) return

    const base = record.data ? { ...record.data } : {}

    // Seed defaults for fields that have no value
    if (schemaType?.design_schema?.fields) {
      for (const [name, field] of Object.entries(schemaType.design_schema.fields)) {
        if (base[name] === undefined && (field as any).defaultValue !== undefined) {
          base[name] = (field as any).defaultValue
        }
      }
    }

    setDataState(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, schemaTypeId])

  const setData = useCallback((newData: Record<string, any>) => {
    setDataState(newData)
  }, [])

  const setField = useCallback((name: string, value: any) => {
    setDataState(prev => ({ ...prev, [name]: value }))
  }, [])

  const fields: FieldDefinition[] = schemaType?.design_schema?.fields
    ? Object.entries(schemaType.design_schema.fields).map(([name, field]) => ({ ...field, name }))
    : []

  return {
    fields,
    data,
    setData,
    setField,
    schemaType,
    loading: false,
    error: null
  }
}

// ─── useTypeSelection ─────────────────────────────────────────────────────────

/**
 * Return value of `useTypeSelection`.
 *
 * @prop types - All active types of the requested kind
 * @prop selectedType - The full `SchemaType` for `selectedTypeId`, or null
 * @prop selectedTypeId - Controlled string state for the `<select>` value
 * @prop setSelectedTypeId - Setter for `selectedTypeId`
 * @prop loading - True while fetching types
 * @prop error - Error message or null
 */
export interface UseTypeSelectionResult {
  types: SchemaType[]
  selectedType: SchemaType | null
  selectedTypeId: string
  setSelectedTypeId: (id: string) => void
  loading: boolean
  error: string | null
}

/**
 * Fetches all active types of a given `kind` and exposes a controlled
 * `selectedTypeId` state for the type-first create flow.
 *
 * @param kind - Type kind: `'account'`, `'person'`, `'item'`, etc.
 * @returns `UseTypeSelectionResult`
 *
 * @inputSpec kind: string — passed as `?kind=<kind>&is_active=true` to `/api/types`
 * @outputSpec types: SchemaType[] — active types; empty while loading
 * @sideEffects Network request via apiFetch on mount and kind change
 * @calledBy Create pages (e.g. AccountCreatePage, ItemCreatePage)
 */
export function useTypeSelection(kind: string): UseTypeSelectionResult {
  const [types, setTypes] = useState<SchemaType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch(`/api/types?action=list&kind=${kind}&is_active=true`)
      .then(r => r.json())
      .then(result => {
        if (!cancelled) {
          setTypes(result.data || [])
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load types')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [kind])

  const selectedType = types.find(t => t.id === selectedTypeId) ?? null

  return { types, selectedType, selectedTypeId, setSelectedTypeId, loading, error }
}
