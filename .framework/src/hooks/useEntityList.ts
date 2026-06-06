/**
 * @module src/hooks/useEntityList
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Schema-driven list data hook. Given an entity name and a minimal
 * `MinimalEntityListConfig`, fetches a paginated, filtered, and sorted list
 * from the API and exposes controls for filters, sort, and pagination.
 *
 * **How it works:**
 * 1. Builds query params from `entity`, `config.api`, filters, sort, and pagination
 * 2. Calls `apiFetch('/api/<endpoint>?action=list&...')` via `useApi`
 * 3. Re-fetches when `config` arrives (async schema load), or when filters change
 *    (which also resets page to 1)
 *
 * **Auth retry:** `useApi` re-executes on route navigation, which naturally
 * retries after the auth session hydrates on the next tick.
 *
 * @seeAlso src/hooks/useApi.ts (useApi — underlying fetch + abort primitive)
 * @seeAlso src/lib/api.ts (apiFetch)
 * @seeAlso src/components/runtime/DataListPage.tsx (primary consumer)
 * @seeAlso functions/admin-data.ts (API endpoint for list action)
 */

import { useState, useEffect, useCallback } from 'react'
import { useApi } from './useApi'
import { apiFetch } from '../lib/api'

// ─── TYPES ───────────────────────────────────────────────────────────────────

/**
 * Minimal configuration shape consumed by `useEntityList`.
 *
 * @prop entity - Entity name (used as fallback endpoint, filter param)
 * @prop typeSlug - Optional type slug; appended as `type_slug` param if present
 * @prop api.endpoint - Netlify function base path (e.g. `'admin-data'`)
 * @prop api.listAction - Action string; defaults to `'list'`
 * @prop list.defaultSort - Initial sort field and direction
 */
interface MinimalEntityListConfig {
  entity: string
  typeSlug?: string
  api: {
    endpoint: string
    listAction?: string
  }
  list: {
    defaultSort: { field: string; direction: 'asc' | 'desc' }
  }
}

/**
 * Return value of `useEntityList`.
 *
 * @prop data - Fetched records array (empty while loading or on error)
 * @prop loading - True while fetching
 * @prop error - Error message or null
 * @prop refetch - Re-execute the current query
 * @prop filters - Active filter values keyed by param name
 * @prop setFilters - Replace the active filters (resets page to 1)
 * @prop sort - Current sort field and direction
 * @prop setSort - Update sort (does not auto-reset page)
 * @prop pagination - page/setPage/pageSize/setPageSize/total controls
 */
interface UseEntityListReturn {
  data: any[]
  loading: boolean
  error: string | null
  refetch: () => void
  filters: Record<string, any>
  setFilters: (filters: Record<string, any>) => void
  sort: { field: string; direction: 'asc' | 'desc' }
  setSort: (sort: { field: string; direction: 'asc' | 'desc' }) => void
  pagination: {
    page: number
    setPage: (page: number) => void
    pageSize: number
    setPageSize: (size: number) => void
    total: number
  }
}

// ─── HOOK ────────────────────────────────────────────────────────────────────

/**
 * Fetches and manages a filtered, sorted, paginated entity list.
 *
 * @param entity - Entity name (e.g. `'accounts'`, `'items'`)
 * @param config - Schema-derived config; pass `null` while schema is loading
 *   (hook is a no-op until config is non-null)
 * @returns `UseEntityListReturn` — see type for full details
 *
 * @inputSpec config.api.endpoint: string — function name, e.g. `'admin-data'`
 * @inputSpec filters: values of `''`, `undefined`, or `'all'` are omitted from params
 * @outputSpec data: any[] — raw API response; shape depends on entity type
 * @sideEffects Network request via apiFetch; React state mutations
 * @calledBy DataListPage.tsx
 *
 * @example
 * ```tsx
 * const { data, loading, setFilters } = useEntityList('accounts', config)
 * ```
 */
export function useEntityList(
  entity: string,
  config: MinimalEntityListConfig | null
): UseEntityListReturn {
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>(config?.list?.defaultSort || { field: 'created_at', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  
  const fetchData = useCallback(async () => {
    if (!config) return
    
    const params = new URLSearchParams()
    
    // Support new endpoint-based API pattern
    const endpoint = config.api.endpoint || entity
    const action = config.api.listAction || 'list'
    params.append('action', action)
    
    // Add entity parameter for unified admin-data endpoint
    if (config.api.endpoint) {
      params.append('entity', entity)
    }
    
    // Add type_slug for schema-driven filtering if available
    if (config.typeSlug) {
      params.append('type_slug', config.typeSlug)
    }
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== 'all') {
        params.append(key, value.toString())
      }
    })
    
    // Add sort
    params.append('sort_field', sort.field)
    params.append('sort_direction', sort.direction)
    
    // Add pagination
    params.append('limit', pageSize.toString())
    params.append('offset', ((page - 1) * pageSize).toString())
    
    const response = await apiFetch(`/api/${endpoint}?${params.toString()}`)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${entity}: ${response.statusText}`)
    }
    
    const result = await response.json()
    return result.data || []
  }, [entity, config?.api.endpoint, config?.api.listAction, config?.typeSlug, filters, sort, page, pageSize])
  
  const { data, loading, error, execute, refetch } = useApi<any[]>(fetchData, {
    immediate: true
  })

  // Re-fetch when config arrives (schema was not ready on initial mount)
  useEffect(() => {
    if (config) execute()
  }, [config?.api.endpoint, config?.api.listAction, config?.typeSlug])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [filters])
  
  return {
    data: data || [],
    loading,
    error,
    refetch,
    filters,
    setFilters,
    sort,
    setSort,
    pagination: {
      page,
      setPage,
      pageSize,
      setPageSize,
      total: data?.length || 0
    }
  }
}
