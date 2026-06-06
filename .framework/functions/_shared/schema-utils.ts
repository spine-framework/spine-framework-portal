/**
 * @module schema-utils
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Schema generation and field-level data transformation for all Spine types.
 *
 * Three public functions form the core contract:
 *   - `generateValidationSchema` — derives a runtime validation schema from a
 *     `design_schema`, stripping display/permission info and keeping only
 *     structural constraints.
 *   - `sanitizeFieldData` — coerces and validates a single field value for
 *     write (create/update) operations. Throws on invalid data.
 *   - `formatFieldData` — converts a stored field value to a human-readable
 *     display string for read operations. Never throws.
 *   - `transformRecordData` — applies sanitize or format to all fields in a
 *     record using a pre-generated ValidationSchema.
 *
 * These are called by `permissions.ts` (`validateFirstSurfaceUpdatePermissions`
 * and `sanitizeFirstSurfaceRecordData`) — do not call them directly from API
 * handlers. Use `PermissionEngine.sanitizeRecordData` / `validateUpdatePermissions`.
 *
 * INVARIANT: all sanitize functions throw on invalid data. Callers must catch
 *   errors and convert them to field-level validation error messages.
 * INVARIANT: all format functions return the raw data unchanged if formatting
 *   is not applicable (never throw, never return null for non-null input).
 *
 * @seeAlso permissions.ts (primary caller of sanitizeFieldData, formatFieldData)
 * @seeAlso src/types/types.ts (FieldDefinition interface)
 * @seeAlso index.ts (not re-exported — internal to core; use PermissionEngine)
 */

import { FieldDefinition } from '../../src/types/types'

// ─── TYPES ───────────────────────────────────────────────────────────────

/**
 * Structural-only validation schema derived from a `design_schema`.
 *
 * Contains one entry per field with the field's `data_type` and any explicit
 * `validation` constraints. Display properties (`display_type`, views, sections)
 * and permission properties are stripped. Used as input to `sanitizeFieldData`
 * and `formatFieldData`.
 *
 * @inputSpec none — output type of generateValidationSchema
 * @outputSpec fields: Record<fieldName, { data_type, required?, ...constraints }>
 * @calledBy generateValidationSchema (producer), transformRecordData,
 *   permissions.ts validateFirstSurfaceUpdatePermissions (consumer)
 */
export interface ValidationSchema {
  fields: Record<string, {
    data_type: string
    required?: boolean
    [key: string]: any // Type-specific validation properties
  }>
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Derives a `ValidationSchema` from a `design_schema` by extracting only
 * structural constraints (data_type, required, validation.*) and discarding
 * display, permission, and view configuration.
 *
 * The resulting schema is used to drive `sanitizeFieldData` and
 * `formatFieldData` for every field in a record. It is generated once per
 * type and passed to `transformRecordData` for bulk field processing.
 *
 * @param designSchema - The full design_schema object from a type record
 * @returns ValidationSchema with one entry per field
 * @throws never — returns empty schema if designSchema.fields is missing
 * @inputSpec designSchema.fields: Record<fieldName, FieldDefinition> — must match
 *   the FieldDefinition interface from src/types/types.ts
 * @inputSpec designSchema.fields[x].data_type: string — required in every field
 * @outputSpec ValidationSchema.fields: Record<string, { data_type, required, ...constraints }>
 * @sideEffects none
 * @calledBy permissions.ts (validateFirstSurfaceUpdatePermissions), any caller
 *   needing a validation schema without the full design_schema overhead
 * @testUnit tests/unit/schema-utils.test.ts — 'generateValidationSchema' describe block
 *
 * @example
 * ```ts
 * const schema = generateValidationSchema(record.design_schema)
 * const cleaned = transformRecordData(record.data, schema, 'sanitize')
 * ```
 */
export function generateValidationSchema(designSchema: any): ValidationSchema {
  const validationSchema: ValidationSchema = {
    fields: {}
  }

  if (!designSchema.fields) {
    return validationSchema
  }

  for (const [fieldName, fieldDef] of Object.entries(designSchema.fields)) {
    const field = fieldDef as FieldDefinition
    
    // Extract only structural validation properties exactly as declared
    const validationField: any = {
      data_type: field.data_type,
      required: field.required
    }

    // Add explicit validation constraints exactly as declared
    if (field.validation) {
      Object.assign(validationField, field.validation)
    }

    // Add type-specific constraint properties (moved out of validation for clarity)
    if (field.options) {
      validationField.options = field.options
    }

    // Add reference properties if they exist
    if (field.data_type === 'reference' && field.validation) {
      if (field.validation.reference_kind) validationField.reference_kind = field.validation.reference_kind
      if (field.validation.reference_type) validationField.reference_type = field.validation.reference_type
    }

    validationSchema.fields[fieldName] = validationField
  }

  return validationSchema
}

/**
 * Coerces and validates a single field value for a write (create/update) operation.
 *
 * Dispatches to a type-specific sanitizer based on `data_type`. Every sanitizer:
 *   - Coerces the input to the correct type
 *   - Applies constraint validation (min/max/length/pattern/options)
 *   - Throws a descriptive `Error` on the first validation failure
 *   - Returns the cleaned value on success
 *
 * Unknown `data_type` values pass through unchanged (no throw).
 *
 * @param data - Raw field value from the request body
 * @param data_type - The field's declared data_type from design_schema.fields[x]
 * @param validation - Optional validation constraints from the field definition
 * @returns Sanitized value in the correct type for storage
 * @throws Error — descriptive message naming the field constraint violated
 * @inputSpec data: any — null and undefined are returned as-is without sanitization
 * @inputSpec data_type: string — one of the 21 supported type keys (see switch below)
 * @inputSpec validation: object | undefined — type-specific constraints
 * @outputSpec any — coerced value matching the data_type storage format
 * @sideEffects none
 * @calledBy permissions.ts (validateFirstSurfaceUpdatePermissions, per-field loop)
 * @calls sanitizeText | sanitizeTextarea | sanitizeEmail | sanitizeNumber | etc.
 * @testUnit tests/unit/schema-utils.test.ts — 'sanitizeFieldData' describe block
 *
 * @example
 * ```ts
 * const clean = sanitizeFieldData('hello@EXAMPLE.COM', 'email')
 * // → 'hello@example.com'
 *
 * sanitizeFieldData('not-a-url', 'url')
 * // throws Error('Invalid URL format')
 * ```
 */
export function sanitizeFieldData(
  data: any, 
  data_type: string, 
  validation?: any
): any {
  if (data === null || data === undefined) {
    return data
  }

  switch (data_type) {
    case 'text':
      return sanitizeText(data, validation)
    case 'textarea':
      return sanitizeTextarea(data, validation)
    case 'rich_text':
      return sanitizeRichText(data, validation)
    case 'email':
      return sanitizeEmail(data, validation)
    case 'phone':
      return sanitizePhone(data, validation)
    case 'url':
      return sanitizeUrl(data, validation)
    case 'number':
      return sanitizeNumber(data, validation)
    case 'currency':
      return sanitizeCurrency(data, validation)
    case 'range':
      return sanitizeRange(data, validation)
    case 'date':
      return sanitizeDate(data, validation)
    case 'datetime':
      return sanitizeDatetime(data, validation)
    case 'boolean':
      return sanitizeBoolean(data, validation)
    case 'checkbox':
      return sanitizeCheckbox(data, validation)
    case 'select':
      return sanitizeSelect(data, validation)
    case 'multiselect':
      return sanitizeMultiselect(data, validation)
    case 'radio':
      return sanitizeRadio(data, validation)
    case 'color':
      return sanitizeColor(data, validation)
    case 'file':
      return sanitizeFile(data, validation)
    case 'image':
      return sanitizeImage(data, validation)
    case 'json':
      return sanitizeJson(data, validation)
    case 'reference':
      return sanitizeReference(data, validation)
    case 'address':
      return sanitizeAddress(data, validation)
    default:
      return data
  }
}

/**
 * Converts a stored field value to a human-readable display string.
 *
 * Dispatches to a type-specific formatter based on `data_type`. Formatters
 * never throw — if the data cannot be formatted, the raw value is returned.
 * Only types with meaningful display transformations have a case; all others
 * fall through to the default (return data unchanged).
 *
 * @param data - Stored field value (from DB, post-sanitization)
 * @param data_type - The field's declared data_type
 * @param context - Optional context for type-specific formatting (e.g.
 *   `context.currency_code` for currency fields, `context.field` for boolean
 *   contextual labels like 'Active'/'Inactive')
 * @returns Formatted display value
 * @throws never
 * @inputSpec data: any — null and undefined are returned as-is
 * @inputSpec data_type: string — one of 21 supported keys; unknown → pass-through
 * @inputSpec context: object | undefined — type-specific display hints
 * @outputSpec any — display-ready value; string for most types, raw data for pass-through
 * @sideEffects none
 * @calledBy permissions.ts (sanitizeFirstSurfaceRecordData, per-field loop)
 * @calls formatJson | formatDate | formatDatetime | formatCurrency | etc.
 * @testUnit tests/unit/schema-utils.test.ts — 'formatFieldData' describe block
 *
 * @example
 * ```ts
 * formatFieldData('2024-01-15', 'date')
 * // → 'January 15, 2024'
 *
 * formatFieldData(1234.5, 'currency', { currency_code: 'USD' })
 * // → '$1,234.50'
 * ```
 */
export function formatFieldData(
  data: any, 
  data_type: string, 
  context?: any
): any {
  if (data === null || data === undefined) {
    return data
  }

  switch (data_type) {
    case 'json':
      return formatJson(data)
    case 'date':
      return formatDate(data)
    case 'datetime':
      return formatDatetime(data)
    case 'currency':
      return formatCurrency(data, context)
    case 'phone':
      return formatPhone(data)
    case 'url':
      return formatUrl(data)
    case 'reference':
      return formatReference(data, context)
    case 'address':
      return formatAddress(data)
    case 'multiselect':
      return formatMultiselect(data)
    case 'boolean':
      return formatBoolean(data, context)
    default:
      return data
  }
}

/**
 * Applies `sanitizeFieldData` or `formatFieldData` to all fields in a record,
 * using the ValidationSchema for per-field type and constraint information.
 *
 * Fields not present in the schema are passed through unchanged. This is
 * intentional — unknown fields are not rejected here; the PermissionEngine
 * handles field-level access control separately.
 *
 * @param data - Key/value record of field names to raw or stored values
 * @param validationSchema - Schema from `generateValidationSchema`
 * @param operation - 'sanitize' for write path; 'format' for display path
 * @param context - Optional context passed through to formatFieldData
 * @returns Transformed record with the same keys
 * @throws Error (sanitize mode only) — if any field fails validation
 * @inputSpec data: Record<string, any> — flat field map
 * @inputSpec validationSchema: ValidationSchema — from generateValidationSchema
 * @inputSpec operation: 'sanitize' | 'format'
 * @outputSpec Record<string, any> — same keys, transformed values
 * @sideEffects none
 * @calledBy Custom code in v2-custom/ that needs bulk field transformation
 * @calls sanitizeFieldData | formatFieldData (per field)
 * @testUnit tests/unit/schema-utils.test.ts — 'transformRecordData' describe block
 *
 * @example
 * ```ts
 * const schema = generateValidationSchema(type.design_schema)
 * const sanitized = transformRecordData(body.data, schema, 'sanitize')
 * const formatted = transformRecordData(record.data, schema, 'format', ctx)
 * ```
 */
export function transformRecordData(
  data: Record<string, any>,
  validationSchema: ValidationSchema,
  operation: 'sanitize' | 'format',
  context?: any
): Record<string, any> {
  const transformed: Record<string, any> = {}

  for (const [fieldName, fieldValue] of Object.entries(data)) {
    const fieldValidation = validationSchema.fields[fieldName]
    
    if (!fieldValidation) {
      // No validation schema for this field, pass through as-is
      transformed[fieldName] = fieldValue
      continue
    }

    if (operation === 'sanitize') {
      transformed[fieldName] = sanitizeFieldData(
        fieldValue, 
        fieldValidation.data_type, 
        fieldValidation
      )
    } else if (operation === 'format') {
      transformed[fieldName] = formatFieldData(
        fieldValue, 
        fieldValidation.data_type, 
        context
      )
    }
  }

  return transformed
}

// ─── SANITIZE HELPERS ────────────────────────────────────────────────────────────

/**
 * Trims, strips control characters, HTML-escapes, and applies minLength/
 * maxLength/pattern constraints. Throws on minLength/pattern violation;
 * silently truncates on maxLength.
 * @throws Error on minLength or pattern violation
 */
function sanitizeText(data: any, validation?: any): string {
  let text = String(data).trim()
  
  // Remove control characters except newlines and tabs
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  
  // Escape HTML entities
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
  
  // Apply length constraints
  if (validation?.minLength && text.length < validation.minLength) {
    throw new Error(`Text must be at least ${validation.minLength} characters`)
  }
  if (validation?.maxLength && text.length > validation.maxLength) {
    text = text.substring(0, validation.maxLength)
  }
  
  // Apply pattern validation
  if (validation?.pattern) {
    const regex = new RegExp(validation.pattern)
    if (!regex.test(text)) {
      throw new Error(`Text does not match required pattern`)
    }
  }
  
  return text
}

/**
 * Same as sanitizeText but preserves newlines. Strips control chars,
 * HTML-escapes, applies minLength/maxLength.
 * @throws Error on minLength violation
 */
function sanitizeTextarea(data: any, validation?: any): string {
  let text = String(data).trim()
  
  // Remove control characters except newlines and tabs
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  
  // Escape HTML entities but preserve line breaks
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
  
  // Apply length constraints
  if (validation?.minLength && text.length < validation.minLength) {
    throw new Error(`Text must be at least ${validation.minLength} characters`)
  }
  if (validation?.maxLength && text.length > validation.maxLength) {
    text = text.substring(0, validation.maxLength)
  }
  
  return text
}

/**
 * Allowlist-based HTML sanitizer for rich text. Strips all tags not in the
 * allowed set (`p br strong em u ol ul li a h1-h6`), removes script tags and
 * `on*` event attributes, applies minLength/maxLength.
 * @throws Error on minLength violation
 */
function sanitizeRichText(data: any, validation?: any): string {
  let html = String(data).trim()
  
  // Basic HTML sanitization - allow only safe tags
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g
  
  html = html.replace(tagRegex, (match, tagName) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      return match
    }
    return ''
  })
  
  // Remove script tags and on* attributes
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  html = html.replace(/on\w+\s*=/gi, '')
  
  // Apply length constraints
  if (validation?.minLength && html.length < validation.minLength) {
    throw new Error(`Content must be at least ${validation.minLength} characters`)
  }
  if (validation?.maxLength && html.length > validation.maxLength) {
    html = html.substring(0, validation.maxLength)
  }
  
  return html
}

/**
 * Lowercases, trims, and validates basic `name@domain.tld` format.
 * @throws Error('Invalid email format') on invalid input
 */
function sanitizeEmail(data: any, validation?: any): string {
  let email = String(data).toLowerCase().trim()
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format')
  }
  
  return email
}

/**
 * Strips all non-digit/non-`+` characters. Applies optional pattern validation.
 * @throws Error on pattern mismatch
 */
function sanitizePhone(data: any, validation?: any): string {
  let phone = String(data).trim()
  
  // Remove all non-digit characters except +
  phone = phone.replace(/[^\d+]/g, '')
  
  // Apply pattern validation if specified
  if (validation?.pattern) {
    const regex = new RegExp(validation.pattern)
    if (!regex.test(phone)) {
      throw new Error('Phone number does not match required format')
    }
  }
  
  return phone
}

/**
 * Parses via `new URL()` and validates `http:` or `https:` protocol.
 * @throws Error on invalid URL or disallowed protocol
 */
function sanitizeUrl(data: any, validation?: any): string {
  let url = String(data).trim()
  
  // Basic URL validation
  try {
    const urlObj = new URL(url)
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed')
    }
    return urlObj.toString()
  } catch {
    throw new Error('Invalid URL format')
  }
}

/**
 * Coerces to Number, applies min/max constraints, rounds down to nearest
 * step if `validation.step` is set.
 * @throws Error on NaN or out-of-range
 */
function sanitizeNumber(data: any, validation?: any): number {
  let num = Number(data)
  
  if (isNaN(num)) {
    throw new Error('Invalid number')
  }
  
  // Apply min/max constraints
  if (validation?.min !== undefined && num < validation.min) {
    throw new Error(`Number must be at least ${validation.min}`)
  }
  if (validation?.max !== undefined && num > validation.max) {
    throw new Error(`Number must be at most ${validation.max}`)
  }
  
  // Apply step constraint
  if (validation?.step) {
    const remainder = num % validation.step
    if (remainder !== 0) {
      num = num - remainder // Round down to nearest step
    }
  }
  
  return num
}

/**
 * Coerces to Number, rounds to 2 decimal places, applies min/max.
 * @throws Error on NaN or out-of-range
 */
function sanitizeCurrency(data: any, validation?: any): number {
  let num = Number(data)
  
  if (isNaN(num)) {
    throw new Error('Invalid currency amount')
  }
  
  // Round to 2 decimal places for currency
  num = Math.round(num * 100) / 100
  
  // Apply min/max constraints
  if (validation?.min !== undefined && num < validation.min) {
    throw new Error(`Amount must be at least ${validation.min}`)
  }
  if (validation?.max !== undefined && num > validation.max) {
    throw new Error(`Amount must be at most ${validation.max}`)
  }
  
  return num
}

/** Delegates to `sanitizeNumber`. @throws same as sanitizeNumber */
function sanitizeRange(data: any, validation?: any): number {
  return sanitizeNumber(data, validation)
}

/**
 * Parses via `new Date()`, returns ISO date string (`YYYY-MM-DD`). Applies
 * min/max date constraints.
 * @throws Error on invalid date or out-of-range
 */
function sanitizeDate(data: any, validation?: any): string {
  let dateStr = String(data).trim()
  
  // Try to parse as ISO date
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format')
  }
  
  // Return as ISO date string
  const isoDate = date.toISOString().split('T')[0]
  
  // Apply min/max constraints
  if (validation?.min) {
    const minDate = new Date(validation.min)
    if (date < minDate) {
      throw new Error(`Date must be on or after ${validation.min}`)
    }
  }
  if (validation?.max) {
    const maxDate = new Date(validation.max)
    if (date > maxDate) {
      throw new Error(`Date must be on or before ${validation.max}`)
    }
  }
  
  return isoDate
}

/**
 * Parses via `new Date()`, returns full ISO datetime string. Applies
 * min/max datetime constraints.
 * @throws Error on invalid datetime or out-of-range
 */
function sanitizeDatetime(data: any, validation?: any): string {
  let dateStr = String(data).trim()
  
  // Try to parse as ISO datetime
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    throw new Error('Invalid datetime format')
  }
  
  // Return as ISO datetime string
  const isoDatetime = date.toISOString()
  
  // Apply min/max constraints
  if (validation?.min) {
    const minDate = new Date(validation.min)
    if (date < minDate) {
      throw new Error(`Datetime must be on or after ${validation.min}`)
    }
  }
  if (validation?.max) {
    const maxDate = new Date(validation.max)
    if (date > maxDate) {
      throw new Error(`Datetime must be on or before ${validation.max}`)
    }
  }
  
  return isoDatetime
}

/**
 * Accepts `true/false` booleans or truthy/falsy strings
 * (`'true','1','yes','on'` / `'false','0','no','off'`).
 * @throws Error on unrecognised value
 */
function sanitizeBoolean(data: any, validation?: any): boolean {
  if (typeof data === 'boolean') {
    return data
  }
  
  const str = String(data).toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(str)) {
    return true
  } else if (['false', '0', 'no', 'off'].includes(str)) {
    return false
  }
  
  throw new Error('Invalid boolean value')
}

/** Delegates to `sanitizeBoolean`. */
function sanitizeCheckbox(data: any, validation?: any): boolean {
  return sanitizeBoolean(data, validation)
}

/**
 * Validates the value against `validation.options` (string[]). 
 * @throws Error('Invalid option selected') if value not in allowed list
 */
function sanitizeSelect(data: any, validation?: any): string {
  let value = String(data).trim()
  
  // Validate against allowed options
  if (validation?.options) {
    // Options are now just an array of strings
    const allowedValues = Array.isArray(validation.options) ? validation.options : []
    if (!allowedValues.includes(value)) {
      throw new Error('Invalid option selected')
    }
  }
  
  return value
}

/**
 * Accepts array or comma-separated string. Deduplicates. Validates each
 * value against `validation.options`. Truncates to `validation.max`.
 * @throws Error on invalid option or non-array/string input
 */
function sanitizeMultiselect(data: any, validation?: any): string[] {
  let values: string[]
  
  if (Array.isArray(data)) {
    values = data.map(item => String(item).trim())
  } else if (typeof data === 'string') {
    values = data.split(',').map(item => item.trim())
  } else {
    throw new Error('Multiselect must be an array or comma-separated string')
  }
  
  // Remove duplicates
  values = [...new Set(values)]
  
  // Validate against allowed options
  if (validation?.options) {
    // Options are now just an array of strings
    const allowedValues = Array.isArray(validation.options) ? validation.options : []
    for (const value of values) {
      if (!allowedValues.includes(value)) {
        throw new Error(`Invalid option: ${value}`)
      }
    }
  }
  
  // Apply max selection count
  if (validation?.max && values.length > validation.max) {
    values = values.slice(0, validation.max)
  }
  
  return values
}

/** Delegates to `sanitizeSelect`. */
function sanitizeRadio(data: any, validation?: any): string {
  return sanitizeSelect(data, validation)
}

/**
 * Validates `#RGB` or `#RRGGBB` hex format. Normalizes 3-digit to 6-digit.
 * Returns uppercase. @throws Error on invalid hex format
 */
function sanitizeColor(data: any, validation?: any): string {
  let color = String(data).trim()
  
  // Validate hex color format
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  if (!hexRegex.test(color)) {
    throw new Error('Invalid color format. Use #RRGGBB or #RGB format')
  }
  
  // Normalize to 6-digit hex
  if (color.length === 4) {
    color = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
  }
  
  return color.toUpperCase()
}

/**
 * Validates `data.name` presence, optional maxSize and allowedTypes.
 * Sanitizes filename to `[a-zA-Z0-9.-_]` characters only.
 * @throws Error on invalid file data, size, or type
 */
function sanitizeFile(data: any, validation?: any): any {
  // Basic file validation - would need more sophisticated handling in practice
  if (typeof data !== 'object' || !data.name) {
    throw new Error('Invalid file data')
  }
  
  // Validate file size
  if (validation?.maxSize && data.size > validation.maxSize) {
    throw new Error(`File size exceeds maximum of ${validation.maxSize} bytes`)
  }
  
  // Validate file type
  if (validation?.allowedTypes && !validation.allowedTypes.includes(data.type)) {
    throw new Error(`File type ${data.type} is not allowed`)
  }
  
  // Sanitize filename
  data.name = data.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  
  return data
}

/**
 * Delegates to `sanitizeFile`. Image dimension validation is a stub
 * (noted for future implementation).
 * @throws same as sanitizeFile
 */
function sanitizeImage(data: any, validation?: any): any {
  const file = sanitizeFile(data, validation)
  
  // Additional image-specific validation
  if (validation?.maxWidth || validation?.maxHeight) {
    // Would need to actually load and check image dimensions
    // For now, just pass through
  }
  
  return file
}

/**
 * Parses JSON strings. Rejects payloads containing `'function'`, `'eval'`,
 * or `'script'` strings as a basic code-injection guard.
 * @throws Error on invalid JSON or dangerous content
 */
function sanitizeJson(data: any, validation?: any): any {
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      throw new Error('Invalid JSON format')
    }
  }
  
  // Basic security check - prevent code injection
  const jsonStr = JSON.stringify(data)
  if (jsonStr.includes('function') || jsonStr.includes('eval') || jsonStr.includes('script')) {
    throw new Error('JSON contains potentially dangerous content')
  }
  
  return data
}

/**
 * Validates UUID v1–v5 format. DB-level FK constraints enforce existence.
 * @throws Error('Invalid reference format') on non-UUID input
 */
function sanitizeReference(data: any, validation?: any): string {
  let ref = String(data).trim()
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(ref)) {
    throw new Error('Invalid reference format')
  }
  
  // Would need to check existence in referenced table
  // For now, just validate format
  
  return ref
}

/**
 * Sanitizes each string field of an address object via `sanitizeText`.
 * Passes non-string fields through unchanged.
 * @throws Error if input is not an object
 */
function sanitizeAddress(data: any, validation?: any): any {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Address must be an object')
  }
  
  // Sanitize each address component
  const sanitized: any = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeText(value)
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

// ─── FORMAT HELPERS ────────────────────────────────────────────────────────────

/** Formats an object as a 2-space indented JSON string. */
function formatJson(data: any): string {
  return JSON.stringify(data, null, 2)
}

/** Formats an ISO date string as locale date ('January 15, 2024'). Returns raw data on invalid input. */
function formatDate(data: string): string {
  const date = new Date(data)
  if (isNaN(date.getTime())) {
    return data
  }
  
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/** Formats an ISO datetime string as locale date+time ('January 15, 2024, 02:30 PM'). Returns raw on invalid. */
function formatDatetime(data: string): string {
  const date = new Date(data)
  if (isNaN(date.getTime())) {
    return data
  }
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Formats a number as currency using Intl.NumberFormat. Defaults to USD. context.currency_code overrides. */
function formatCurrency(data: number, context?: any): string {
  const currency = context?.currency_code || 'USD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(data)
}

/** Formats 10-digit US numbers as '(NXX) NXX-XXXX'. 11-digit with leading 1 as '+1 (NXX) NXX-XXXX'. Returns raw otherwise. */
function formatPhone(data: string): string {
  // Basic US phone formatting
  const phone = data.replace(/\D/g, '')
  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
  } else if (phone.length === 11 && phone[0] === '1') {
    return `+${phone[0]} (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`
  }
  
  return data
}

/** Pass-through — URLs are already display-ready. */
function formatUrl(data: string): string {
  return data
}

/** Pass-through — UUID returned as-is; display resolution requires a DB lookup (not done here). */
function formatReference(data: string, context?: any): string {
  // Would need to look up the referenced entity
  // For now, return the UUID
  return data
}

/** Joins address components (street, city, state, postal_code, country) into a comma-separated string. */
function formatAddress(data: any): string {
  if (typeof data !== 'object' || data === null) {
    return String(data)
  }
  
  const parts = [
    data.street,
    data.city,
    data.state,
    data.postal_code,
    data.country
  ].filter(Boolean)
  
  return parts.join(', ')
}

/** Joins a string array with ', '. Returns String(data) for non-arrays. */
function formatMultiselect(data: string[]): string {
  if (!Array.isArray(data)) {
    return String(data)
  }
  
  return data.join(', ')
}

/** Returns 'Active'/'Inactive' when context.field is 'is_active'; otherwise 'Yes'/'No'. */
function formatBoolean(data: boolean, context?: any): string {
  if (context?.field === 'is_active') {
    return data ? 'Active' : 'Inactive'
  }
  
  return data ? 'Yes' : 'No'
}
