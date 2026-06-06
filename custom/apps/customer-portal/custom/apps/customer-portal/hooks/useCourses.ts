import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@core/lib/api'

export interface CourseItem {
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

export function useCourseLessons() {
  const [lessons, setLessons] = useState<CourseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJSON('/.netlify/functions/admin-data?entity=items&type_slug=course_lesson')
      setLessons(data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { lessons, loading, error, refetch: load }
}

export function useCompleteLesson() {
  const [loading, setLoading] = useState(false)

  const completeLesson = useCallback(async (lessonId: string) => {
    setLoading(true)
    try {
      return await fetchJSON(`/.netlify/functions/admin-data?entity=items&id=${lessonId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  return { completeLesson, loading }
}
