-- Migration 002: KB Generation Pipeline Configuration
-- Creates automated pipelines for knowledge base content generation

-- KB Generation Pipeline from Support Tickets
INSERT INTO public.pipelines (
  id,
  account_id,
  name,
  description,
  trigger_type,
  config,
  stages,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'mock-account-id',
  'KB Generation from Resolved Tickets',
  'Automatically generates knowledge base articles from resolved support tickets with high confidence scores',
  'event',
  '{
    "event_type": "item.updated",
    "filters": {
      "type_slug": "support_ticket",
      "status": "resolved",
      "min_confidence": 0.8
    },
    "debounce_seconds": 300
  }'::jsonb,
  '[
    {
      "stage_type": "query_items",
      "name": "Fetch Resolved Ticket",
      "config": {
        "table": "items",
        "filters": {
          "type_slug": "support_ticket",
          "status": "resolved"
        },
        "limit": 1
      },
      "continue_on_error": false
    },
    {
      "stage_type": "agent_inference",
      "name": "Generate KB Content",
      "config": {
        "agent_type": "kb_generator",
        "prompt_template": "Create a comprehensive knowledge base article from this resolved support ticket:\n\nTitle: {{item.title}}\nDescription: {{item.data.description}}\nResolution: {{item.data.resolution}}\nConfidence: {{item.data.ai_confidence}}\n\nGenerate a well-structured article with:\n1. Clear problem description\n2. Step-by-step solution\n3. Code examples if applicable\n4. Troubleshooting tips\n5. Related resources",
        "output_schema": {
          "title": "string",
          "content": "string",
          "tags": "array",
          "difficulty": "string",
          "estimated_read_time": "number"
        }
      },
      "continue_on_error": false
    },
    {
      "stage_type": "create_record",
      "name": "Create KB Article",
      "config": {
        "table": "items",
        "data": {
          "type_slug": "kb_article",
          "status": "draft",
          "data": {
            "title": "{{stage_1.output.title}}",
            "content": "{{stage_1.output.content}}",
            "tags": "{{stage_1.output.tags}}",
            "difficulty": "{{stage_1.output.difficulty}}",
            "estimated_read_time": "{{stage_1.output.estimated_read_time}}",
            "source_ticket_id": "{{trigger.item_id}}",
            "auto_generated": true,
            "generated_at": "{{timestamp}}"
          }
        }
      },
      "continue_on_error": false
    },
    {
      "stage_type": "send_notification",
      "name": "Notify Content Team",
      "config": {
        "message": "New KB article generated from resolved ticket: {{stage_2.output.title}}",
        "recipients": ["content-team"],
        "channels": ["email", "slack"]
      },
      "continue_on_error": true
    }
  ]'::jsonb,
  '{
    "category": "content_generation",
    "auto_review_required": true,
    "max_articles_per_day": 10,
    "quality_threshold": 0.8
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Community Question KB Pipeline
INSERT INTO public.pipelines (
  id,
  account_id,
  name,
  description,
  trigger_type,
  config,
  stages,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'mock-account-id',
  'KB Generation from Popular Questions',
  'Generates KB articles from popular community questions with high engagement',
  'cron',
  '{
    "schedule": "0 2 * * 1",
    "timezone": "UTC"
  }'::jsonb,
  '[
    {
      "stage_type": "query_items",
      "name": "Find Popular Questions",
      "config": {
        "table": "items",
        "filters": {
          "type_slug": "community_question",
          "created_at": {
            "operator": ">=",
            "value": "7_days_ago"
          }
        },
        "order": {
          "column": "data.helpful_count",
          "direction": "desc"
        },
        "limit": 5
      },
      "continue_on_error": false
    },
    {
      "stage_type": "agent_inference",
      "name": "Analyze and Generate Content",
      "config": {
        "agent_type": "kb_generator",
        "prompt_template": "Analyze this popular community question and create a knowledge base article:\n\nQuestion: {{item.title}}\nDescription: {{item.data.description}}\nHelpful Votes: {{item.data.helpful_count}}\nCommunity Answers: {{item.data.answer_count}}\n\nCreate an article that:\n1. Answers the question comprehensively\n2. Includes the best community answers\n3. Provides additional context and examples\n4. References related documentation",
        "output_schema": {
          "title": "string",
          "content": "string",
          "tags": "array",
          "related_questions": "array"
        }
      },
      "continue_on_error": false
    },
    {
      "stage_type": "create_record",
      "name": "Create KB Article",
      "config": {
        "table": "items",
        "data": {
          "type_slug": "kb_article",
          "status": "draft",
          "data": {
            "title": "{{stage_1.output.title}}",
            "content": "{{stage_1.output.content}}",
            "tags": "{{stage_1.output.tags}}",
            "source_question_id": "{{item.id}}",
            "helpful_count": "{{item.data.helpful_count}}",
            "auto_generated": true,
            "generated_at": "{{timestamp}}"
          }
        }
      },
      "continue_on_error": false
    }
  ]'::jsonb,
  '{
    "category": "content_generation",
    "auto_review_required": true,
    "min_helpful_votes": 3,
    "max_articles_per_week": 5
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Course Content Update Pipeline
INSERT INTO public.pipelines (
  id,
  account_id,
  name,
  description,
  trigger_type,
  config,
  stages,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'mock-account-id',
  'Course Content Updates',
  'Updates course content based on new KB articles and common issues',
  'event',
  '{
    "event_type": "item.created",
    "filters": {
      "type_slug": "kb_article"
    },
    "debounce_seconds": 600
  }'::jsonb,
  '[
    {
      "stage_type": "query_items",
      "name": "Get Related Course Content",
      "config": {
        "table": "items",
        "filters": {
          "type_slug": "course_lesson",
          "data.tags": {
            "operator": "overlap",
            "value": "{{trigger.item.data.tags}}"
          }
        }
      },
      "continue_on_error": false
    },
    {
      "stage_type": "agent_inference",
      "name": "Analyze Relevance",
      "config": {
        "agent_type": "course_assistant",
        "prompt_template": "Analyze if this new KB article should be referenced in existing course content:\n\nKB Article: {{trigger.item.data.title}}\nContent: {{trigger.item.data.content}}\nTags: {{trigger.item.data.tags}}\n\nRelated Course Lessons: {{stage_0.output}}\n\nDetermine:\n1. Which lessons should reference this article\n2. What additional content should be added\n3. If new lessons should be created",
        "output_schema": {
          "updates_needed": "array",
          "new_lessons": "array",
          "recommendations": "string"
        }
      },
      "continue_on_error": false
    },
    {
      "stage_type": "update_item",
      "name": "Update Course Content",
      "config": {
        "table": "items",
        "updates": {
          "data.related_articles": {
            "operator": "append",
            "value": "{{trigger.item.id}}"
          },
          "data.last_updated": "{{timestamp}}"
        },
        "condition": {
          "id": "{{stage_1.output.updates_needed}}"
        }
      },
      "continue_on_error": true
    }
  ]'::jsonb,
  '{
    "category": "content_maintenance",
    "auto_update": true,
    "review_required": false
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Create triggers for the pipelines
INSERT INTO public.triggers (
  id,
  account_id,
  name,
  description,
  trigger_type,
  event_type,
  config,
  pipeline_id,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) 
SELECT 
  gen_random_uuid(),
  'mock-account-id',
  'KB Generation Trigger',
  'Triggers KB generation when support tickets are resolved',
  'event',
  'item.updated',
  '{
    "filters": {
      "type_slug": "support_ticket",
      "status": "resolved"
    }
  }'::jsonb,
  p.id,
  '{
    "auto_trigger": true,
    "debounce_seconds": 300
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
FROM public.pipelines p 
WHERE p.name = 'KB Generation from Resolved Tickets';

INSERT INTO public.triggers (
  id,
  account_id,
  name,
  description,
  trigger_type,
  event_type,
  config,
  pipeline_id,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) 
SELECT 
  gen_random_uuid(),
  'mock-account-id',
  'Course Update Trigger',
  'Triggers course content updates when KB articles are created',
  'event',
  'item.created',
  '{
    "filters": {
      "type_slug": "kb_article"
    }
  }'::jsonb,
  p.id,
  '{
    "auto_trigger": true,
    "debounce_seconds": 600
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
FROM public.pipelines p 
WHERE p.name = 'Course Content Updates';
