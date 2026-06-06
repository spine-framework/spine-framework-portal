-- Migration 009: Case Resolution Analysis Schema
-- Replaces ai_postmortem with case_analysis and adds tag/case_analysis item types

-- Step 1: Replace ai_postmortem with case_analysis in support_ticket design schema
UPDATE public.types 
SET design_schema = jsonb_set(
  jsonb_set(design_schema, '{fields,ai_postmortem}', 'null'::jsonb, true),
  '{fields,case_analysis}',
  '{
    "reported_issue": {"type": "text", "label": "Reported Issue (Customer First Post)"},
    "true_problem": {"type": "text", "label": "True Problem Identified"},
    "diagnostic_steps": {"type": "array", "label": "Steps to Diagnose Problem"},
    "solution_steps": {"type": "array", "label": "Steps to Solve (References Tools/KBs Used)"},
    "final_solution": {"type": "text", "label": "Final Solution Summary"},
    "customer_temperature": {"type": "select", "label": "Customer Temperature", "options": ["positive", "neutral", "negative", "frustrated"]},
    "time_to_resolution": {"type": "number", "label": "Time to Resolution (minutes)"},
    "escalation_required": {"type": "boolean", "label": "Was Escalated to Human Agent"},
    "back_and_forth_count": {"type": "number", "label": "Number of Back and Forths"},
    "sentiment_progression": {"type": "array", "label": "Customer Sentiment Progression"},
    "automation_potential": {"type": "select", "label": "Automation Potential", "options": ["high", "medium", "low"]},
    "kb_candidate": {"type": "boolean", "label": "KB Candidate"},
    "analysis_tags": {"type": "array", "label": "Analysis Tags"}
  }'::jsonb,
  true
) - '{fields,ai_postmortem}',
    updated_at = now()
WHERE slug = 'support_ticket';

-- Step 2: Create tag item type
INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'item',
    'tag',
    'Tag',
    'Reusable tags for categorization and analysis across entities',
    'tag',
    '#8B5CF6',
    '{
      "fields": {
        "slug": {"type": "string", "label": "Tag Slug", "required": true, "validation": {"pattern": "^[a-z0-9_-]+$"}},
        "name": {"type": "string", "label": "Tag Name", "required": true},
        "purpose": {"type": "text", "label": "Purpose Description"},
        "applicable_to": {"type": "array", "label": "Applicable To", "required": true, "items": {"type": "string"}, "default": ["ticket"]},
        "category": {"type": "select", "label": "Category", "required": true, "options": ["bug_classification", "knowledge_value", "process_type", "sentiment"]},
        "usage_count": {"type": "number", "label": "Usage Count", "default": 0, "readonly": true}
      }
    }',
    '{}',
    'tenant',
    true
  );

-- Step 3: Create case_analysis item type
INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'item',
    'case_analysis',
    'Case Analysis',
    'AI-generated case resolution analysis and insights',
    'analysis',
    '#10B981',
    '{
      "fields": {
        "ticket_id": {"type": "string", "label": "Original Ticket ID", "required": true},
        "analysis_data": {"type": "json", "label": "Complete Analysis Data", "required": true},
        "confidence_score": {"type": "number", "label": "AI Analysis Confidence", "min": 0, "max": 1},
        "analysis_timestamp": {"type": "timestamp", "label": "Analysis Timestamp", "readonly": true},
        "ai_agent_id": {"type": "string", "label": "AI Agent Used", "readonly": true}
      }
    }',
    '{}',
    'tenant',
    true
  );

-- Step 4: Create link_types for tag relationships
INSERT INTO public.link_types (id, app_id, slug, name, description, icon, color, config, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'tagged_with',
    'Tagged With',
    'Entity tagged with a specific tag',
    'tag',
    '#8B5CF6',
    '{"forward_label": "tagged with", "reverse_label": "applied to"}',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'analyzed_by',
    'Analyzed By',
    'Ticket analyzed by case analysis',
    'analysis',
    '#10B981',
    '{"forward_label": "analyzed by", "reverse_label": "analysis of"}',
    true
  );
