import { useCallback } from 'react'
import { apiFetch } from '@core/lib/api'

export type PortalActionType =
  | 'kb_article_read'
  | 'kb_search'
  | 'ticket_create'
  | 'ticket_reply'
  | 'ticket_view'
  | 'lesson_complete'
  | 'lesson_start'
  | 'course_view'
  | 'community_post_create'
  | 'community_reply'
  | 'community_post_view'

type ActionValue = 1 | 2 | 5

const ACTION_VALUES: Record<PortalActionType, ActionValue> = {
  kb_article_read: 2,
  kb_search: 1,
  ticket_create: 5,
  ticket_reply: 2,
  ticket_view: 1,
  lesson_complete: 5,
  lesson_start: 2,
  course_view: 1,
  community_post_create: 5,
  community_reply: 2,
  community_post_view: 1,
}

export function usePortalSignal() {
  const sendSignal = useCallback(async (
    actionType: PortalActionType,
    description?: string
  ) => {
    try {
      await apiFetch('/.netlify/functions/custom_portal-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: actionType,
          action_value: ACTION_VALUES[actionType],
          ...(description && { action_description: description }),
        }),
      })
    } catch (e) {
      // Fire-and-forget — never block the UI on signal failures
      console.debug('[PortalSignal] Failed to send signal:', e)
    }
  }, [])

  return { sendSignal }
}
