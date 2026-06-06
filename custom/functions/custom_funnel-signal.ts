// Funnel Signal Handler
// Processes incoming funnel signals using ONLY Spine APIs (ctx.db)
// NO direct database access
//
// Handler Signature (per integration-routes.ts):
// scriptHandler(sanitizedData, scriptContext, scriptEvent)
// - sanitizedData: request body
// - scriptContext: { integrationId, accountId, slug, principal, requestId, headers }
// - scriptEvent: { httpMethod, headers, body, path, queryStringParameters }

import {
  calculateEngagement,
  calculateRecency,
  calculateRawScore,
  inferOpportunityType,
  categorizeReferrer,
  EngagementResult,
  RecencyResult,
  RawScoreResult
} from './custom_funnel-scoring'
import { adminDb } from './_shared/db'

// ============================================
// TYPE IDS (from migration 013)
// ============================================

const TYPE_IDS = {
  funnel_signal: '0923f7a2-3ccd-4499-986f-28c6fd0597d9',
  anonymous_session: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  opportunity_queue: '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e'
}

const LINK_TYPE_IDS = {
  account_signals: '4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  account_opportunities: '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b'
}

// Anonymous signals use this account as placeholder until identity stitching
const UNIDENTIFIED_VISITORS_ACCOUNT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

// ============================================
// SIGNAL HANDLER (Integration Routes Compatible)
// ============================================

export async function processSignal(
  sanitizedData: any,
  scriptContext: any,
  _scriptEvent: any
) {
  const receivedAt = new Date().toISOString()

  // 1. VALIDATE PAYLOAD
  const signal = validateSignalPayload(sanitizedData)
  if (!signal.valid) {
    return { status: 'error', error: (signal as { valid: false; error: string }).error }
  }

  const payload = signal.data

  // 2. ENRICH (using adminDb Spine APIs)
  const enrichment = await enrichSignal(payload)

  // 3. SCORE
  const scoring = scoreSignal(payload, enrichment)

  // 4. CREATE SIGNAL ITEM (adminDb.from('items').insert())
  const signalItem = await createSignalItem(payload, enrichment, scoring, receivedAt)

  // 5. UPDATE ACCOUNT OR CREATE ANONYMOUS SESSION
  let accountUpdate = null
  let sessionItem = null

  if (payload.account_id) {
    accountUpdate = await updateAccountFunnel(payload.account_id, payload.stage, scoring)

    // Create link between account and signal
    await createAccountSignalLink(payload.account_id, signalItem.id)
  } else if (payload.anonymous_id) {
    sessionItem = await upsertAnonymousSession(payload, enrichment, scoring, signalItem.id)
  }

  // 6. EVALUATE QUEUE (if rating >= 4)
  let queueEntry = null
  if (scoring.rating >= 4) {
    queueEntry = await evaluateQueueEntry(payload, scoring, signalItem.id)
  }

  return {
    status: 'success',
    signal_id: signalItem.id,
    rating: scoring.rating,
    raw_score: scoring.calculated,
    account_updated: !!accountUpdate,
    session_created: !!sessionItem,
    queue_entry: queueEntry
  }
}

// ============================================
// VALIDATION
// ============================================

function validateSignalPayload(body: any): { valid: true; data: SignalPayload } | { valid: false; error: string } {
  if (!body) {
    return { valid: false, error: 'Missing request body' }
  }

  // Check required fields
  if (!body.stage || !['anonymous', 'identified', 'installed'].includes(body.stage)) {
    return { valid: false, error: 'Invalid or missing stage' }
  }

  if (!body.source || !['mar', 'int', 'use', 'manual'].includes(body.source)) {
    return { valid: false, error: 'Invalid or missing source' }
  }

  if (!body.action_type) {
    return { valid: false, error: 'Missing action_type' }
  }

  if (!body.action_value || ![1, 2, 5].includes(body.action_value)) {
    return { valid: false, error: 'Invalid action_value (must be 1, 2, or 5)' }
  }

  // Check identity - must have at least one
  if (!body.anonymous_id && !body.person_id && !body.account_id) {
    return { valid: false, error: 'Must provide anonymous_id, person_id, or account_id' }
  }

  // For 'mar' source, session_id is required
  if (body.source === 'mar' && !body.session_id) {
    return { valid: false, error: 'session_id required for marketing signals' }
  }

  return { valid: true, data: body as SignalPayload }
}

interface SignalPayload {
  anonymous_id?: string
  person_id?: string
  account_id?: string
  session_id?: string
  stage: 'anonymous' | 'identified' | 'installed'
  source: 'mar' | 'int' | 'use' | 'manual'
  action_type: string
  action_value: 1 | 2 | 5
  action_description?: string
  occurred_at?: string
  url?: string
  path?: string
  referrer?: string
  user_agent?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  instance_id?: string
  environment?: 'dev' | 'staging' | 'production'
}

// ============================================
// ENRICHMENT (using adminDb Spine APIs)
// ============================================

async function enrichSignal(payload: SignalPayload): Promise<EnrichmentResult> {
  const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date()

  // Query prior signals for engagement calculation
  let priorSignals: any[] = []

  if (payload.anonymous_id) {
    // Query by anonymous_id using adminDb
    const { data } = await adminDb
      .from('items')
      .select('data->>session_id as session_id, data->processing->>scored_at as occurred_at')
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('data->identity->>anonymous_id', payload.anonymous_id)
      .order('created_at', { ascending: true })
      .limit(100)

    priorSignals = (data as any[]) || []
  } else if (payload.account_id) {
    // Query by account_id using adminDb
    const { data } = await adminDb
      .from('items')
      .select('data->>session_id as session_id, data->processing->>scored_at as occurred_at')
      .eq('type_id', TYPE_IDS.funnel_signal)
      .eq('account_id', payload.account_id)
      .order('created_at', { ascending: true })
      .limit(100)

    priorSignals = (data as any[]) || []
  }

  // Calculate engagement
  const engagement = calculateEngagement(
    priorSignals,
    payload.session_id || 'default',
    occurredAt.toISOString(),
    payload.stage
  )

  // Calculate recency
  const recency = calculateRecency(occurredAt, new Date(), payload.stage)

  // Extract referrer
  const referrerDomain = extractDomain(payload.referrer)
  const referrerCategory = categorizeReferrer(referrerDomain)

  return {
    engagement,
    recency,
    referrer_domain: referrerDomain,
    referrer_category: referrerCategory,
    occurred_at: occurredAt.toISOString()
  }
}

interface EnrichmentResult {
  engagement: EngagementResult
  recency: RecencyResult
  referrer_domain: string
  referrer_category: string
  occurred_at: string
}

// ============================================
// SCORING
// ============================================

function scoreSignal(payload: SignalPayload, enrichment: EnrichmentResult): RawScoreResult {
  if (enrichment.recency.divisor === null) {
    // Expired signal gets minimum score
    return { calculated: 0, max_possible: 25, rating: 1 }
  }

  return calculateRawScore(
    payload.action_value,
    enrichment.engagement.type,
    enrichment.recency.divisor
  )
}

// ============================================
// CREATE SIGNAL ITEM (adminDb.from('items').insert())
// ============================================

async function createSignalItem(
  payload: SignalPayload,
  enrichment: EnrichmentResult,
  scoring: RawScoreResult,
  receivedAt: string
): Promise<{ id: string }> {
  const scoredAt = new Date().toISOString()

  const signalData = {
    identity: {
      anonymous_id: payload.anonymous_id || null,
      person_id: payload.person_id || null,
      account_id: payload.account_id || null,
      session_id: payload.session_id || null
    },
    classification: {
      stage: payload.stage,
      source: payload.source
    },
    action: {
      action_type: payload.action_type,
      action_value: payload.action_value,
      action_description: payload.action_description || null
    },
    scoring_components: {
      engagement: {
        type: enrichment.engagement.type,
        context: enrichment.engagement.context,
        session_depth: enrichment.engagement.session_depth,
        prior_session_count: enrichment.engagement.prior_session_count || 0
      },
      recency: {
        divisor: enrichment.recency.divisor,
        age_days: enrichment.recency.age_days,
        window: enrichment.recency.window
      },
      raw_score: {
        calculated: scoring.calculated,
        max_possible: scoring.max_possible,
        rating: scoring.rating
      }
    },
    attribution: {
      first_touch_referrer_domain: enrichment.referrer_domain,
      immediate_referrer: payload.referrer || null,
      utm_source: payload.utm_source || null,
      utm_medium: payload.utm_medium || null,
      utm_campaign: payload.utm_campaign || null
    },
    processing: {
      received_at: receivedAt,
      enriched_at: scoredAt,
      scored_at: scoredAt,
      stitched_at: null,
      stitched_to_account_id: null
    },
    source_metadata: {
      instance_id: payload.instance_id || null,
      environment: payload.environment || null
    }
  }

  const { data, error } = await adminDb
    .from('items')
    .insert({
      type_id: TYPE_IDS.funnel_signal,
      title: `${payload.action_type} - ${payload.action_value}`,
      account_id: payload.account_id || UNIDENTIFIED_VISITORS_ACCOUNT_ID,
      data: signalData
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create signal: ${error.message}`)
  }

  return { id: data.id }
}

// ============================================
// UPDATE ACCOUNT FUNNEL (adminDb.from('accounts').update())
// ============================================

async function updateAccountFunnel(
  accountId: string,
  stage: string,
  scoring: RawScoreResult
): Promise<boolean> {
  // Get current account data
  const { data: account, error: fetchError } = await adminDb
    .from('accounts')
    .select('data')
    .eq('id', accountId)
    .single()

  if (fetchError || !account) {
    console.error(`[FunnelSignal] Account not found: ${accountId}`)
    return false
  }

  const now = new Date().toISOString()

  // Only update if this is the best signal for this stage
  const currentStageRating = account.data?.ratings?.[stage]?.rating || 0
  const shouldUpdate = scoring.rating > currentStageRating

  if (!shouldUpdate) {
    // Just update last_signal_at
    await adminDb
      .from('accounts')
      .update({
        data: { ...account.data, last_signal_at: now }
      })
      .eq('id', accountId)

    return true
  }

  // Update rating and temperature — write flat to data so UI can read directly
  const temperature = ratingToTemperature(scoring.rating)
  const updatedRatings = {
    ...(account.data?.ratings || {}),
    [stage]: {
      rating: scoring.rating,
      raw_score: scoring.calculated,
      calculated_at: now
    }
  }

  const { error } = await adminDb
    .from('accounts')
    .update({
      data: {
        ...account.data,
        lifecycle_stage: stage,
        lead_score: scoring.calculated,
        temperature,
        last_signal_at: now,
        ratings: updatedRatings,
        attribution: account.data?.attribution || null
      }
    })
    .eq('id', accountId)

  if (error) {
    console.error(`[FunnelSignal] Failed to update account: ${error.message}`)
    return false
  }

  return true
}

// ============================================
// UPSERT ANONYMOUS SESSION (adminDb.from('items').insert() / .update())
// ============================================

async function upsertAnonymousSession(
  payload: SignalPayload,
  enrichment: EnrichmentResult,
  scoring: RawScoreResult,
  signalId: string
): Promise<{ id: string; created: boolean }> {
  const now = new Date().toISOString()

  // Try to find existing session
  const { data: existingSession } = await adminDb
    .from('items')
    .select('id, data')
    .eq('type_id', TYPE_IDS.anonymous_session)
    .eq('data->identity->>anonymous_id', payload.anonymous_id!)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSession) {
    // Update existing session
    const currentData = existingSession.data || {}
    const currentRatings = currentData.scoring?.ratings || {}

    const shouldUpdateRating = !currentRatings.anonymous || scoring.rating > currentRatings.anonymous.rating

    const updatedData = {
      ...currentData,
      attribution: {
        ...currentData.attribution,
        current_referrer: {
          referrer_domain: enrichment.referrer_domain,
          referrer_url: payload.referrer || null,
          occurred_at: now
        }
      },
      scoring: {
        ...currentData.scoring,
        ratings: {
          anonymous: shouldUpdateRating ? {
            rating: scoring.rating,
            raw_score: scoring.calculated,
            calculated_at: now,
            best_signal_id: signalId,
            signal_count: (currentRatings.anonymous?.signal_count || 0) + 1
          } : currentRatings.anonymous
        },
        temperature: shouldUpdateRating ? ratingToTemperature(scoring.rating) : currentData.scoring?.temperature
      },
      lifecycle: {
        ...currentData.lifecycle,
        last_activity_at: now
      }
    }

    await adminDb
      .from('items')
      .update({ data: updatedData, updated_at: now })
      .eq('id', existingSession.id)

    return { id: existingSession.id, created: false }
  }

  // Create new session
  const sessionData = {
    identity: {
      anonymous_id: payload.anonymous_id
    },
    attribution: {
      first_touch: {
        referrer_domain: enrichment.referrer_domain,
        referrer_url: payload.referrer || null,
        referrer_category: enrichment.referrer_category,
        landing_page: payload.url || null,
        landing_page_category: null,
        occurred_at: now,
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null
      },
      current_referrer: {
        referrer_domain: enrichment.referrer_domain,
        referrer_url: payload.referrer || null,
        occurred_at: now
      }
    },
    scoring: {
      ratings: {
        anonymous: {
          rating: scoring.rating,
          raw_score: scoring.calculated,
          calculated_at: now,
          best_signal_id: signalId,
          signal_count: 1
        }
      },
      current_stage: 'anonymous',
      temperature: ratingToTemperature(scoring.rating)
    },
    lifecycle: {
      created_at: now,
      last_activity_at: now,
      stitched_at: null,
      stitched_to_account_id: null,
      stitched_to_person_id: null
    },
    retention: {
      retention_days: 90,
      purge_after: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    }
  }

  const { data, error } = await adminDb
    .from('items')
    .insert({
      type_id: TYPE_IDS.anonymous_session,
      title: `Anonymous: ${payload.anonymous_id!.slice(0, 8)}`,
      account_id: payload.account_id || UNIDENTIFIED_VISITORS_ACCOUNT_ID,
      data: sessionData
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Failed to create anonymous session: ${error.message}`)
  }

  return { id: data.id, created: true }
}

// ============================================
// CREATE ACCOUNT-SIGNAL LINK (adminDb.from('links').insert())
// ============================================

async function createAccountSignalLink(accountId: string, signalId: string): Promise<void> {
  const { error } = await adminDb
    .from('links')
    .insert({
      link_type_id: LINK_TYPE_IDS.account_signals,
      source_type: 'account',
      source_id: accountId,
      target_type: 'item',
      target_id: signalId,
      data: { created_at: new Date().toISOString() }
    })

  if (error) {
    console.error(`[FunnelSignal] Failed to create link: ${error.message}`)
  }
}

// ============================================
// EVALUATE QUEUE ENTRY
// ============================================

async function evaluateQueueEntry(
  payload: SignalPayload,
  scoring: RawScoreResult,
  signalId: string
): Promise<{ id: string } | null> {
  // Infer opportunity type
  const inference = inferOpportunityType([{ action: payload }], payload.stage, scoring.rating)

  const now = new Date().toISOString()

  const queueData = {
    identity: {
      account_id: payload.account_id || null,
      person_id: payload.person_id || null
    },
    trigger: {
      source_signal_id: signalId,
      trigger_stage: payload.stage,
      trigger_rating: scoring.rating,
      trigger_raw_score: scoring.calculated,
      trigger_reason: `High engagement: ${inference.type}`
    },
    recommendation: {
      opportunity_type: inference.type,
      confidence: inference.confidence,
      suggested_priority: Math.min(scoring.rating, 5)
    },
    review: {
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      conversion_opportunity_id: null
    },
    notes: {
      reviewer_notes: null,
      auto_reason: `Auto-generated: ${inference.type} opportunity detected with confidence ${inference.confidence}`
    }
  }

  const { data, error } = await adminDb
    .from('items')
    .insert({
      type_id: TYPE_IDS.opportunity_queue,
      title: `${inference.type} - ${inference.confidence} priority`,
      account_id: payload.account_id || UNIDENTIFIED_VISITORS_ACCOUNT_ID,
      data: queueData
    })
    .select('id')
    .single()

  if (error) {
    console.error(`[FunnelSignal] Failed to create queue entry: ${error.message}`)
    return null
  }

  // If we have an account, update the queue reference and create link
  if (payload.account_id) {
    const { data: acct } = await adminDb
      .from('accounts')
      .select('data')
      .eq('id', payload.account_id)
      .single()

    await adminDb
      .from('accounts')
      .update({
        data: {
          ...(acct?.data || {}),
          queue: { pending_opportunity_id: data.id }
        }
      })
      .eq('id', payload.account_id)

    await adminDb
      .from('links')
      .insert({
        link_type_id: LINK_TYPE_IDS.account_opportunities,
        source_type: 'account',
        source_id: payload.account_id,
        target_type: 'item',
        target_id: data.id
      })
  }

  return { id: data.id }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function extractDomain(url: string | undefined): string {
  if (!url) return 'direct'
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ratingToTemperature(rating: number): 'cold' | 'warm' | 'hot' {
  if (rating <= 2) return 'cold'
  if (rating <= 3) return 'warm'
  return 'hot'
}
