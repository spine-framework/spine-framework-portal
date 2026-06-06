/// <reference types="node" />
/**
 * @module tests/unit/schema-utils
 * @audience core-contributor
 * @layer test-unit
 * @stability stable
 *
 * Unit tests for `schema-utils.ts → generateValidationSchema`.
 *
 * **Invariants guarded:**
 * - Empty `design_schema` produces `{ fields: {} }`.
 * - Each field's `data_type` and `required` are preserved.
 * - `validation.min`/`max` are promoted to the field level.
 * - `validation.reference_kind`/`reference_type` are promoted for
 *   `reference` fields.
 * - Display-only keys (`display_type`, `permissions`) are stripped from
 *   the validation schema.
 * - Multiple fields are all processed independently.
 *
 * No mocks needed — pure function, no IO.
 *
 * @seeAlso functions/_shared/schema-utils.ts
 */
import { describe, it, expect } from 'vitest'
import { generateValidationSchema } from '../../functions/_shared/schema-utils.ts'

describe('generateValidationSchema', () => {
  it('returns empty fields for schema with no fields', () => {
    const result = generateValidationSchema({})
    expect(result.fields).toEqual({})
  })

  it('extracts data_type and required from each field', () => {
    const result = generateValidationSchema({
      fields: {
        name: { data_type: 'short_text', required: true },
        priority: { data_type: 'select', required: false, options: ['low', 'medium', 'high'] }
      }
    })

    expect(result.fields.name).toMatchObject({ data_type: 'short_text', required: true })
    expect(result.fields.priority).toMatchObject({
      data_type: 'select',
      required: false,
      options: ['low', 'medium', 'high']
    })
  })

  it('includes validation constraints when declared', () => {
    const result = generateValidationSchema({
      fields: {
        age: {
          data_type: 'integer',
          required: true,
          validation: { min: 0, max: 150 }
        }
      }
    })

    expect(result.fields.age.min).toBe(0)
    expect(result.fields.age.max).toBe(150)
  })

  it('includes reference_kind and reference_type for reference fields', () => {
    const result = generateValidationSchema({
      fields: {
        assignee: {
          data_type: 'reference',
          required: false,
          validation: {
            reference_kind: 'people',
            reference_type: 'person'
          }
        }
      }
    })

    expect(result.fields.assignee.reference_kind).toBe('people')
    expect(result.fields.assignee.reference_type).toBe('person')
  })

  it('does not include display_type or permission fields in validation schema', () => {
    const result = generateValidationSchema({
      fields: {
        status: {
          data_type: 'select',
          required: true,
          display_type: 'badge',
          permissions: { read: 'all', write: 'admin' },
          options: ['open', 'closed']
        }
      }
    })

    expect(result.fields.status.display_type).toBeUndefined()
    expect(result.fields.status.permissions).toBeUndefined()
    expect(result.fields.status.options).toEqual(['open', 'closed'])
  })

  it('handles multiple fields correctly', () => {
    const designSchema = {
      fields: {
        title: { data_type: 'short_text', required: true },
        body: { data_type: 'long_text', required: false },
        score: { data_type: 'decimal', required: false, validation: { min: 0, max: 10 } }
      }
    }

    const result = generateValidationSchema(designSchema)
    expect(Object.keys(result.fields)).toHaveLength(3)
    expect(result.fields.title.data_type).toBe('short_text')
    expect(result.fields.body.data_type).toBe('long_text')
    expect(result.fields.score.min).toBe(0)
  })

  it('system: true fields are preserved in validation schema (system flag is structural)', () => {
    const result = generateValidationSchema({
      fields: {
        id: { data_type: 'text', required: true, system: true },
        created_at: { data_type: 'datetime', required: false, system: true, readonly: true }
      }
    })
    expect(result.fields.id).toBeDefined()
    expect(result.fields.created_at).toBeDefined()
  })

  it('null validation object does not cause errors', () => {
    const result = generateValidationSchema({
      fields: {
        name: { data_type: 'text', required: true, validation: null }
      }
    })
    expect(result.fields.name.data_type).toBe('text')
    expect(result.fields.name.required).toBe(true)
  })

  it('handles all key data_types without throwing', () => {
    const dataTypes = [
      'text', 'textarea', 'email', 'url', 'phone',
      'number', 'integer', 'decimal',
      'boolean', 'datetime', 'date',
      'select', 'multiselect', 'reference',
      'json', 'color', 'rich_text'
    ]
    for (const data_type of dataTypes) {
      expect(() => generateValidationSchema({
        fields: { field1: { data_type, required: false } }
      })).not.toThrow()
    }
  })

  it('returns empty fields object when fields key is missing entirely', () => {
    const result = generateValidationSchema({ views: {}, record_permissions: {} })
    expect(result.fields).toEqual({})
  })
})
