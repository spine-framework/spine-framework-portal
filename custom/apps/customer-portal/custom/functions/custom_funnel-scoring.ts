// Funnel Scoring Engine
// Pure calculation utilities - NO database access
// All functions are deterministic and testable

// ============================================
// TYPES
// ============================================

export interface EngagementResult {
  type: 1 | 2 | 5
  context: 'first_visit' | 'deep_session' | 'return_visit'
  session_depth: number
  prior_session_count?: number
}

export interface RecencyResult {
  divisor: 1 | 2 | 5 | null
  age_days: number
  window: 'fresh' | 'cooling' | 'stale' | 'expired'
}

export interface RawScoreResult {
  calculated: number
  max_possible: number
  rating: 1 | 2 | 3 | 4 | 5
}

export interface StageConfig {
  max_lookback_days: number
  fresh_days: number
  cooling_days: number
  stale_days: number
  deep_engagement_action_count: number
}

// Stage configurations per plan
const STAGE_CONFIGS: Record<string, StageConfig> = {
  anonymous: {
    max_lookback_days: 90,
    fresh_days: 7,
    cooling_days: 30,
    stale_days: 90,
    deep_engagement_action_count: 4
  },
  identified: {
    max_lookback_days: 120,
    fresh_days: 14,
    cooling_days: 45,
    stale_days: 90,
    deep_engagement_action_count: 3
  },
  installed: {
    max_lookback_days: 90,
    fresh_days: 7,
    cooling_days: 21,
    stale_days: 45,
    deep_engagement_action_count: 3
  }
}

// ============================================
// ENGAGEMENT CALCULATION
// ============================================

export function calculateEngagement(
  priorSignals: Array<{ session_id: string; occurred_at: string }>,
  currentSessionId: string,
  currentOccurredAt: string,
  stage: string
): EngagementResult {
  const config = STAGE_CONFIGS[stage] || STAGE_CONFIGS.anonymous

  // First visit - no prior signals
  if (priorSignals.length === 0) {
    return { type: 1, context: 'first_visit', session_depth: 1 }
  }

  // Check for return visit
  const lastSignal = priorSignals[priorSignals.length - 1]
  const hoursSinceLast = differenceInHours(
    new Date(currentOccurredAt),
    new Date(lastSignal.occurred_at)
  )
  const isNewSession = currentSessionId !== lastSignal.session_id

  if (isNewSession || hoursSinceLast >= 4) {
    const uniqueSessions = new Set(priorSignals.map(s => s.session_id)).size
    return {
      type: 5,
      context: 'return_visit',
      session_depth: 1,
      prior_session_count: uniqueSessions
    }
  }

  // Same session - check depth
  const sameSessionSignals = priorSignals.filter(s =>
    s.session_id === currentSessionId &&
    isSameDay(new Date(s.occurred_at), new Date(currentOccurredAt))
  )

  const sessionDepth = sameSessionSignals.length + 1

  if (sessionDepth >= config.deep_engagement_action_count) {
    return { type: 2, context: 'deep_session', session_depth: sessionDepth }
  }

  return { type: 1, context: 'first_visit', session_depth: sessionDepth }
}

// ============================================
// RECENCY CALCULATION
// ============================================

export function calculateRecency(
  occurredAt: Date,
  now: Date = new Date(),
  stage: string = 'anonymous'
): RecencyResult {
  const config = STAGE_CONFIGS[stage] || STAGE_CONFIGS.anonymous
  const ageDays = differenceInDays(now, occurredAt)

  if (ageDays > config.max_lookback_days) {
    return { divisor: null, age_days: ageDays, window: 'expired' }
  }

  if (ageDays <= config.fresh_days) {
    return { divisor: 1, age_days: ageDays, window: 'fresh' }
  }

  if (ageDays <= config.cooling_days) {
    return { divisor: 2, age_days: ageDays, window: 'cooling' }
  }

  return { divisor: 5, age_days: ageDays, window: 'stale' }
}

// ============================================
// RAW SCORE CALCULATION
// ============================================

export function calculateRawScore(
  actionValue: 1 | 2 | 5,
  engagementType: 1 | 2 | 5,
  recencyDivisor: 1 | 2 | 5
): RawScoreResult {
  const calculated = (actionValue * engagementType) / recencyDivisor

  let rating: 1 | 2 | 3 | 4 | 5
  if (calculated <= 1) rating = 1
  else if (calculated <= 4) rating = 2
  else if (calculated <= 8) rating = 3
  else if (calculated <= 15) rating = 4
  else rating = 5

  return {
    calculated,
    max_possible: 25, // 5 * 5 / 1
    rating
  }
}

// ============================================
// BEST-SIGNAL-WINS CALCULATION
// ============================================

export function findBestSignal<T extends { scoring_components?: { raw_score?: { calculated?: number; rating?: number } } }>(
  signals: T[]
): { signal: T | null; rating: number; raw_score: number } {
  if (signals.length === 0) {
    return { signal: null, rating: 0, raw_score: 0 }
  }

  let bestSignal = signals[0]
  let bestScore = signals[0]?.scoring_components?.raw_score?.calculated || 0

  for (const signal of signals) {
    const score = signal?.scoring_components?.raw_score?.calculated || 0
    if (score > bestScore) {
      bestScore = score
      bestSignal = signal
    }
  }

  return {
    signal: bestSignal,
    rating: bestSignal?.scoring_components?.raw_score?.rating || 0,
    raw_score: bestScore
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function differenceInHours(date1: Date, date2: Date): number {
  const msPerHour = 1000 * 60 * 60
  return Math.abs(date1.getTime() - date2.getTime()) / msPerHour
}

function differenceInDays(date1: Date, date2: Date): number {
  return Math.floor(differenceInHours(date1, date2) / 24)
}

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString()
}

// ============================================
// REFERRER CATEGORIZATION
// ============================================

export function categorizeReferrer(referrerDomain: string): string {
  const social = ['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com']
  const search = ['google.com', 'bing.com', 'duckduckgo.com']

  const domain = referrerDomain.toLowerCase()

  if (social.some(s => domain.includes(s))) return 'social'
  if (search.some(s => domain.includes(s))) return 'search'
  if (!domain || domain === 'direct') return 'direct'

  return 'referral'
}

// ============================================
// OPPORTUNITY TYPE INFERENCE
// ============================================

export function inferOpportunityType(
  signals: Array<{ action?: { action_type: string } }>,
  stage: string,
  rating: number
): { type: string; confidence: 'low' | 'medium' | 'high' } {
  const actionTypes = signals.map(s => s.action?.action_type || '').join(' ')

  // High-value signals indicate specific opportunities
  if (actionTypes.includes('pricing') && rating >= 4) {
    return { type: 'advanced_portal', confidence: 'high' }
  }
  if (actionTypes.includes('health_ping') && actionTypes.includes('production')) {
    return { type: 'managed_services', confidence: 'high' }
  }
  if (actionTypes.includes('support_ticket') && rating >= 3) {
    return { type: 'support_plan', confidence: 'medium' }
  }
  if (stage === 'installed' && rating >= 4) {
    return { type: 'expansion', confidence: 'medium' }
  }

  // Default based on stage
  if (stage === 'anonymous') return { type: 'implementation', confidence: 'low' }
  if (stage === 'identified') return { type: 'advanced_portal', confidence: 'low' }

  return { type: 'advocate', confidence: 'low' }
}
