/**
 * @module src/hooks/useListSchema
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Resolves the `DesignSchema` and target `View` for a list page. Because
 * the `design_schema` is stamp-copied onto records, this hook uses a
 * two-stage resolution strategy to handle stale or missing stamps:
 *
 * **Resolution order:**
 * 1. Fetch one sample record via `admin-data?action=list&limit=1`
 * 2. If the sample record's `design_schema` has the requested view, use it
 * 3. Otherwise, fall back to the canonical `types` table entry for the entity kind
 * 4. If no records exist, return a minimal fallback schema so the page renders
 *
 * **Auth retry:** Auth errors (JWT not ready) trigger a 300 ms retry instead
 * of silently falling back to an empty schema (which would render a blank list).
 *
 * **Entity → kind mapping** (used for the types fallback):
 * `accounts→account`, `people→person`, `items→item`, `threads→thread`,
 * `messages→message`, `links→link`, `attachments→attachment`, `watchers→watcher`
 *
 * @seeAlso src/lib/api.ts (apiFetch)
 * @seeAlso src/types/types.ts (DesignSchema, View)
 * @seeAlso src/components/runtime/DataListPage.tsx (primary consumer)
 * @seeAlso functions/admin-data.ts (list action endpoint)
 */

import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { DesignSchema, View } from '../types/types'

// ─── TYPES ───────────────────────────────────────────────────────────────────

/**
 * Options for `useListSchema`.
 *
 * @prop entity - Entity table name (e.g. `'accounts'`, `'items'`)
 * @prop viewSlug - View key in `design_schema.views`; defaults to `'default_list'`
 */
interface UseListSchemaOptions {
  entity: string
  viewSlug?: string
}

/**
 * Return value of `useListSchema`.
 *
 * @prop schema - Resolved `DesignSchema` or null while loading
 * @prop view - The specific `View` for `viewSlug`, or null while loading
 * @prop loading - True during initial fetch and auth retry
 * @prop error - Error message if schema resolution fails
 * @prop refetch - Manually re-run schema resolution
 */
interface UseListSchemaResult {
  schema: DesignSchema | null
  view: View | null
  loading: boolean
  error: string | null
  refetch: () => void
}

// ─── HOOK ────────────────────────────────────────────────────────────────────

/**
 * Resolves the `DesignSchema` and target `View` for a list page, using a
 * two-stage fallback strategy (stamped record → canonical type → minimal fallback).
 *
 * @param options.entity - Entity name, e.g. `'accounts'`
 * @param options.viewSlug - View key; defaults to `'default_list'`
 * @returns `UseListSchemaResult` — schema, view, loading, error, refetch
 *
 * @inputSpec options.entity: string — must be non-empty or an error is set
 * @outputSpec schema: DesignSchema — minimal fallback if no records exist
 * @outputSpec view: View — matches `viewSlug` from the resolved schema
 * @throws never (all errors are caught and stored in `error` state)
 * @sideEffects Network requests (1–2 calls); React state mutations; 300ms setTimeout on auth retry
 * @calledBy DataListPage.tsx
 *
 * @example
 * ```tsx
 * const { schema, view, loading } = useListSchema({ entity: 'accounts' })
 * ```
 */
export function useListSchema(options: UseListSchemaOptions): UseListSchemaResult {
  const { entity, viewSlug = 'default_list' } = options
  
  const [schema, setSchema] = useState<DesignSchema | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSchema = async () => {
    let cancelled = false
    
    try {
      setLoading(true)
      setError(null)

      // Fetch a sample record to get its design_schema
      const response = await apiFetch(`/api/admin-data?action=list&entity=${entity}&limit=1`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sample record: ${response.statusText}`)
      }

      const data = await response.json()
      
      if (data.error) {
        // Auth errors (session not yet ready) should not silently fall back to
        // an empty schema — that causes the list to render with no columns.
        // Retry once after a short delay to allow the session to hydrate.
        if (
          data.error.includes('Invalid authentication') ||
          data.error.includes('Unauthorized') ||
          data.error.includes('JWT')
        ) {
          if (cancelled) return
          await new Promise(resolve => setTimeout(resolve, 300))
          if (!cancelled) fetchSchema()
          return
        }
        throw new Error(data.error || 'Failed to fetch records')
      }

      // No records yet — use a minimal fallback schema so the list page still renders
      if (!data.data || data.data.length === 0) {
        if (cancelled) return
        const fallback: DesignSchema = {
          fields: {},
          record_permissions: {},
          views: {
            [viewSlug]: {
              type: 'list',
              label: 'Default List',
              fields: {
                id: { sortable: false, display_type: 'text' },
                created_at: { sortable: true, display_type: 'timestamp' }
              },
              display: 'table',
              default_sort: { field: 'created_at', direction: 'desc' }
            }
          }
        }
        setSchema(fallback)
        setView(fallback.views![viewSlug]!)
        setLoading(false)
        return
      }

      const sampleRecord = data.data[0]
      
      // If the sample record has a design_schema with the requested view, use it directly
      const stampedSchema = sampleRecord.design_schema as DesignSchema | undefined
      const stampedView = stampedSchema?.views?.[viewSlug]

      if (stampedSchema && stampedView) {
        if (cancelled) return
        setSchema(stampedSchema)
        setView(stampedView)
      } else {
        // Schema missing or stale — fetch current design_schema from the types table
        const kindMap: Record<string, string> = { accounts: 'account', people: 'person', items: 'item', threads: 'thread', messages: 'message', links: 'link', attachments: 'attachment', watchers: 'watcher', item_progress: 'progress' }
        const kind = kindMap[entity]
        let resolvedSchema: DesignSchema | null = null

        if (kind) {
          const typeResp = await apiFetch(`/api/types?kind=${kind}&limit=1`)
          if (typeResp.ok) {
            const typeData = await typeResp.json()
            const typeRecord = typeData.data?.[0]
            if (typeRecord?.design_schema) {
              resolvedSchema = typeRecord.design_schema as DesignSchema
            }
          }
        }

        if (resolvedSchema) {
          const resolvedView = resolvedSchema.views?.[viewSlug]
          if (resolvedView) {
            if (cancelled) return
            setSchema(resolvedSchema)
            setView(resolvedView)
          } else {
            // Schema found but view key missing — use minimal fallback
            const fallback: DesignSchema = {
              fields: {},
              record_permissions: {},
              views: {
                [viewSlug]: {
                  type: 'list',
                  label: entity.charAt(0).toUpperCase() + entity.slice(1),
                  fields: {
                    id: { sortable: false, display_type: 'text' },
                    created_at: { sortable: true, display_type: 'timestamp' }
                  },
                  display: 'table',
                  default_sort: { field: 'created_at', direction: 'desc' }
                }
              }
            }
            if (cancelled) return
            setSchema(fallback)
            setView(fallback.views![viewSlug]!)
          }
        } else {
          // No type found in registry — use minimal fallback
          const fallback: DesignSchema = {
            fields: {},
            record_permissions: {},
            views: {
              [viewSlug]: {
                type: 'list',
                label: entity.charAt(0).toUpperCase() + entity.slice(1),
                fields: {
                  id: { sortable: false, display_type: 'text' },
                  created_at: { sortable: true, display_type: 'timestamp' }
                },
                display: 'table',
                default_sort: { field: 'created_at', direction: 'desc' }
              }
            }
          }
          if (cancelled) return
          setSchema(fallback)
          setView(fallback.views![viewSlug]!)
        }
      }

    } catch (err) {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load schema')
        setSchema(null)
        setView(null)
      }
    } finally {
      if (!cancelled) {
        setLoading(false)
      }
    }

    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    if (entity) {
      fetchSchema()
    } else {
      setError('Entity is required')
      setLoading(false)
    }
  }, [entity, viewSlug])

  return {
    schema,
    view,
    loading,
    error,
    refetch: fetchSchema
  }
}
