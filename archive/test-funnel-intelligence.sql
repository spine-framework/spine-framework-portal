-- Test Script: Funnel Intelligence System v2
-- Tests the new funnel intelligence system with Spine architecture

-- ============================================
-- TEST 1: Create Anonymous Session
-- ============================================
-- Note: Items require account_id (tenant-scoped in Spine)
-- Using Spine System account for pre-identification sessions

-- Test anonymous visitor from LinkedIn
INSERT INTO public.items (
  type_id,
  account_id,
  title,
  data,
  is_active,
  created_at,
  updated_at
) VALUES (
  '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', -- anonymous_session type
  '12acec9b-8451-40e7-80d5-e80c4e2fc0de', -- Spine System account
  '{
    "identity": {"anonymous_id": "test-anon-001"},
    "attribution": {
      "first_touch": {
        "referrer_domain": "linkedin.com",
        "referrer_url": "https://linkedin.com/posts/agentic-workflows",
        "referrer_category": "social",
        "landing_page": "/blog/agentic-workflows",
        "occurred_at": "2026-05-18T10:00:00Z"
      },
      "current_referrer": {
        "referrer_domain": "linkedin.com",
        "referrer_url": "https://linkedin.com/posts/agentic-workflows",
        "occurred_at": "2026-05-18T10:00:00Z"
      }
    },
    "scoring": {
      "ratings": {"anonymous": {"rating": 0, "raw_score": 0, "calculated_at": "2026-05-18T10:00:00Z", "signal_count": 0}},
      "current_stage": "anonymous",
      "temperature": "cold"
    },
    "lifecycle": {
      "created_at": "2026-05-18T10:00:00Z",
      "last_activity_at": "2026-05-18T10:00:00Z"
    },
    "retention": {
      "retention_days": 90,
      "purge_after": "2026-08-16T10:00:00Z"
    }
  }'::jsonb,
  true,
  now(),
  now()
);

-- ============================================
-- TEST 2: Create Funnel Signals
-- ============================================

-- Signal 1: First page view (light action, first visit)
INSERT INTO public.items (
  type_id,
  account_id,
  title,
  data,
  is_active,
  created_at,
  updated_at
) VALUES (
  '0923f7a2-3ccd-4499-986f-28c6fd0597d9', -- funnel_signal type
  '12acec9b-8451-40e7-80d5-e80c4e2fc0de', -- Spine System account
  '{
    "identity": {"anonymous_id": "test-anon-001", "session_id": "session-001"},
    "classification": {"stage": "anonymous", "source": "mar"},
    "action": {"action_type": "page_view", "action_value": 1, "action_description": "Visited blog post"},
    "scoring_components": {
      "engagement": {"type": 1, "context": "first_visit", "session_depth": 1, "prior_session_count": 0},
      "recency": {"divisor": 1, "age_days": 0, "window": "fresh"},
      "raw_score": {"calculated": 1.0, "max_possible": 25, "rating": 1}
    },
    "attribution": {"first_touch_referrer_domain": "linkedin.com"},
    "processing": {
      "received_at": "2026-05-18T10:00:00Z",
      "enriched_at": "2026-05-18T10:00:01Z",
      "scored_at": "2026-05-18T10:00:01Z"
    }
  }'::jsonb,
  true,
  now(),
  now()
);

-- Signal 2: Pricing page view (high-value action, deep session)
INSERT INTO public.items (
  type_id,
  account_id,
  title,
  data,
  is_active,
  created_at,
  updated_at
) VALUES (
  '0923f7a2-3ccd-4499-986f-28c6fd0597d9',
  '12acec9b-8451-40e7-80d5-e80c4e2fc0de', -- Spine System account
  'pricing_view - 5',
  '{
    "identity": {"anonymous_id": "test-anon-001", "session_id": "session-001"},
    "classification": {"stage": "anonymous", "source": "mar"},
    "action": {"action_type": "pricing_view", "action_value": 5, "action_description": "Viewed pricing page"},
    "scoring_components": {
      "engagement": {"type": 2, "context": "deep_session", "session_depth": 4, "prior_session_count": 0},
      "recency": {"divisor": 1, "age_days": 0, "window": "fresh"},
      "raw_score": {"calculated": 10.0, "max_possible": 25, "rating": 4}
    },
    "attribution": {"first_touch_referrer_domain": "linkedin.com"},
    "processing": {
      "received_at": "2026-05-18T10:05:00Z",
      "enriched_at": "2026-05-18T10:05:01Z",
      "scored_at": "2026-05-18T10:05:01Z"
    }
  }'::jsonb,
  true,
  now(),
  now()
);

-- ============================================
-- TEST 3: Create Opportunity Queue Entry
-- ============================================

-- Queue entry from high-value signal
INSERT INTO public.items (
  type_id,
  account_id,
  title,
  data,
  is_active,
  created_at,
  updated_at
) VALUES (
  '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e', -- opportunity_queue type
  '12acec9b-8451-40e7-80d5-e80c4e2fc0de', -- Spine System account
  'advanced_portal - high priority',
  '{
    "identity": {"account_id": "12acec9b-8451-40e7-80d5-e80c4e2fc0de", "person_id": null},
    "trigger": {
      "source_signal_id": "00000000-0000-0000-0000-000000000001",
      "trigger_stage": "anonymous",
      "trigger_rating": 4,
      "trigger_raw_score": 10.0,
      "trigger_reason": "High engagement: pricing page view"
    },
    "recommendation": {
      "opportunity_type": "advanced_portal",
      "confidence": "high",
      "suggested_priority": 4
    },
    "review": {
      "status": "pending",
      "reviewed_by": null,
      "reviewed_at": null,
      "conversion_opportunity_id": null
    },
    "notes": {
      "reviewer_notes": null,
      "auto_reason": "Auto-generated: advanced_portal opportunity detected with confidence high"
    }
  }'::jsonb,
  true,
  now(),
  now()
);

-- ============================================
-- TEST 4: Create Funnel Aggregation (System)
-- ============================================
-- System aggregation
INSERT INTO public.items (
  type_id,
  account_id,
  title,
  data,
  is_active,
  created_at,
  updated_at
) VALUES (
  '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
  '12acec9b-8451-40e7-80d5-e80c4e2fc0de', -- Spine System account
  'System Funnel Aggregation',
  '{
    "identity": {"account_id": "12acec9b-8451-40e7-80d5-e80c4e2fc0de", "aggregation_scope": "system"},
    "metadata": {
      "computed_at": "2026-05-18T12:00:00Z",
      "period_start": "2026-05-11T12:00:00Z",
      "period_end": "2026-05-18T12:00:00Z",
      "ttl_hours": 1
    },
    "metrics": {
      "stage_distribution": {"anonymous": 150, "identified": 45, "installed": 12},
      "temperature_distribution": {"cold": 120, "warm": 65, "hot": 22},
      "signal_volume": {"mar": 850, "int": 120, "use": 340},
      "queue_summary": {"pending": 18, "accepted": 5, "rejected": 3},
      "total_accounts": 207
    }
  }'::jsonb,
  true,
  now(),
  now()
);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Count items by type
SELECT 
  t.name as type_name,
  COUNT(i.id) as item_count
FROM public.items i
JOIN public.types t ON i.type_id = t.id
WHERE t.slug IN ('funnel_signal', 'anonymous_session', 'opportunity_queue', 'funnel_aggregation')
GROUP BY t.name;

-- Verify anonymous session data
SELECT 
  i.id,
  i.data->'identity'->>'anonymous_id' as anonymous_id,
  i.data->'attribution'->'first_touch'->>'referrer_domain' as referrer,
  i.data->'scoring'->'ratings'->'anonymous'->>'rating' as rating
FROM public.items i
WHERE i.type_id = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

-- Verify funnel signals
SELECT 
  i.id,
  i.data->'action'->>'action_type' as action,
  i.data->'scoring_components'->'raw_score'->>'rating' as rating,
  i.data->'scoring_components'->'raw_score'->>'calculated' as score
FROM public.items i
WHERE i.type_id = '0923f7a2-3ccd-4499-986f-28c6fd0597d9';
