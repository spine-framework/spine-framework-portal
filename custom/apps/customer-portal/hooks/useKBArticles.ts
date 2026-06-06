import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@core/lib/api'

export interface KBArticle {
  id: string
  title: string
  description?: string
  status: string
  created_at: string
  data?: Record<string, any>
  design_schema?: Record<string, any>
}

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

export function useKBArticles(search = '') {
  const [articles, setArticles] = useState<KBArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (search && search.trim().length >= 2) {
        // Vector similarity search via embeddings
        const res = await apiFetch('/api/custom_kb-embeddings?action=search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: search.trim(), limit: 10 }),
        })
        const json = await res.json()
        const results = json.data || json || []
        setArticles(Array.isArray(results) ? results : [])
      } else {
        // No search — show all published articles
        const data = await fetchJSON(`/.netlify/functions/admin-data?entity=items&type_slug=kb_article&status=published`)
        const visible = (data || []).filter((a: KBArticle) => a.data?.security_level !== 'restricted')
        setArticles(visible)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load() }, [load])

  return { articles, loading, error, refetch: load }
}

export function useKBArticle(id: string | null) {
  const [article, setArticle] = useState<KBArticle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setArticle(null); return }
    setLoading(true)
    setError(null)
    fetchJSON(`/.netlify/functions/admin-data?entity=items&id=${id}`)
      .then(setArticle)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  return { article, loading, error }
}
