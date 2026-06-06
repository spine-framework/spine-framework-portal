/**
 * @module src/components/runtime/SchemaDetailForm
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Renders a `DetailView`'s sections as a schema-driven form. Each
 * `DetailViewSection` becomes a white card containing a `SchemaFields`
 * grid. Field definitions come from `DesignSchema.fields`; display widget
 * overrides come from the view's per-field `ViewFieldConfig.display_type`.
 *
 * **Field source resolution:**
 * - Field schema (`data_type`, `required`, `validation`, etc.) →
 *   `schema.fields[fieldName]`
 * - Display widget override → `view.sections[n].fields[fieldName].display_type`
 * - `system` fields read from `record[fieldName]`; custom fields read
 *   from `record.data[fieldName]` (split handled upstream by `DataDetailPage`)
 *
 * **Read vs edit rendering:** passes `readonly={!isEditing}` to `SchemaFields`
 * so all field components switch between display and input mode.
 *
 * @seeAlso src/components/shared/SchemaFields.tsx
 * @seeAlso src/types/types.ts (DesignSchema, DetailView)
 * @seeAlso src/components/runtime/DataDetailPage.tsx (parent, owns form state)
 */

import { DesignSchema, DetailView, DetailViewSection, FieldDefinition } from '../../types/types'
import { SchemaFields } from '../shared/SchemaFields'

/**
 * Props for `SchemaDetailForm`.
 *
 * @prop schema - Full `DesignSchema` for field definitions and permissions
 * @prop view - The `default_detail` `DetailView` from the schema
 * @prop record - Raw fetched record (used in read-only mode)
 * @prop isEditing - If true, renders input fields; false = read-only display
 * @prop isCreating - If true, skips reading from `record` (no record yet)
 * @prop permissions - Per-field `{ read, write }` map from `useEntityRecord`
 * @prop formData - Controlled values for all fields (owned by `DataDetailPage`)
 * @prop onFieldChange - Callback to update a single field value
 */
interface SchemaDetailFormProps {
  schema: DesignSchema
  view: DetailView
  record: any
  isEditing: boolean
  isCreating: boolean
  permissions: Record<string, { read: boolean; write: boolean }>
  formData: Record<string, any>
  onFieldChange: (key: string, value: any) => void
}

/**
 * Renders a schema-defined `DetailView` as a sectioned form.
 *
 * @param props - `SchemaDetailFormProps`
 * @returns One card per `DetailViewSection`, or an empty-state message
 * @sideEffects none (pure rendering)
 */
export function SchemaDetailForm({
  schema,
  view,
  record,
  isEditing,
  isCreating,
  permissions,
  formData,
  onFieldChange
}: SchemaDetailFormProps) {
  
  const renderSection = (section: DetailViewSection, sectionIndex: number) => {
    const fieldNames = Array.isArray(section.fields) ? section.fields : Object.keys(section.fields || {})
    const sectionFields = fieldNames.map((fieldName: string) => {
      const fieldDef = schema.fields[fieldName]
      if (!fieldDef) return null

      return {
        name: fieldName,
        label: fieldDef.label,
        data_type: fieldDef.data_type,
        required: fieldDef.required,
        validation: fieldDef.validation,
        options: fieldDef.options,
        permissions: fieldDef.permissions,
        system: fieldDef.system
      } as FieldDefinition
    }).filter((field): field is NonNullable<typeof field> => field !== null)

    // Build display_type map from view config — keeps field definitions clean
    const displayTypes: Record<string, string> = {}
    if (!Array.isArray(section.fields)) {
      Object.entries(section.fields || {}).forEach(([fieldName, viewConfig]: [string, any]) => {
        if (viewConfig.display_type) {
          displayTypes[fieldName] = viewConfig.display_type
        }
      })
    }

    if (sectionFields.length === 0) return null

    return (
      <div key={sectionIndex} className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-slate-900 mb-4">
          {section.title}
        </h3>
        
        <SchemaFields
          fields={sectionFields}
          data={isCreating || isEditing ? formData : (record || {})}
          readonly={!isEditing}
          twoColumn={false}
          onChange={onFieldChange}
          displayTypes={displayTypes}
        />
      </div>
    )
  }

  if (!view.sections || view.sections.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-8">
          <p className="text-slate-500">No fields configured for this view</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {view.sections.map((section, index) => renderSection(section, index))}
    </div>
  )
}
