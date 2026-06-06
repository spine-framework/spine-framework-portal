import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@core/lib/api'
import { getTypeIdAsync } from './useTypeRegistry'

export interface PortalMessage {
  id: string
  content: string
  direction: 'inbound' | 'outbound'
  visibility?: 'public' | 'internal'
  sequence: number
  created_by?: string
  created_at: string
  data?: Record<string, any>
}

export interface PortalThread {
  id: string
  target_type: string
  target_id: string
  status: string
  type_id?: string
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

export function usePortalThread(targetType: string, targetId: string | null) {
  const [thread, setThread] = useState<PortalThread | null>(null)
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!targetId) return
    setLoading(true)
    setError(null)
    try {
      const threads = await fetchJSON(
        `/.netlify/functions/admin-data?entity=threads&target_type=${targetType}&target_id=${targetId}`
      )
      const found: PortalThread | null = Array.isArray(threads) ? (threads[0] ?? null) : null
      setThread(found)
      if (found?.id) {
        const msgs = await fetchJSON(
          `/.netlify/functions/admin-data?entity=messages&thread_id=${found.id}&sort_direction=asc`
        )
        setMessages(Array.isArray(msgs) ? msgs : [])
      } else {
        setMessages([])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [targetType, targetId])

  useEffect(() => { load() }, [load])

  const reply = useCallback(async (content: string) => {
    let activeThread = thread
    
    if (!activeThread?.id) {
      const threadTypeId = await getTypeIdAsync('thread')
      if (!threadTypeId) throw new Error('thread type not found')
      
      activeThread = await fetchJSON('/.netlify/functions/admin-data', {
        method: 'POST',
        body: JSON.stringify({
          entity: 'threads',
          type_id: threadTypeId,
          target_type: targetType,
          target_id: targetId,
          status: 'open',
        }),
      })
      setThread(activeThread)
    }
    
    const messageTypeId = await getTypeIdAsync('message')
    if (!messageTypeId) throw new Error('message type not found')
    
    // Calculate next sequence based on current messages to avoid stale state
    const nextSequence = messages.reduce((max, m) => Math.max(max, m.sequence || 0), 0) + 1
    
    const msg = await fetchJSON('/.netlify/functions/admin-data', {
      method: 'POST',
      body: JSON.stringify({
        entity: 'messages',
        type_id: messageTypeId,
        thread_id: activeThread!.id,
        content,
        direction: 'inbound',
        sequence: nextSequence,
      }),
    })
    setMessages((prev) => [...prev, msg])
    return msg
  }, [thread, targetType, targetId, messages])

  return { thread, messages, loading, error, reply, refetch: load }
}
