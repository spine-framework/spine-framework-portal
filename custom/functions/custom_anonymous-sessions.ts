// Anonymous Session Functions
// Uses ONLY Spine APIs (ctx.db) - NO direct database access
// Handles stitch operation: anonymous session → identified account

import { createHandler } from './_shared/middleware'
import { calculateRecency, calculateRawScore } from './custom_funnel-scoring'

// Type IDs from migration
const TYPE_IDS = {
  anonymous_session: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  funnel_signal: '0923f7a2-3ccd-4499-986f-28c6fd0597d9',
  opportunity_queue: '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e'
}

const LINK_TYPE_IDS = {
  account_signals: '4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  account_opportunities: '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b'
}

// ============================================
// STITCH: Anonymous Session → Identified Account
// ============================================

export const stitchAnonymousToAccount = createHandler(async (ctx, body) => {
  const { anonymous_id, person_id, account_id } = body

  if (!anonymous_id || !person_id || !account_id) {
    return { status: 'error', error: 'Missing required fields: anonymous_id, person_id, account_id' }
  }

  const now = new Date().toISOString()

  try {
    // 1. Get anonymous session using ctx.db
    const { data: session, error: sessionError } = await ctx.db
      .from('items')
      .select('id, data')
      .eq('type_id', TYPE_IDS.anonymous_session)
      .eq('data->identity->>anonymous_id', anonymous_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (sessionError || !session) {
      return { status: 'error', error: 'Anonymous session not found' }
    }

    const sessionData = session.data || {}

    // Check if already stitched
    if (sessionData.lifecycle?.stitched_at) {
      return { status: 'error', error: 'Session already stitched' }
    }

    // 2. Get account using ctx.db
    const { data: account, error: accountError } = await ctx.db
      .from('accounts')
      .select('id, data')
      .eq('id', account_id)
      .single()

    if (accountError || !account) {
      return { status: 'error', error: 'Account not found' }
    }

    // 3. Update all signals with account_id and person_id using ctx.db
    const { error: signalsError } = await ctx.db
      .from('items')
      .update({
        account_id: account_id,
        'data->identity->>person_id': person_id,
        'data->processing->>stitched_at': now,
        'data->processing->>stitched_to_account_id': account_id,
        updated_at: now
      })
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('data->identity->>anonymous_id', anonymous_id)
      .is('account_id', null)

    if (signalsError) {
      console.error(`[Stitch] Failed to update signals: ${signalsError.message}`)
    }

    // 4. Get updated signals for recalculation
    const { data: updatedSignals } = await ctx.db
      .from('items')
      .select('data')
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('account_id', account_id)
      .eq('data->classification->>stage', 'identified')
      .eq('is_active', true)

    // 5. Recalculate identified rating with newly-stitched signals
    let identifiedRating = { rating: 0, raw_score: 0, calculated_at: now, best_signal_id: null as string | null }

    if (updatedSignals && updatedSignals.length > 0) {
      let bestSignal = updatedSignals[0]
      let bestScore = bestSignal.data?.scoring_components?.raw_score?.calculated || 0

      for (const signal of updatedSignals) {
        const score = signal.data?.scoring_components?.raw_score?.calculated || 0
        if (score > bestScore) {
          bestScore = score
          bestSignal = signal
        }
      }

      // Recalculate with current recency
      const signalDate = new Date(bestSignal.data?.processing?.scored_at || now)
      const recency = calculateRecency(signalDate, new Date(), 'identified')

      if (recency.divisor) {
        const newScore = calculateRawScore(
          bestSignal.data?.action?.action_value || 1,
          bestSignal.data?.scoring_components?.engagement?.type || 1,
          recency.divisor
        )

        identifiedRating = {
          rating: newScore.rating,
          raw_score: newScore.calculated,
          calculated_at: now,
          best_signal_id: bestSignal.data?.id || null
        }
      }
    }

    // 6. Update account with stitched data using ctx.db
    const currentFunnel = account.data?.funnel || {}
    const anonymousRating = sessionData.scoring?.ratings?.anonymous

    const updatedFunnel = {
      ...currentFunnel,
      current_stage: 'identified',
      ratings: {
        ...currentFunnel.ratings,
        anonymous: anonymousRating ? {
          ...anonymousRating,
          stitched_at: now,
          archived: true
        } : currentFunnel.ratings?.anonymous,
        identified: identifiedRating
      },
      attribution: {
        ...currentFunnel.attribution,
        anonymous_first_touch: sessionData.attribution?.first_touch
      },
      stage_history: [
        ...(currentFunnel.stage_history || []),
        { from: 'anonymous', to: 'identified', at: now }
      ]
    }

    await ctx.db
      .from('accounts')
      .update({
        data: { ...account.data, funnel: updatedFunnel }
      })
      .eq('id', account_id)

    // 7. Mark session as stitched using ctx.db
    const updatedSessionData = {
      ...sessionData,
      lifecycle: {
        ...sessionData.lifecycle,
        stitched_at: now,
        stitched_to_account_id: account_id,
        stitched_to_person_id: person_id
      }
    }

    await ctx.db
      .from('items')
      .update({
        data: updatedSessionData,
        updated_at: now
      })
      .eq('id', session.id)

    // 8. Check for immediate queue entry (strong anonymous activity)
    let queueEntry = null
    if (anonymousRating?.rating >= 4) {
      const inference = { type: 'implementation', confidence: 'high' }

      const queueData = {
        identity: {
          account_id: account_id,
          person_id: person_id
        },
        trigger: {
          source_signal_id: anonymousRating.best_signal_id,
          trigger_stage: 'anonymous',
          trigger_rating: anonymousRating.rating,
          trigger_raw_score: anonymousRating.raw_score,
          trigger_reason: 'High engagement during anonymous phase'
        },
        recommendation: {
          opportunity_type: inference.type,
          confidence: inference.confidence,
          suggested_priority: anonymousRating.rating
        },
        review: {
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          conversion_opportunity_id: null
        },
        notes: {
          reviewer_notes: null,
          auto_reason: 'Stitched from anonymous session with high engagement'
        }
      }

      const { data: queueItem } = await ctx.db
        .from('items')
        .insert({
          type_id: TYPE_IDS.opportunity_queue,
          title: `${inference.type} - Stitched Session`,
          account_id: account_id,
          data: queueData
        })
        .select('id')
        .single()

      if (queueItem) {
        queueEntry = { id: queueItem.id }

        // Create link to account
        await ctx.db
          .from('links')
          .insert({
            link_type_id: LINK_TYPE_IDS.account_opportunities,
            source_type: 'account',
            source_id: account_id,
            target_type: 'item',
            target_id: queueItem.id
          })

        // Update account queue reference
        await ctx.db
          .from('accounts')
          .update({
            data: {
              ...account.data,
              funnel: {
                ...updatedFunnel,
                queue: { pending_queue_entry_id: queueItem.id }
              }
            }
          })
          .eq('id', account_id)
      }
    }

    // 9. Create links between account and all stitched signals
    const { data: stitchedSignals } = await ctx.db
      .from('items')
      .select('id')
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('account_id', account_id)
      .eq('data->processing->>stitched_at', now)

    for (const signal of stitchedSignals || []) {
      await ctx.db
        .from('links')
        .insert({
          link_type_id: LINK_TYPE_IDS.account_signals,
          source_type: 'account',
          source_id: account_id,
          target_type: 'item',
          target_id: signal.id,
          data: { created_at: now, stitched: true }
        })
    }

    return {
      status: 'success',
      session_id: session.id,
      account_id,
      person_id,
      stitched_signals: stitchedSignals?.length || 0,
      queue_entry: queueEntry,
      anonymous_rating: anonymousRating?.rating || 0,
      identified_rating: identifiedRating.rating
    }

  } catch (err) {
    console.error('[Stitch] Error:', err)
    return { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
  }
})

// ============================================
// GET ANONYMOUS SESSION DETAILS
// ============================================

export const getAnonymousSession = createHandler(async (ctx, body) => {
  const { anonymous_id } = body

  if (!anonymous_id) {
    return { status: 'error', error: 'Missing anonymous_id' }
  }

  // Get session using ctx.db
  const { data: session, error } = await ctx.db
    .from('items')
    .select('id, data, created_at, updated_at')
    .eq('type_id', TYPE_IDS.anonymous_session)
    .eq('data->identity->>anonymous_id', anonymous_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !session) {
    return { status: 'error', error: 'Session not found' }
  }

  // Get associated signals using ctx.db
  const { data: signals } = await ctx.db
    .from('items')
    .select('id, data, created_at')
    .eq('type_id', TYPE_IDS.funnel_signal)
    .eq('data->identity->>anonymous_id', anonymous_id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return {
    status: 'success',
    session: {
      id: session.id,
      anonymous_id,
      attribution: session.data?.attribution,
      scoring: session.data?.scoring,
      lifecycle: session.data?.lifecycle,
      created_at: session.created_at,
      updated_at: session.updated_at
    },
    signals: signals || []
  }
})
