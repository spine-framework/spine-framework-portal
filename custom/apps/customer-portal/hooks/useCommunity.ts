import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@core/lib/api'
import { getTypeIdAsync } from './useTypeRegistry'

export interface CommunityPost {
  id: string
  title: string
  description?: string
  status: string
  created_at: string
  data?: Record<string, any>
  design_schema?: Record<string, any>
}

const BASE = '/.netlify/functions/admin-data?entity=items&type_slug=community_post'

async function fetchJSON(path: string, options?: RequestInit) {
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
  return json.data
}

export function useCommunityPosts() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJSON(BASE)
      setPosts(data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { posts, loading, error, refetch: load }
}

export function useCreatePost() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createPost = useCallback(async (fields: { title: string; description?: string; data?: Record<string, any> }) => {
    setLoading(true)
    setError(null)
    try {
      const typeId = await getTypeIdAsync('community_post')
      if (!typeId) throw new Error('community_post type not found')
      
      return await fetchJSON('/.netlify/functions/admin-data', {
        method: 'POST',
        body: JSON.stringify({ entity: 'items', type_id: typeId, ...fields }),
      })
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { createPost, loading, error }
}
