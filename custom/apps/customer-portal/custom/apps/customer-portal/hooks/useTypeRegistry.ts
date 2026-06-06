import { useState, useEffect } from 'react'
import { supabase } from '@core/lib/supabase'

interface TypeRecord {
  id: string
  slug: string
  name: string
  description?: string
}

// Module-level cache - persists across renders, shared across hooks
let typeCache: Map<string, TypeRecord> | null = null
let loadPromise: Promise<Map<string, TypeRecord>> | null = null

async function fetchTypes(): Promise<Map<string, TypeRecord>> {
  if (typeCache) return typeCache
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    try {
      // Query Supabase directly - types is a config table, not exposed via admin-data
      const { data: types, error } = await supabase
        .from('types')
        .select('id, slug, name, description')
        .eq('is_active', true)
        .limit(100)

      if (error) throw error

      typeCache = new Map((types || []).map(t => [t.slug, t]))
      return typeCache
    } catch (e) {
      console.error('Failed to load types:', e)
      typeCache = new Map() // Empty cache on error
      return typeCache
    } finally {
      loadPromise = null
    }
  })()

  return loadPromise
}

export function useTypeRegistry() {
  const [types, setTypes] = useState<Map<string, TypeRecord>>(typeCache || new Map())
  const [loading, setLoading] = useState(!typeCache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeCache) return
    
    fetchTypes()
      .then(cache => {
        setTypes(cache)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const getTypeId = (slug: string): string | null => {
    return types.get(slug)?.id || null
  }

  return { types, loading, error, getTypeId }
}

// Synchronous version for use inside async functions
export async function getTypeIdAsync(slug: string): Promise<string | null> {
  const cache = await fetchTypes()
  return cache.get(slug)?.id || null
}
