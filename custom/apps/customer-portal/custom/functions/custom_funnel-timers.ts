// Funnel Timer Functions
// Uses ONLY Spine APIs (ctx.db) - NO direct database access

import { createHandler } from './_shared/middleware'
import { calculateRecency, calculateRawScore, inferOpportunityType } from './custom_funnel-scoring'

// Type IDs from migration
const TYPE_IDS = {
  anonymous_session: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  funnel_signal: '0923f7a2-3ccd-4499-986f-28c6fd0597d9',
  funnel_aggregation: '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f'
}

// ============================================
// TIMER 1: Score Decay (Daily at 11:59:59 PM)
// Updates account ratings based on recency decay
// ============================================

export const scoreDecay = createHandler(async (ctx, _body) => {
  console.log('[FunnelTimer] Starting score decay recalculation')

  const startTime = Date.now()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // Find accounts needing recalculation using ctx.db
  const { data: accounts, error } = await ctx.db
    .from('accounts')
    .select('id, data')
    .not('data->funnel->>current_stage', 'is', null)
    .eq('is_active', true)

  if (error) {
    return { status: 'error', error: error.message, task: 'score_decay' }
  }

  let updated = 0
  let skipped = 0
  let errors = 0

  for (const account of accounts || []) {
    try {
      const funnel = account.data?.funnel
      if (!funnel) {
        skipped++
        continue
      }

      const ratings = funnel.ratings || {}
      let hasChanges = false
      const updatedRatings = { ...ratings }

      // Check each stage for decay
      for (const stage of ['anonymous', 'identified', 'installed'] as const) {
        const stageRating = ratings[stage]
        if (!stageRating) continue

        // Get the best signal for this stage
        const { data: signals } = await ctx.db
          .from('items')
          .select('data')
          .eq('type_id', TYPE_IDS.funnel_signal)
          .eq('account_id', account.id)
          .eq('data->classification->>stage', stage)
          .eq('is_active', true)
          .order('data->processing->>scored_at', { ascending: false })
          .limit(50)

        if (!signals || signals.length === 0) continue

        // Find best signal
        let bestSignal = signals[0]
        let bestScore = bestSignal.data?.scoring_components?.raw_score?.calculated || 0

        for (const signal of signals) {
          const score = signal.data?.scoring_components?.raw_score?.calculated || 0
          if (score > bestScore) {
            bestScore = score
            bestSignal = signal
          }
        }

        // Recalculate recency
        const signalDate = new Date(bestSignal.data?.processing?.scored_at || bestSignal.created_at)
        const recency = calculateRecency(signalDate, new Date(), stage)

        if (recency.window === 'expired') {
          // Score expired - rating drops to 0
          if (stageRating.rating > 0) {
            updatedRatings[stage] = {
              ...stageRating,
              rating: 0,
              raw_score: 0,
              calculated_at: new Date().toISOString()
            }
            hasChanges = true
          }
          continue
        }

        // Recalculate score with current recency
        const actionValue = bestSignal.data?.action?.action_value || 1
        const engagementType = bestSignal.data?.scoring_components?.engagement?.type || 1

        const newScore = calculateRawScore(
          actionValue,
          engagementType,
          recency.divisor || 5
        )

        // Update if rating changed
        if (newScore.rating !== stageRating.rating) {
          updatedRatings[stage] = {
            ...stageRating,
            rating: newScore.rating,
            raw_score: newScore.calculated,
            calculated_at: new Date().toISOString()
          }
          hasChanges = true
        }
      }

      // Update account if changes were made
      if (hasChanges) {
        const maxRating = Math.max(
          updatedRatings.anonymous?.rating || 0,
          updatedRatings.identified?.rating || 0,
          updatedRatings.installed?.rating || 0
        )

        const updatedFunnel = {
          ...funnel,
          ratings: updatedRatings,
          temperature: ratingToTemperature(maxRating)
        }

        await ctx.db
          .from('accounts')
          .update({
            data: { ...account.data, funnel: updatedFunnel }
          })
          .eq('id', account.id)

        updated++
      } else {
        skipped++
      }
    } catch (err) {
      errors++
      console.error(`[FunnelTimer] Failed to recalculate account ${account.id}:`, err)
    }
  }

  const duration = Date.now() - startTime
  console.log(`[FunnelTimer] Score decay complete: ${updated} updated, ${skipped} skipped, ${errors} errors, ${duration}ms`)

  return {
    status: 'success',
    task: 'score_decay',
    updated_count: updated,
    skipped_count: skipped,
    error_count: errors,
    duration_ms: duration
  }
})

// ============================================
// TIMER 2: Session Cleanup (Daily at 2:00 AM)
// Soft-deletes expired anonymous sessions
// ============================================

export const sessionCleanup = createHandler(async (ctx, _body) => {
  console.log('[FunnelTimer] Starting anonymous session cleanup')

  const startTime = Date.now()
  const now = new Date().toISOString()

  // Find expired sessions using ctx.db
  const { data: sessions, error } = await ctx.db
    .from('items')
    .select('id, data')
    .eq('type_id', TYPE_IDS.anonymous_session)
    .eq('is_active', true)
    .lt('data->retention->>purge_after', now)
    .is('data->lifecycle->>stitched_at', null)

  if (error) {
    return { status: 'error', error: error.message, task: 'session_cleanup' }
  }

  let purged = 0
  let errors = 0

  for (const session of sessions || []) {
    try {
      // Soft delete - mark as inactive
      await ctx.db
        .from('items')
        .update({ is_active: false, updated_at: now })
        .eq('id', session.id)

      purged++
      console.log(`[FunnelTimer] Purged session: ${session.id}`)
    } catch (err) {
      errors++
      console.error(`[FunnelTimer] Failed to purge session ${session.id}:`, err)
    }
  }

  const duration = Date.now() - startTime
  console.log(`[FunnelTimer] Cleanup complete: ${purged} purged, ${errors} errors, ${duration}ms`)

  return {
    status: 'success',
    task: 'session_cleanup',
    purged_count: purged,
    error_count: errors,
    duration_ms: duration
  }
})

// ============================================
// TIMER 3: Aggregation (Hourly)
// Creates/updates funnel_aggregation items for dashboard cache
// ============================================

export const aggregation = createHandler(async (ctx, _body) => {
  console.log('[FunnelTimer] Starting funnel aggregation')

  const startTime = Date.now()
  const now = new Date()
  const periodEnd = now.toISOString()
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1. System-wide aggregation
  try {
    // Count accounts by stage
    const { data: accounts } = await ctx.db
      .from('accounts')
      .select('data->funnel->>current_stage as stage, data->funnel->>temperature as temperature')
      .eq('is_active', true)

    const stageDistribution: Record<string, number> = { anonymous: 0, identified: 0, installed: 0, null: 0 }
    const tempDistribution: Record<string, number> = { cold: 0, warm: 0, hot: 0, null: 0 }

    for (const account of accounts || []) {
      const stage = account.stage || 'null'
      const temp = account.temperature || 'null'
      stageDistribution[stage] = (stageDistribution[stage] || 0) + 1
      tempDistribution[temp] = (tempDistribution[temp] || 0) + 1
    }

    // Count signals by source
    const { data: signals } = await ctx.db
      .from('items')
      .select('data->classification->>source as source')
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('is_active', true)
      .gte('created_at', periodStart)

    const signalVolume: Record<string, number> = {}
    for (const signal of signals || []) {
      const source = signal.source || 'unknown'
      signalVolume[source] = (signalVolume[source] || 0) + 1
    }

    // Count queue entries
    const { count: pendingQueue } = await ctx.db
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('type_id', '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e') // opportunity_queue
      .eq('data->review->>status', 'pending')
      .eq('is_active', true)

    // Check for existing system aggregation
    const { data: existingSystemAgg } = await ctx.db
      .from('items')
      .select('id')
      .eq('type_id', TYPE_IDS.funnel_aggregation)
      .eq('data->identity->>aggregation_scope', 'system')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    const aggData = {
      identity: {
        account_id: null,
        aggregation_scope: 'system'
      },
      metadata: {
        computed_at: now.toISOString(),
        period_start: periodStart,
        period_end: periodEnd,
        ttl_hours: 1
      },
      metrics: {
        stage_distribution: stageDistribution,
        temperature_distribution: tempDistribution,
        signal_volume: signalVolume,
        queue_summary: {
          pending: pendingQueue || 0
        },
        total_accounts: accounts?.length || 0
      }
    }

    if (existingSystemAgg?.[0]) {
      // Update existing
      await ctx.db
        .from('items')
        .update({
          data: aggData,
          updated_at: now.toISOString()
        })
        .eq('id', existingSystemAgg[0].id)
    } else {
      // Create new
      await ctx.db
        .from('items')
        .insert({
          type_id: TYPE_IDS.funnel_aggregation,
          title: 'System Funnel Aggregation',
          data: aggData
        })
    }
  } catch (err) {
    console.error('[FunnelTimer] Failed to create system aggregation:', err)
  }

  // 2. Per-account aggregation (top 100 accounts by rating)
  try {
    const { data: accounts } = await ctx.db
      .from('accounts')
      .select('id, data->funnel as funnel')
      .not('data->funnel', 'is', null)
      .eq('is_active', true)
      .order('data->funnel->ratings->identified->>rating', { ascending: false })
      .limit(100)

    for (const account of accounts || []) {
      try {
        // Get recent signals for this account
        const { data: accountSignals } = await ctx.db
          .from('items')
          .select('data->classification->>stage as stage, data->action->>action_type as action_type')
          .eq('type_id', TYPE_IDS.funnel_signal)
          .eq('account_id', account.id)
          .eq('is_active', true)
          .gte('created_at', periodStart)

        const signalCounts: Record<string, number> = {}
        for (const signal of accountSignals || []) {
          const stage = signal.stage || 'unknown'
          signalCounts[stage] = (signalCounts[stage] || 0) + 1
        }

        // Check for existing aggregation
        const { data: existingAgg } = await ctx.db
          .from('items')
          .select('id')
          .eq('type_id', TYPE_IDS.funnel_aggregation)
          .eq('data->identity->>aggregation_scope', 'account')
          .eq('data->identity->>account_id', account.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)

        const aggData = {
          identity: {
            account_id: account.id,
            aggregation_scope: 'account'
          },
          metadata: {
            computed_at: now.toISOString(),
            period_start: periodStart,
            period_end: periodEnd,
            ttl_hours: 1
          },
          metrics: {
            signal_counts: signalCounts,
            current_stage: account.funnel?.current_stage,
            temperature: account.funnel?.temperature,
            best_rating: Math.max(
              account.funnel?.ratings?.anonymous?.rating || 0,
              account.funnel?.ratings?.identified?.rating || 0,
              account.funnel?.ratings?.installed?.rating || 0
            )
          }
        }

        if (existingAgg?.[0]) {
          await ctx.db
            .from('items')
            .update({
              data: aggData,
              updated_at: now.toISOString()
            })
            .eq('id', existingAgg[0].id)
        } else {
          await ctx.db
            .from('items')
            .insert({
              type_id: TYPE_IDS.funnel_aggregation,
              title: `Funnel Aggregation: ${account.id.slice(0, 8)}`,
              account_id: account.id,
              data: aggData
            })
        }
      } catch (err) {
        console.error(`[FunnelTimer] Failed to aggregate account ${account.id}:`, err)
      }
    }
  } catch (err) {
    console.error('[FunnelTimer] Failed to create account aggregations:', err)
  }

  const duration = Date.now() - startTime
  console.log(`[FunnelTimer] Aggregation complete: ${duration}ms`)

  return {
    status: 'success',
    task: 'aggregation',
    duration_ms: duration
  }
})

// ============================================
// UTILITY FUNCTIONS
// ============================================

function ratingToTemperature(rating: number): 'cold' | 'warm' | 'hot' {
  if (rating <= 2) return 'cold'
  if (rating <= 3) return 'warm'
  return 'hot'
}
