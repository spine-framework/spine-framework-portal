import { useState, useEffect } from 'react'

export interface PortalItem {
  id: string
  title: string
  context: 'support' | 'community' | 'kb' | 'course'
  status: string
  created_at: string
  updated_at: string
  data?: Record<string, unknown>
}

export interface PortalThread {
  id: string
  item_id: string
  subject?: string
  status: 'open' | 'closed'
  created_at: string
}

export interface PortalMessage {
  id: string
  thread_id: string
  content: string
  sender_type: 'user' | 'agent' | 'ai'
  direction: 'in' | 'out'
  author_name?: string
  created_at: string
}

// Stub hook for fetching portal items
export function usePortalItems(
  _type?: string,
  _filters?: { context?: string }
) {
  const [items, setItems] = useState<PortalItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Stub - would fetch from API
    setItems([])
  }, [])

  return { items, loading, error, refetch: () => {} }
}

// Stub hook for fetching threads
export function usePortalThreads(itemId?: string) {
  const [threads, setThreads] = useState<PortalThread[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (itemId) {
      // Stub - would fetch from API
      setThreads([])
    }
  }, [itemId])

  return { threads, loading, refetch: () => {} }
}

// Stub hook for fetching messages
export function usePortalMessages(threadId?: string) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (threadId) {
      // Stub - would fetch from API
      setMessages([])
    }
  }, [threadId])

  return { messages, loading, refetch: () => {} }
}

// Stub hook for creating portal items
export function useCreatePortalItem() {
  const createItem = async (data: Partial<PortalItem>) => {
    console.log('Creating item:', data)
    return { id: 'stub-id', ...data }
  }
  return { createItem, loading: false }
}

// Stub hook for AI interactions
export function useAIInteraction() {
  const generateKBArticle = async (
    _ticketId?: string,
    _resolution?: string,
    _originalIssue?: string
  ) => {
    return { title: 'KB Article', content: 'Generated content...', tags: [] }
  }

  const autoModerate = async () => {
    return { approved: true, reason: 'Stub moderation' }
  }

  return { generateKBArticle, autoModerate }
}
