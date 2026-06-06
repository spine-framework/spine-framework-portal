-- Migration 013: Funnel Intelligence System
-- Phase 1: Configuration Only
-- INSERT and UPDATE statements only - NO CREATE, ALTER, or DROP

-- ============================================
-- ITEM TYPES (INSERT INTO types table)
-- ============================================

-- 1. funnel_signal type
INSERT INTO public.types (
  id, app_id, kind, slug, name, description, icon, color,
  design_schema, validation_schema, ownership, is_active, created_at, updated_at
) VALUES (
  '0923f7a2-3ccd-4499-986f-28c6fd0597d9',
  NULL,
  'item',
  'funnel_signal',
  'Funnel Signal',
  'Individual prospect/customer activity with engagement scoring',
  'activity',
  '#3b82f6',
  '{
    "identity": {
      "anonymous_id": {"type": "uuid", "nullable": true},
      "person_id": {"type": "uuid", "nullable": true},
      "account_id": {"type": "uuid", "nullable": true},
      "session_id": {"type": "string", "nullable": true}
    },
    "classification": {
      "stage": {"type": "enum", "options": ["anonymous", "identified", "installed"]},
      "source": {"type": "enum", "options": ["mar", "int", "use", "manual"]}
    },
    "action": {
      "action_type": {"type": "string"},
      "action_value": {"type": "integer", "enum": [1, 2, 5]},
      "action_description": {"type": "string", "nullable": true}
    },
    "scoring_components": {
      "engagement": {
        "type": {"type": "integer", "enum": [1, 2, 5]},
        "context": {"type": "enum", "options": ["first_visit", "deep_session", "return_visit"]},
        "session_depth": {"type": "integer"},
        "prior_session_count": {"type": "integer", "nullable": true}
      },
      "recency": {
        "divisor": {"type": "integer", "enum": [1, 2, 5]},
        "age_days": {"type": "float"},
        "window": {"type": "enum", "options": ["fresh", "cooling", "stale", "expired"]}
      },
      "raw_score": {
        "calculated": {"type": "float"},
        "max_possible": {"type": "float", "default": 25},
        "rating": {"type": "integer", "min": 1, "max": 5}
      }
    },
    "attribution": {
      "first_touch_referrer_domain": {"type": "string", "nullable": true},
      "first_touch_referrer_url": {"type": "string", "nullable": true},
      "first_touch_landing_page": {"type": "string", "nullable": true},
      "immediate_referrer": {"type": "string", "nullable": true},
      "utm_source": {"type": "string", "nullable": true},
      "utm_medium": {"type": "string", "nullable": true},
      "utm_campaign": {"type": "string", "nullable": true}
    },
    "processing": {
      "received_at": {"type": "timestamp"},
      "enriched_at": {"type": "timestamp"},
      "scored_at": {"type": "timestamp"},
      "stitched_at": {"type": "timestamp", "nullable": true},
      "stitched_to_account_id": {"type": "uuid", "nullable": true}
    }
  }'::jsonb,
  '{}'::jsonb,
  'system',
  true,
  now(),
  now()
)
ON CONFLICT (app_id, kind, slug) DO NOTHING;

-- 2. anonymous_session type
INSERT INTO public.types (
  id, app_id, kind, slug, name, description, icon, color,
  design_schema, validation_schema, ownership, is_active, created_at, updated_at
) VALUES (
  '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  NULL,
  'item',
  'anonymous_session',
  'Anonymous Session',
  'Pre-identification visitor session with locked first-touch attribution',
  'user',
  '#8b5cf6',
  '{
    "identity": {
      "anonymous_id": {"type": "uuid"}
    },
    "attribution": {
      "first_touch": {
        "referrer_domain": {"type": "string"},
        "referrer_url": {"type": "string"},
        "referrer_category": {"type": "enum", "options": ["social", "search", "direct", "referral", "email", "ad"]},
        "landing_page": {"type": "string"},
        "landing_page_category": {"type": "string", "nullable": true},
        "occurred_at": {"type": "timestamp"},
        "utm_source": {"type": "string", "nullable": true},
        "utm_medium": {"type": "string", "nullable": true},
        "utm_campaign": {"type": "string", "nullable": true}
      },
      "current_referrer": {
        "referrer_domain": {"type": "string", "nullable": true},
        "referrer_url": {"type": "string", "nullable": true},
        "occurred_at": {"type": "timestamp", "nullable": true}
      }
    },
    "scoring": {
      "ratings": {
        "anonymous": {
          "rating": {"type": "integer", "min": 1, "max": 5},
          "raw_score": {"type": "float"},
          "calculated_at": {"type": "timestamp"},
          "best_signal_id": {"type": "uuid", "nullable": true},
          "signal_count": {"type": "integer"}
        }
      },
      "current_stage": {"type": "enum", "options": ["anonymous"], "default": "anonymous"},
      "temperature": {"type": "enum", "options": ["cold", "warm", "hot"]}
    },
    "lifecycle": {
      "created_at": {"type": "timestamp"},
      "last_activity_at": {"type": "timestamp"},
      "stitched_at": {"type": "timestamp", "nullable": true},
      "stitched_to_account_id": {"type": "uuid", "nullable": true},
      "stitched_to_person_id": {"type": "uuid", "nullable": true}
    },
    "retention": {
      "retention_days": {"type": "integer", "default": 90},
      "purge_after": {"type": "timestamp"}
    }
  }'::jsonb,
  '{}'::jsonb,
  'system',
  true,
  now(),
  now()
)
ON CONFLICT (app_id, kind, slug) DO NOTHING;

-- 3. opportunity_queue type
INSERT INTO public.types (
  id, app_id, kind, slug, name, description, icon, color,
  design_schema, validation_schema, ownership, is_active, created_at, updated_at
) VALUES (
  '2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
  NULL,
  'item',
  'opportunity_queue',
  'Opportunity Queue Entry',
  'Manual review queue for high-engagement prospects',
  'star',
  '#f59e0b',
  '{
    "identity": {
      "account_id": {"type": "uuid", "nullable": true},
      "person_id": {"type": "uuid", "nullable": true}
    },
    "trigger": {
      "source_signal_id": {"type": "uuid"},
      "trigger_stage": {"type": "enum", "options": ["anonymous", "identified", "installed"]},
      "trigger_rating": {"type": "integer", "min": 1, "max": 5},
      "trigger_raw_score": {"type": "float"},
      "trigger_reason": {"type": "string"}
    },
    "recommendation": {
      "opportunity_type": {"type": "enum", "options": ["advanced_portal", "implementation", "support_plan", "managed_services", "expansion", "advocate"]},
      "confidence": {"type": "enum", "options": ["low", "medium", "high"]},
      "suggested_priority": {"type": "integer", "min": 1, "max": 5}
    },
    "review": {
      "status": {"type": "enum", "options": ["pending", "accepted", "rejected", "converted"]},
      "reviewed_by": {"type": "uuid", "nullable": true},
      "reviewed_at": {"type": "timestamp", "nullable": true},
      "conversion_opportunity_id": {"type": "uuid", "nullable": true}
    },
    "notes": {
      "reviewer_notes": {"type": "string", "nullable": true},
      "auto_reason": {"type": "string", "nullable": true}
    }
  }'::jsonb,
  '{}'::jsonb,
  'system',
  true,
  now(),
  now()
)
ON CONFLICT (app_id, kind, slug) DO NOTHING;

-- 4. funnel_aggregation type (for dashboard caching)
INSERT INTO public.types (
  id, app_id, kind, slug, name, description, icon, color,
  design_schema, validation_schema, ownership, is_active, created_at, updated_at
) VALUES (
  '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
  NULL,
  'item',
  'funnel_aggregation',
  'Funnel Aggregation',
  'Pre-computed funnel metrics for dashboard performance',
  'bar-chart-2',
  '#10b981',
  '{
    "identity": {
      "account_id": {"type": "uuid", "nullable": true},
      "aggregation_scope": {"type": "enum", "options": ["system", "account"]}
    },
    "metadata": {
      "computed_at": {"type": "timestamp"},
      "period_start": {"type": "timestamp"},
      "period_end": {"type": "timestamp"},
      "ttl_hours": {"type": "integer", "default": 1}
    },
    "metrics": {
      "stage_distribution": {"type": "jsonb"},
      "temperature_distribution": {"type": "jsonb"},
      "signal_volume": {"type": "jsonb"},
      "top_referrers": {"type": "jsonb"},
      "queue_summary": {"type": "jsonb"},
      "conversion_rates": {"type": "jsonb"},
      "avg_time_in_stage": {"type": "jsonb"}
    }
  }'::jsonb,
  '{}'::jsonb,
  'system',
  true,
  now(),
  now()
)
ON CONFLICT (app_id, kind, slug) DO NOTHING;

-- ============================================
-- LINK TYPES (INSERT INTO link_types table)
-- ============================================

INSERT INTO public.link_types (
  id, app_id, slug, name, description, icon, color,
  config, is_active, created_at, updated_at
) VALUES
(
  '4d5e6f7a-8b9c-0d1e-2f3a-4b5c6d7e8f9a',
  NULL,
  'account_signals',
  'Account Signals',
  'Links accounts to their funnel signals',
  'link',
  '#3b82f6',
  '{
    "source_type": "account",
    "target_type": "item",
    "cardinality": "many-to-many"
  }'::jsonb,
  true,
  now(),
  now()
),
(
  '5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b',
  NULL,
  'account_opportunities',
  'Account Opportunities',
  'Links accounts to their opportunity queue entries',
  'link',
  '#f59e0b',
  '{
    "source_type": "account",
    "target_type": "item",
    "cardinality": "many-to-many"
  }'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (app_id, slug) DO NOTHING;

-- ============================================
-- TIMER CONFIGURATIONS (INSERT INTO triggers table)
-- Note: No ON CONFLICT since triggers.name has no unique constraint
-- ============================================

INSERT INTO public.triggers (
  id, name, trigger_type, config, is_active, created_at, updated_at
) VALUES
(
  '8b9c0d1e-2f3a-4b5c-6d7e-8f9a0b1c2d3e',
  'Funnel: Score Decay',
  'cron',
  '{
    "schedule": "59 23 * * *",
    "function": "funnel-timers.scoreDecay",
    "timezone": "UTC",
    "description": "Daily recalculation of account ratings for score decay"
  }'::jsonb,
  true,
  now(),
  now()
),
(
  '9c0d1e2f-3a4b-5c6d-7e8f-9a0b1c2d3e4f',
  'Funnel: Session Cleanup',
  'cron',
  '{
    "schedule": "0 2 * * *",
    "function": "funnel-timers.sessionCleanup",
    "timezone": "UTC",
    "description": "Daily purge of expired anonymous sessions"
  }'::jsonb,
  true,
  now(),
  now()
),
(
  '0d1e2f3a-4b5c-6d7e-8f9a-0b1c2d3e4f5a',
  'Funnel: Aggregation',
  'cron',
  '{
    "schedule": "0 * * * *",
    "function": "funnel-timers.aggregation",
    "timezone": "UTC",
    "description": "Hourly dashboard metric aggregation"
  }'::jsonb,
  true,
  now(),
  now()
);
