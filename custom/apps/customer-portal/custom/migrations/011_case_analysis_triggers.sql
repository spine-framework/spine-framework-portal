-- Migration 011: Case Analysis Triggers and Pipeline
-- Creates trigger and pipeline for automatic case analysis when tickets are resolved

-- Step 1: Create case analysis pipeline
INSERT INTO public.pipelines (id, app_id, name, description, trigger_type, stages, config, ownership, is_system, is_active, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'Case Analysis Pipeline',
    'Automatically analyzes resolved support tickets to extract insights and create tags',
    'event_driven',
    '[
      {
        "name": "analyze_ticket",
        "type": "function",
        "config": {
          "function": "custom_case_analysis",
          "action": "analyze_ticket",
          "timeout": 30000
        }
      }
    ]',
    '{
      "debounce_ms": 5000,
      "retry_count": 3,
      "retry_delay_ms": 1000
    }',
    'tenant',
    false,
    true,
    now(),
    now()
  );

-- Step 2: Create trigger for resolved tickets
INSERT INTO public.triggers (id, app_id, name, description, trigger_type, event_type, config, pipeline_id, ownership, is_system, is_active, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'Case Resolution Analysis',
    'Automatically triggers case analysis when support tickets are resolved',
    'event_driven',
    'item_updated',
    '{
      "entity_type": "item",
      "type_slug": "support_ticket",
      "filters": [
        {"field": "status", "operator": "$eq", "value": "resolved"}
      ],
      "debounce_ms": 5000,
      "retry_count": 3,
      "retry_delay_ms": 1000
    }',
    (SELECT id FROM public.pipelines WHERE name = 'Case Analysis Pipeline'),
    'tenant',
    false,
    true,
    now(),
    now()
  );
