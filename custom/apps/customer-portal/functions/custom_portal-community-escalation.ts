// Portal Community Escalation Handler
// Converts unanswered community posts to support tickets.
// Standalone: no dependency on cortex functions.
// Triggered by cron — see portal seed/triggers.json.

import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'

interface CommunityPost {
  id: string
  title: string
  description?: string
  account_id: string
  person_id: string
  created_at: string
  data?: {
    category?: string
    tags?: string[]
    status?: string
    escalation?: {
      escalated_to_ticket_id?: string
    }
  }
}

async function escalatePostToTicket(post: CommunityPost): Promise<string | null> {
  try {
    const { data: existingTicket } = await adminDb
      .from('items')
      .select('id')
      .eq('type_slug', 'support_ticket')
      .eq('data->>source_post_id', post.id)
      .limit(1)
      .maybeSingle()

    if (existingTicket) {
      console.log(`Post ${post.id} already escalated to ticket ${existingTicket.id}`)
      return null
    }

    const { data: newTicket, error: insertError } = await adminDb
      .from('items')
      .insert({
        type_slug: 'support_ticket',
        title: `Escalated: ${post.title}`,
        description: post.description || 'No description provided',
        account_id: post.account_id,
        person_id: post.person_id,
        status: 'open',
        data: {
          source_post_id: post.id,
          source: 'community_escalation',
          escalated_at: new Date().toISOString(),
          original_category: post.data?.category || 'general',
          original_tags: post.data?.tags || [],
          community_status: 'unanswered_24h',
          ai_metadata: {
            confidence_threshold: 0.75,
            escalation_reason: 'community_unanswered',
            problem_statement: post.title,
            source_content: post.description?.slice(0, 1000),
          },
        },
      })
      .select('id')
      .single()

    if (insertError || !newTicket) {
      throw new Error(`Failed to create ticket: ${insertError?.message}`)
    }

    const ticketId = newTicket.id

    await adminDb.from('threads').insert({
      target_type: 'items',
      target_id: ticketId,
      visibility: 'external',
      status: 'active',
    })

    await adminDb
      .from('items')
      .update({
        data: {
          ...post.data,
          status: 'escalated',
          escalation: {
            escalated_to_ticket_id: ticketId,
            escalated_at: new Date().toISOString(),
            reason: 'unanswered_24h',
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id)

    // Attempt to trigger support triage pipeline if present
    try {
      const { data: pipeline } = await adminDb
        .from('pipelines')
        .select('id')
        .ilike('name', '%support%triage%')
        .limit(1)
        .maybeSingle()

      if (pipeline) {
        await adminDb.from('pipeline_executions').insert({
          pipeline_id: pipeline.id,
          target_type: 'items',
          target_id: ticketId,
          status: 'pending',
          input_context: {
            ticket_id: ticketId,
            account_id: post.account_id,
            title: post.title,
            description: post.description || '',
            source: 'community_escalation',
          },
        })
      }
    } catch (err) {
      console.error('Failed to trigger triage pipeline:', err)
    }

    console.log(`Escalated post ${post.id} to ticket ${ticketId}`)
    return ticketId

  } catch (err) {
    console.error(`Failed to escalate post ${post.id}:`, err)
    throw err
  }
}

export const checkUnanswered = createHandler(async (_ctx, _body) => {
  console.log('[PortalEscalation] Starting community escalation check...')

  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: unansweredPosts, error: postsError } = await adminDb
      .from('items')
      .select('id, title, description, account_id, person_id, created_at, data')
      .eq('type_slug', 'community_post')
      .not('data->>status', 'eq', 'escalated')
      .lt('created_at', cutoffTime)
      .order('created_at', { ascending: true })
      .limit(50)

    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`)
    }

    if (!unansweredPosts || unansweredPosts.length === 0) {
      return { status: 'ok', processed: 0, escalated: 0, failed: 0, skipped: 0 }
    }

    const postsToEscalate: CommunityPost[] = []
    for (const post of unansweredPosts) {
      const { data: replies } = await adminDb
        .from('items')
        .select('id')
        .eq('type_slug', 'community_reply')
        .eq('data->>post_id', post.id)
        .gt('created_at', post.created_at)
        .limit(1)

      if (!replies || replies.length === 0) {
        postsToEscalate.push(post as CommunityPost)
      }
    }

    console.log(`[PortalEscalation] Found ${postsToEscalate.length} unanswered posts`)

    const results = { escalated: [] as string[], failed: [] as string[], skipped: [] as string[] }

    for (const post of postsToEscalate) {
      try {
        const ticketId = await escalatePostToTicket(post)
        if (ticketId) results.escalated.push(post.id)
        else results.skipped.push(post.id)
      } catch (err) {
        console.error(`Failed to escalate post ${post.id}:`, err)
        results.failed.push(post.id)
      }
    }

    return {
      status: 'ok',
      processed: postsToEscalate.length,
      escalated: results.escalated.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      details: results,
    }

  } catch (err) {
    console.error('[PortalEscalation] Failed:', err)
    const error: any = new Error('Failed to process community escalation')
    error.statusCode = 500
    throw error
  }
})
