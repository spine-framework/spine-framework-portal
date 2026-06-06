/**
 * @module src/components/ui/Form
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Schema-driven form layout components.
 *
 * **`Form`** — renders a `<form>` element from an ordered `FieldDefinition[]`
 * array via `FieldRenderer`. Manages touched-based error display (errors only
 * shown for fields the user has interacted with). Includes Submit + optional
 * Cancel buttons.
 *
 * **`FormField`** — single field wrapper delegating to `FieldRenderer` with
 * touched-based error display.
 *
 * **`FormSection`** — optional titled group container for logical field
 * groups within a form.
 *
 * **`FormRow`** / **`FormColumn`** — two-column responsive grid layout
 * helpers. `FormColumn` accepts `span=2` to span both columns.
 *
 * @seeAlso src/components/shared/FieldRenderer.tsx
 * @seeAlso src/hooks/useForm.ts (state management companion)
 */

import React from 'react'
import { FieldDefinition } from '../../types/types'
import { FieldRenderer } from '../shared/FieldRenderer'
import { Button } from './button'
import { cn } from '../../lib/utils'

/**
 * Props for `Form`.
 *
 * @prop fields - Ordered field definitions to render
 * @prop data - Controlled field values keyed by field name
 * @prop errors - Validation errors per field name
 * @prop touched - Map of fields that have been interacted with
 * @prop onChange - `(field, value)` change callback
 * @prop onBlur - `(field)` blur callback for marking a field as touched
 * @prop onSubmit - Form submit handler (receives the native `FormEvent`)
 * @prop isSubmitting - Shows spinner on submit button when true
 * @prop submitText - Submit button label (default: `'Submit'`)
 * @prop cancelText - Cancel button label (default: `'Cancel'`)
 * @prop onCancel - Cancel button callback
 * @prop showCancel - Shows the cancel button (default: `false`)
 * @prop disabled - Disables all fields and the submit button
 * @prop className - Additional Tailwind classes for the `<form>` element
 */
interface FormProps {
  fields: FieldDefinition[]
  data: Record<string, any>
  errors: Record<string, string>
  touched: Record<string, boolean>
  onChange: (field: string, value: any) => void
  onBlur?: (field: string) => void
  onSubmit?: (e: React.FormEvent) => void
  isSubmitting?: boolean
  submitText?: string
  cancelText?: string
  onCancel?: () => void
  showCancel?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Schema-driven `<form>` with submit + optional cancel actions.
 *
 * @param props - `FormProps`
 * @returns Form element with field list and action buttons
 * @sideEffects Calls `e.preventDefault()` on submit before forwarding to `onSubmit`
 */
export function Form({
  fields,
  data,
  errors,
  touched,
  onChange,
  onBlur,
  onSubmit,
  isSubmitting = false,
  submitText = 'Submit',
  cancelText = 'Cancel',
  onCancel,
  showCancel = false,
  disabled = false,
  className
}: FormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  const handleFieldChange = (fieldName: string, value: any) => {
    onChange(fieldName, value)
  }

  const handleFieldBlur = (fieldName: string) => {
    onBlur?.(fieldName)
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {fields.filter(f => !!f.name).map((field) => {
        const name = field.name!
        return (
          <FieldRenderer
            key={name}
            field={field}
            value={data[name]}
            onChange={(value) => handleFieldChange(name, value)}
            error={touched[name] ? errors[name] : undefined}
            onBlur={() => handleFieldBlur(name)}
            readonly={disabled}
          />
        )
      })}

      {/* Form Actions */}
      <div className="flex justify-end space-x-3">
        {showCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelText}
          </Button>
        )}
        
        <Button
          type="submit"
          loading={isSubmitting}
          disabled={disabled}
        >
          {submitText}
        </Button>
      </div>
    </form>
  )
}

/**
 * Props for `FormField`.
 *
 * @prop field - Field definition
 * @prop value - Current value
 * @prop error - Validation error string
 * @prop touched - Whether this field has been interacted with (gates error display)
 * @prop onChange / onBlur / readonly - Passed through to `FieldRenderer`
 */
interface FormFieldProps {
  field: FieldDefinition
  value: any
  error?: string
  touched?: boolean
  onChange: (value: any) => void
  onBlur?: () => void
  readonly?: boolean
}

/**
 * Single field with touched-gated error display.
 *
 * @param props - `FormFieldProps`
 * @returns `FieldRenderer` instance with error shown only when touched
 * @sideEffects none (delegates to `onChange` / `onBlur`)
 */
export function FormField({
  field,
  value,
  error,
  touched,
  onChange,
  onBlur,
  readonly = false
}: FormFieldProps) {
  return (
    <FieldRenderer
      field={field}
      value={value}
      onChange={onChange}
      error={touched ? error : undefined}
      onBlur={onBlur}
      readonly={readonly}
    />
  )
}

/**
 * Props for `FormSection`.
 *
 * @prop title - Optional section heading
 * @prop description - Optional subtitle text
 */
interface FormSectionProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

/**
 * Titled group container for a set of related form fields.
 *
 * @param props - `FormSectionProps`
 * @returns `<div>` with optional title/description and `children` below
 * @sideEffects none (pure rendering)
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) && (
        <div>
          {title && (
            <h3 className="text-lg font-medium text-slate-900">{title}</h3>
          )}
          {description && (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

/** Props for `FormRow`. */
interface FormRowProps {
  children: React.ReactNode
  className?: string
}

/**
 * Two-column responsive grid row for form fields.
 *
 * @param props - children + optional className
 * @returns `<div>` with `grid-cols-1 sm:grid-cols-2 gap-4`
 * @sideEffects none (pure rendering)
 */
export function FormRow({ children, className }: FormRowProps) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', className)}>
      {children}
    </div>
  )
}

/**
 * Props for `FormColumn`.
 *
 * @prop span - Column span within a `FormRow` (1 or 2, default: 1)
 */
interface FormColumnProps {
  children: React.ReactNode
  span?: 1 | 2
  className?: string
}

/**
 * Column within a `FormRow` grid.
 *
 * @param props - `FormColumnProps`
 * @returns `<div>` with appropriate `col-span` class
 * @sideEffects none (pure rendering)
 */
export function FormColumn({ children, span = 1, className }: FormColumnProps) {
  const spanClasses = {
    1: 'col-span-1',
    2: 'col-span-2'
  }

  return (
    <div className={cn(spanClasses[span], className)}>
      {children}
    </div>
  )
}
