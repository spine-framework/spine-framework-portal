/**
 * @module src/hooks/useApi
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * Low-level React hooks for async API calls with loading/error state,
 * AbortController-based cancellation, and optional pagination/mutation
 * variants. These are the primitives all higher-level data hooks
 * (`useEntityList`, `useEntityRecord`) build on top of.
 *
 * **Exports:**
 * | Hook              | Purpose                                             |
 * |-------------------|-----------------------------------------------------|
 * | `useApi`          | Single async call with abort + route-change re-fetch|
 * | `usePaginatedApi` | Paginated async call with page/size controls        |
 * | `useMutation`     | Write operation (create/update/delete) with state   |
 *
 * **Abort contract:** `useApi` creates a new `AbortController` per
 * invocation. On route navigation (`location.pathname` change) or on
 * unmount, the in-flight request is aborted and state is reset. This
 * prevents stale responses from a previous route populating the next
 * route's data.
 *
 * @seeAlso src/lib/api.ts (apiFetch — passes AbortSignal through)
 * @seeAlso src/hooks/useEntityList.ts (uses useApi)
 * @seeAlso src/hooks/useEntityRecord.ts (uses useApi + useMutation)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  lastFetched: Date | null
}

/**
 * Options for `useApi`.
 *
 * @prop immediate - If true, executes the function on mount and on route change
 * @prop onSuccess - Callback fired on successful response
 * @prop onError - Callback fired on error (with message string)
 * @prop initialData - Seed value for `data` before first fetch
 */
interface UseApiOptions<T> {
  immediate?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
  initialData?: T
  deps?: any[]
}

/**
 * Return value of `useApi`.
 *
 * @prop data - Response data or null
 * @prop loading - True while the request is in flight
 * @prop error - Error message string or null
 * @prop execute - Imperatively trigger the API call (with optional params)
 * @prop reset - Cancel in-flight request and restore to initial state
 * @prop refetch - Alias for `execute()` with no params
 */
interface UseApiReturn<T> {
  data: T | null
  loading: boolean
  error: string | null
  execute: (params?: any) => Promise<T>
  reset: () => void
  refetch: () => Promise<T>
}

// ─── useApi ──────────────────────────────────────────────────────────────────

/**
 * Generic async API hook with loading/error state and automatic
 * request cancellation.
 *
 * Each call to `execute` cancels any previous in-flight request via
 * `AbortController`. When `immediate: true`, the hook re-executes
 * (and aborts the prior request) whenever `location.pathname` changes.
 *
 * @param apiFunction - Async function to call; receives `{ ...params, signal }`
 * @param options - `UseApiOptions<T>` — see type for details
 * @returns `UseApiReturn<T>` — data, loading, error, execute, reset, refetch
 *
 * @inputSpec apiFunction must forward `signal` to any underlying `apiFetch`
 *   call, otherwise cancellation is a no-op.
 * @sideEffects React state mutations; aborts in-flight fetch on cleanup
 * @calledBy useEntityList.ts, useEntityRecord.ts
 *
 * @example
 * ```tsx
 * const { data, loading, execute } = useApi(
 *   async () => apiFetch('/api/items?action=list').then(r => r.json()),
 *   { immediate: true }
 * )
 * ```
 */
export function useApi<T>(
  apiFunction: (params?: any) => Promise<T>,
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const { immediate = false, onSuccess, onError, initialData = null } = options
  const location = useLocation()
  
  const apiFunctionRef = useRef(apiFunction)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const immediateRef = useRef(immediate)
  const initialDataRef = useRef(initialData)
  
  apiFunctionRef.current = apiFunction
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError
  immediateRef.current = immediate
  initialDataRef.current = initialData

  const [state, setState] = useState<ApiState<T>>({
    data: initialData,
    loading: false,
    error: null,
    lastFetched: null
  })

  // Stable AbortController ref — replaced on each new fetch cycle
  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(async (params?: any) => {
    // Create a new AbortController for this specific request
    const abortController = new AbortController()
    const { signal } = abortController
    
    // Cancel previous request if still running
    abortControllerRef.current?.abort()
    abortControllerRef.current = abortController

    console.log('useApi execute: starting request', { signalAborted: signal.aborted })
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const startTime = Date.now()
      const result = await apiFunctionRef.current({ ...params, signal })
      const duration = Date.now() - startTime

      // Structured API call log for agentic IDE consumption
      console.log(JSON.stringify({
        type: 'spine_api_call',
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        status: 'success',
        signal_aborted: signal.aborted
      }))
      if (signal.aborted) {
        console.log('useApi execute: request was aborted, returning result')
        return result
      }
      setState({
        data: result,
        loading: false,
        error: null,
        lastFetched: new Date()
      })
      onSuccessRef.current?.(result)
      return result
    } catch (error: any) {
      console.log('useApi execute: request failed', { error, signalAborted: signal.aborted, errorName: error?.name })
      if ((error as any)?.name === 'AbortError') {
        console.log('useApi execute: abort error, throwing')
        throw error
      }
      const errorMessage = error?.message || 'An error occurred'
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      onErrorRef.current?.(errorMessage)
      throw error
    }
  }, [])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    setState({
      data: initialDataRef.current,
      loading: false,
      error: null,
      lastFetched: null
    })
  }, [])

  const refetch = useCallback(() => {
    return execute()
  }, [execute])

  // Re-fetch when pathname changes (navigation) — AbortController cancels
  // any previous in-flight request so auth state re-renders don't corrupt data
  useEffect(() => {
    if (!immediateRef.current) return
    setState({
      data: initialDataRef.current,
      loading: false,
      error: null,
      lastFetched: null
    })
    const timeoutId = setTimeout(() => { execute() }, 0)
    return () => {
      clearTimeout(timeoutId)
      abortControllerRef.current?.abort()
    }
  }, [location.pathname, execute])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
    refetch
  }
}

// ─── usePaginatedApi ─────────────────────────────────────────────────────────

interface PaginatedApiState<T> extends ApiState<T[]> {
  pagination: {
    page: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
  }
}

/**
 * Options for `usePaginatedApi`. Extends `UseApiOptions` with `itemsPerPage`.
 */
interface UsePaginatedApiOptions<T> extends UseApiOptions<T[]> {
  itemsPerPage?: number
}

/**
 * Return value of `usePaginatedApi`. Extends `UseApiReturn` with pagination
 * controls.
 *
 * @prop pagination - Current page, totalPages, totalItems, itemsPerPage
 * @prop setPage - Navigate to a specific page (triggers re-fetch if immediate)
 * @prop setItemsPerPage - Change page size, resets to page 1
 * @prop nextPage / prevPage - Convenience page navigation
 * @prop hasNextPage / hasPrevPage - Boundary guards
 */
interface UsePaginatedApiReturn<T> extends UseApiReturn<T[]> {
  pagination: PaginatedApiState<T>['pagination']
  setPage: (page: number) => void
  setItemsPerPage: (itemsPerPage: number) => void
  nextPage: () => void
  prevPage: () => void
  hasNextPage: boolean
  hasPrevPage: boolean
}

/**
 * Paginated variant of `useApi`. Manages page and itemsPerPage state and
 * automatically re-fetches when either changes (if `immediate: true`).
 *
 * @param apiFunction - Must accept `{ page, itemsPerPage, ...params }` and
 *   return `{ data: T[], pagination: { page, totalPages, totalItems, itemsPerPage } }`
 * @param options - `UsePaginatedApiOptions<T>`
 * @returns `UsePaginatedApiReturn<T>`
 *
 * @sideEffects React state mutations
 * @calledBy admin list pages with server-side pagination
 */
export function usePaginatedApi<T>(
  apiFunction: (params: { page: number; itemsPerPage: number; [key: string]: any }) => Promise<{
    data: T[]
    pagination: {
      page: number
      totalPages: number
      totalItems: number
      itemsPerPage: number
    }
  }>,
  options: UsePaginatedApiOptions<T> = {}
): UsePaginatedApiReturn<T> {
  const { itemsPerPage: defaultItemsPerPage = 20, ...apiOptions } = options
  
  const [state, setState] = useState<PaginatedApiState<T>>({
    data: [],
    loading: false,
    error: null,
    lastFetched: null,
    pagination: {
      page: 1,
      totalPages: 0,
      totalItems: 0,
      itemsPerPage: defaultItemsPerPage
    }
  })

  const execute = useCallback(async (params?: any) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await apiFunction({
        page: state.pagination.page,
        itemsPerPage: state.pagination.itemsPerPage,
        ...params
      })
      
      setState({
        data: result.data,
        loading: false,
        error: null,
        lastFetched: new Date(),
        pagination: result.pagination
      })
      
      apiOptions.onSuccess?.(result.data)
      return result.data
    } catch (error: any) {
      const errorMessage = error?.message || 'An error occurred'
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      apiOptions.onError?.(errorMessage)
      throw error
    }
  }, [apiFunction, state.pagination.page, state.pagination.itemsPerPage, apiOptions])

  const setPage = useCallback((page: number) => {
    setState(prev => ({
      ...prev,
      pagination: {
        ...prev.pagination,
        page
      }
    }))
  }, [])

  const setItemsPerPage = useCallback((itemsPerPage: number) => {
    setState(prev => ({
      ...prev,
      pagination: {
        ...prev.pagination,
        itemsPerPage,
        page: 1 // Reset to first page when changing items per page
      }
    }))
  }, [])

  const nextPage = useCallback(() => {
    if (state.pagination.page < state.pagination.totalPages) {
      setPage(state.pagination.page + 1)
    }
  }, [state.pagination.page, state.pagination.totalPages, setPage])

  const prevPage = useCallback(() => {
    if (state.pagination.page > 1) {
      setPage(state.pagination.page - 1)
    }
  }, [state.pagination.page, setPage])

  const reset = useCallback(() => {
    setState({
      data: [],
      loading: false,
      error: null,
      lastFetched: null,
      pagination: {
        page: 1,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: defaultItemsPerPage
      }
    })
  }, [defaultItemsPerPage])

  const refetch = useCallback(() => {
    return execute()
  }, [execute])

  const hasNextPage = state.pagination.page < state.pagination.totalPages
  const hasPrevPage = state.pagination.page > 1

  // Auto-execute when page or itemsPerPage changes
  useEffect(() => {
    if (apiOptions.immediate) {
      execute()
    }
  }, [state.pagination.page, state.pagination.itemsPerPage, apiOptions.immediate, execute])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
    refetch,
    pagination: state.pagination,
    setPage,
    setItemsPerPage,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage
  }
}

// ─── useMutation ─────────────────────────────────────────────────────────────

interface MutationState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Options for `useMutation`.
 *
 * @prop onSuccess - Called with the result after a successful mutation
 * @prop onError - Called with the error message on failure
 * @prop onSettled - Called after success or failure (always fires)
 */
interface UseMutationOptions<T, P> {
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
  onSettled?: () => void
}

/**
 * Return value of `useMutation`.
 *
 * @prop data - Result of the last successful mutation, or null
 * @prop loading - True while the mutation is in flight
 * @prop error - Error message string or null
 * @prop mutate - Trigger the mutation with typed params
 * @prop reset - Reset state to null/false/null
 */
interface UseMutationReturn<T, P> {
  data: T | null
  loading: boolean
  error: string | null
  mutate: (params: P) => Promise<T>
  reset: () => void
}

/**
 * Write-operation hook for create, update, and delete calls. Does not
 * auto-execute — call `mutate(params)` explicitly.
 *
 * @param mutationFunction - Async write function taking typed params
 * @param options - `UseMutationOptions<T, P>`
 * @returns `UseMutationReturn<T, P>` — data, loading, error, mutate, reset
 *
 * @sideEffects React state mutations; triggers `onSuccess/onError/onSettled` callbacks
 * @calledBy useEntityRecord.ts (save and delete mutations)
 *
 * @example
 * ```tsx
 * const { mutate, loading } = useMutation(
 *   async (id: string) => apiFetch(`/api/items?action=delete&id=${id}`, { method: 'DELETE' }),
 *   { onSuccess: () => navigate('/items') }
 * )
 * ```
 */
export function useMutation<T, P = void>(
  mutationFunction: (params: P) => Promise<T>,
  options: UseMutationOptions<T, P> = {}
): UseMutationReturn<T, P> {
  const { onSuccess, onError, onSettled } = options
  
  const [state, setState] = useState<MutationState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const mutate = useCallback(async (params: P) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await mutationFunction(params)
      setState({
        data: result,
        loading: false,
        error: null
      })
      onSuccess?.(result)
      return result
    } catch (error: any) {
      const errorMessage = error?.message || 'An error occurred'
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }))
      onError?.(errorMessage)
      throw error
    } finally {
      onSettled?.()
    }
  }, [mutationFunction, onSuccess, onError, onSettled])

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null
    })
  }, [])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    mutate,
    reset
  }
}
