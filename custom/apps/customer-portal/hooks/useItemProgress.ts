import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '@core/lib/api'
import { ItemProgress } from '@core/types/types'

async function fetchJSON(path: string, options?: RequestInit): Promise<any> {
  const res = await apiFetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
  }
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data ?? json
}

/**
 * Batch-fetches item_progress records for a set of item IDs for the current person.
 * Returns a Map<itemId, ItemProgress> for O(1) lookup in components.
 *
 * @param personId - The current portal user's person ID
 * @param itemIds  - Array of item IDs to fetch progress for
 */
export function useItemProgress(personId: string | null, itemIds: string[]) {
  const [progressMap, setProgressMap] = useState<Map<string, ItemProgress>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevKey = useRef<string>('')

  const load = useCallback(async () => {
    if (!personId || itemIds.length === 0) {
      setProgressMap(new Map())
      return
    }

    const key = `${personId}:${itemIds.sort().join(',')}`
    if (key === prevKey.current) return
    prevKey.current = key

    setLoading(true)
    setError(null)
    try {
      const ids = itemIds.join(',')
      const records: ItemProgress[] = await fetchJSON(
        `/.netlify/functions/item-progress?person_id=${personId}&item_ids=${ids}`
      )
      const map = new Map<string, ItemProgress>()
      for (const r of records || []) map.set(r.item_id, r)
      setProgressMap(map)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [personId, itemIds.join(',')])

  useEffect(() => { load() }, [load])

  return { progressMap, loading, error, refetch: load }
}

/**
 * Returns an `upsert` function that creates or updates an item_progress record.
 * Handles auto-composition of title/description server-side.
 *
 * Usage:
 *   const { upsert, loading } = useUpsertProgress()
 *   await upsert({ personId, itemId, typeId, accountId, status: 'completed', score: 85 })
 */
export function useUpsertProgress() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upsert = useCallback(async (params: {
    personId: string
    itemId: string
    typeId: string
    accountId: string
    appId?: string
    status?: string
    score?: number
    data?: Record<string, any>
    force?: boolean
  }): Promise<ItemProgress> => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchJSON('/.netlify/functions/item-progress', {
        method: 'POST',
        body: JSON.stringify({
          person_id:  params.personId,
          item_id:    params.itemId,
          type_id:    params.typeId,
          account_id: params.accountId,
          app_id:     params.appId,
          status:     params.status,
          score:      params.score,
          data:       params.data,
          force:      params.force,
        }),
      })
      return result
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { upsert, loading, error }
}
