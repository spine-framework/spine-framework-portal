// Portal Signal Handler
// Records portal user actions as funnel signals in the items table.
// Portal users are always identified — no anonymous session handling.
// Standalone: no dependency on cortex functions.

import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { resolveTypeIds, resolveAccountId } from './_shared/resolve-ids'

async function resolveIds() {
  const [types, unidentifiedVisitorsAccountId] = await Promise.all([
    resolveTypeIds([{ kind: 'item', slug: 'funnel_signal' }]),
    resolveAccountId('unidentified-visitors'),
  ])
  return {
    FUNNEL_SIGNAL_TYPE_ID: types['item/funnel_signal'],
    UNIDENTIFIED_VISITORS_ACCOUNT_ID: unidentifiedVisitorsAccountId,
  }
}

function ratingToTemperature(rating: number): 'cold' | 'warm' | 'hot' {
  if (rating <= 2) return 'cold'
  if (rating <= 3) return 'warm'
  return 'hot'
}

function calculateSimpleScore(actionValue: number): { calculated: number; rating: 1 | 2 | 3 | 4 | 5 } {
  const calculated = actionValue
  let rating: 1 | 2 | 3 | 4 | 5
  if (calculated <= 1) rating = 1
  else if (calculated <= 4) rating = 2
  else if (calculated <= 8) rating = 3
  else if (calculated <= 15) rating = 4
  else rating = 5
  return { calculated, rating }
}

export const handler = createHandler(async (ctx, body) => {
  const { action_type, action_value, action_description, session_id } = body || {}

  if (!action_type || ![1, 2, 5].includes(action_value)) {
    const err: any = new Error('action_type and action_value (1, 2, or 5) are required')
    err.statusCode = 400
    throw err
  }

  if (!ctx.accountId) {
    const err: any = new Error('No account context')
    err.statusCode = 401
    throw err
  }

  const ids = await resolveIds()
  const now = new Date().toISOString()
  const scoring = calculateSimpleScore(action_value)
  const resolvedSessionId = session_id || `portal_${ctx.principal.id}_${Date.now()}`

  const signalData = {
    identity: {
      anonymous_id: null,
      person_id: ctx.principal.id,
      account_id: ctx.accountId,
      session_id: resolvedSessionId,
    },
    classification: {
      stage: 'identified',
      source: 'int',
    },
    action: {
      action_type,
      action_value,
      action_description: action_description || null,
    },
    scoring_components: {
      raw_score: {
        calculated: scoring.calculated,
        max_possible: 25,
        rating: scoring.rating,
      },
    },
    processing: {
      received_at: now,
      enriched_at: now,
      scored_at: now,
      stitched_at: null,
      stitched_to_account_id: null,
    },
  }

  const { data, error } = await adminDb
    .from('items')
    .insert({
      type_id: ids.FUNNEL_SIGNAL_TYPE_ID,
      title: `${action_type} - ${action_value}`,
      account_id: ctx.accountId,
      data: signalData,
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to record portal signal: ${error.message}`)
  }

  // Update account funnel data
  const { data: account } = await adminDb
    .from('accounts')
    .select('data')
    .eq('id', ctx.accountId)
    .single()

  if (account) {
    const currentRating = account.data?.ratings?.identified?.rating || 0
    const shouldUpdate = scoring.rating > currentRating

    await adminDb
      .from('accounts')
      .update({
        data: {
          ...account.data,
          ...(shouldUpdate && {
            lead_score: scoring.calculated,
            temperature: ratingToTemperature(scoring.rating),
            lifecycle_stage: 'identified',
            ratings: {
              ...(account.data?.ratings || {}),
              identified: {
                rating: scoring.rating,
                raw_score: scoring.calculated,
                calculated_at: now,
              },
            },
          }),
          last_signal_at: now,
        },
      })
      .eq('id', ctx.accountId)
  }

  return { status: 'ok', signal_id: data.id, rating: scoring.rating }
})
