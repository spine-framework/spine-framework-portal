import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@core/lib/api'
import { getTypeIdAsync } from './useTypeRegistry'

export interface Ticket {
  id: string
  title: string
  status?: string
  created_at: string
  description?: string
  data?: Record<string, any>
  design_schema?: Record<string, any>
}

const BASE = '/.netlify/functions/admin-data?entity=items&type_slug=support_ticket'

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

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchJSON(BASE)
      setTickets(data || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { tickets, loading, error, refetch: load }
}

export function useTicket(id: string | null) {
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    fetchJSON(`/.netlify/functions/admin-data?entity=items&id=${id}`)
      .then(setTicket)
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  return { ticket, loading, error }
}

export function useCreateTicket() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createTicket = useCallback(async (fields: { title: string; description?: string; priority?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const typeId = await getTypeIdAsync('support_ticket')
      if (!typeId) throw new Error('support_ticket type not found')
      
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

  return { createTicket, loading, error }
}

// Create a new ticket via AI triage — single call that creates ticket+thread+messages
export function useNewTicketTriage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startTriage = useCallback(async (message: string) => {
    setLoading(true)
    setError(null)
    try {
      return await fetchJSON('/.netlify/functions/custom_support-triage?action=new_ticket', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { startTriage, loading, error }
}

// Send a follow-up message on an existing ticket via AI triage
export function useTriageReply() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendReply = useCallback(async (message: string, threadId: string, ticketId: string) => {
    setLoading(true)
    setError(null)
    try {
      return await fetchJSON('/.netlify/functions/custom_support-triage?action=reply', {
        method: 'POST',
        body: JSON.stringify({ message, thread_id: threadId, ticket_id: ticketId }),
      })
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { sendReply, loading, error }
}

// Run AI triage agent after ticket creation
export function useRunTriageAgent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTriage = useCallback(async (threadId: string, message: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchJSON('/.netlify/functions/ai-agents?action=run', {
        method: 'POST',
        body: JSON.stringify({
          thread_id: threadId,
          message,
          agent_type: 'support_triage'
        }),
      })
      return response
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { runTriage, loading, error }
}

// Submit thumbs up/down feedback on AI response
export function useSubmitFeedback() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitFeedback = useCallback(async (ticketId: string, messageId: string, feedback: 'up' | 'down') => {
    setLoading(true)
    setError(null)
    try {
      // Update message data with feedback
      await fetchJSON(`/.netlify/functions/admin-data?entity=messages&id=${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            feedback,
            feedback_at: new Date().toISOString()
          }
        }),
      })
      
      // If thumbs down, escalate to human
      if (feedback === 'down') {
        await fetchJSON(`/.netlify/functions/admin-data?entity=items&id=${ticketId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            data: {
              status: 'human_assigned',
              aim_escalation_reason: 'thumbs_down'
            }
          }),
        })
      }
      
      return { success: true }
    } catch (e: any) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return { submitFeedback, loading, error }
}

export function useUpdateTicket() {
  const [loading, setLoading] = useState(false)

  const updateTicket = useCallback(async (id: string, updates: { status?: string; data?: any }) => {
    setLoading(true)
    try {
      return await fetchJSON(`/.netlify/functions/admin-data?entity=items&id=${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  return { updateTicket, loading }
}
