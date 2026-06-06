/**
 * @module src/hooks/useForm
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Schema-aware form state hook. Manages field values, touched state,
 * per-field validation (required, email, url, number range, text
 * length/pattern), and form submission with async support.
 *
 * Designed to work directly with `FieldDefinition[]` arrays produced
 * by `useSchemaRecord` or static field arrays in admin forms.
 *
 * **Validation order per field:**
 * 1. Required check
 * 2. Type-specific rule (email regex, URL parse, number range, text length/pattern)
 * 3. Custom `validate` function (whole-form)
 *
 * @seeAlso src/types/types.ts (FieldDefinition — field schema shape)
 * @seeAlso src/hooks/useSchemaRecord.ts (produces FieldDefinition[] for this hook)
 * @seeAlso src/components/shared/SchemaFields.tsx (renders fields from FieldDefinition[])
 */

import { useState, useCallback, useEffect } from 'react'
import { FieldDefinition, FormState, ValidationError } from '../types/types'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface UseFormOptions {
  initialValues: Record<string, any>
  fields: FieldDefinition[]
  onSubmit?: (values: Record<string, any>) => void | Promise<void>
  validate?: (values: Record<string, any>) => Record<string, string>
  onChange?: (values: Record<string, any>) => void
}

/**
 * Return value of `useForm`.
 *
 * @prop data - Current field values keyed by field name
 * @prop errors - Per-field error messages (empty string = cleared, absent = untouched)
 * @prop touched - Fields the user has interacted with
 * @prop isSubmitting - True while `onSubmit` promise is pending
 * @prop isValid - True when `errors` is empty
 * @prop isDirty - True when any touched field differs from `initialValues`
 * @prop handleChange - Update a field value (clears error, marks touched)
 * @prop handleBlur - Mark a field touched and run field-level validation
 * @prop handleSubmit - Validate all fields, then call `onSubmit` if valid
 * @prop resetForm - Restore all state to `initialValues`
 * @prop setFieldValue - Programmatic field update (same as handleChange)
 * @prop setFieldError - Inject a server-side error for a field
 * @prop clearErrors - Clear all errors (e.g. after navigation)
 */
interface UseFormReturn {
  data: Record<string, any>
  errors: Record<string, string>
  touched: Record<string, boolean>
  isSubmitting: boolean
  isValid: boolean
  isDirty: boolean
  handleChange: (field: string, value: any) => void
  handleBlur: (field: string) => void
  handleSubmit: (e?: React.FormEvent) => void
  resetForm: () => void
  setFieldValue: (field: string, value: any) => void
  setFieldError: (field: string, error: string) => void
  clearErrors: () => void
}

// ─── HOOK ────────────────────────────────────────────────────────────────────

/**
 * Schema-driven form state and validation hook.
 *
 * @param options.initialValues - Seed values for all fields
 * @param options.fields - `FieldDefinition[]` from schema or static config
 * @param options.onSubmit - Async submit handler; called only if validation passes
 * @param options.validate - Optional whole-form custom validator returning
 *   `Record<fieldName, errorMessage>`
 * @param options.onChange - Called on every field change with the full values map
 *
 * @returns `UseFormReturn` — see interface for full description
 *
 * @inputSpec fields[].data_type: 'email'|'url'|'number'|'text'|'textarea'
 *   drives built-in validation rules
 * @inputSpec fields[].validation.minLength/maxLength/pattern: text constraints
 * @sideEffects React state mutations only
 * @calledBy SchemaDetailForm.tsx, all admin detail pages
 *
 * @example
 * ```tsx
 * const form = useForm({
 *   initialValues: { name: '', email: '' },
 *   fields: [{ name: 'email', data_type: 'email', required: true, label: 'Email' }],
 *   onSubmit: async (values) => await save(values)
 * })
 * ```
 */
export function useForm({
  initialValues,
  fields,
  onSubmit,
  validate,
  onChange
}: UseFormOptions): UseFormReturn {
  const [data, setData] = useState<Record<string, any>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  // Validate a single field
  const validateField = useCallback((field: string, value: any): string | null => {
    const fieldDef = fields.find(f => f.name === field)
    if (!fieldDef) return null

    // Required validation
    if (fieldDef.required && (!value || value === '')) {
      return `${fieldDef.label || field} is required`
    }

    // Skip validation for empty optional fields
    if (!fieldDef.required && (!value || value === '')) {
      return null
    }

    // Type-specific validation
    switch (fieldDef.data_type) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(value)) {
          return 'Please enter a valid email address'
        }
        break

      case 'url':
        try {
          new URL(value)
        } catch {
          return 'Please enter a valid URL'
        }
        break

      case 'number':
        const num = Number(value)
        if (isNaN(num)) {
          return 'Please enter a valid number'
        }
        if (fieldDef.min !== undefined && num < fieldDef.min) {
          return `Value must be at least ${fieldDef.min}`
        }
        if (fieldDef.max !== undefined && num > fieldDef.max) {
          return `Value must be at most ${fieldDef.max}`
        }
        break

      case 'text':
      case 'textarea':
        if (fieldDef.validation?.minLength && value.length < fieldDef.validation.minLength) {
          return `Must be at least ${fieldDef.validation.minLength} characters`
        }
        if (fieldDef.validation?.maxLength && value.length > fieldDef.validation.maxLength) {
          return `Must be at most ${fieldDef.validation.maxLength} characters`
        }
        if (fieldDef.validation?.pattern && !new RegExp(fieldDef.validation.pattern).test(value)) {
          return 'Invalid format'
        }
        break
    }

    return null
  }, [fields])

  // Validate all fields
  const validateForm = useCallback((values: Record<string, any>): Record<string, string> => {
    const newErrors: Record<string, string> = {}

    // Run field-level validation
    fields.forEach(field => {
      if (!field.name) return
      const fieldErr = validateField(field.name, values[field.name])
      if (fieldErr) {
        newErrors[field.name] = fieldErr
      }
    })

    // Run custom validation
    if (validate) {
      const customErrors = validate(values)
      Object.assign(newErrors, customErrors)
    }

    return newErrors
  }, [fields, validate, validateField])

  // Handle field change
  const handleChange = useCallback((field: string, value: any) => {
    const newData = { ...data, [field]: value }
    setData(newData)
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }

    // Mark field as touched
    setTouched(prev => ({ ...prev, [field]: true }))

    // Call onChange callback
    onChange?.(newData)
  }, [data, errors, onChange])

  // Handle field blur
  const handleBlur = useCallback((field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    
    // Validate field on blur
    const error = validateField(field, data[field])
    setErrors(prev => ({
      ...prev,
      ...(error ? { [field]: error } : { [field]: '' })
    }))
  }, [data, validateField])

  // Handle form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    
    // Mark all fields as touched
    const allTouched = fields.reduce((acc, field) => {
      if (field.name) acc[field.name] = true
      return acc
    }, {} as Record<string, boolean>)
    setTouched(allTouched)

    // Validate form
    const newErrors = validateForm(data)
    setErrors(newErrors)

    const isValid = Object.keys(newErrors).length === 0
    if (!isValid) {
      return
    }

    setIsSubmitting(true)
    setSubmitCount(prev => prev + 1)

    try {
      await onSubmit?.(data)
    } catch (error) {
      console.error('Form submission error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [data, fields, validateForm, onSubmit])

  // Reset form
  const resetForm = useCallback(() => {
    setData(initialValues)
    setErrors({})
    setTouched({})
    setIsSubmitting(false)
    setSubmitCount(0)
  }, [initialValues])

  // Set field value
  const setFieldValue = useCallback((field: string, value: any) => {
    handleChange(field, value)
  }, [handleChange])

  // Set field error
  const setFieldError = useCallback((field: string, error: string) => {
    setErrors(prev => ({
      ...prev,
      [field]: error
    }))
  }, [])

  // Clear all errors
  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  // Calculate derived state
  const isValid = Object.keys(errors).length === 0
  const isDirty = Object.keys(touched).some(field => data[field] !== initialValues[field])

  return {
    data,
    errors,
    touched,
    isSubmitting,
    isValid,
    isDirty,
    handleChange,
    handleBlur,
    handleSubmit,
    resetForm,
    setFieldValue,
    setFieldError,
    clearErrors
  }
}
