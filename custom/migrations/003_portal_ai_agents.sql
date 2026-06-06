-- Migration 011: Portal AI Agents and Pipelines
-- Creates AI agents and automated pipelines for the customer portal

-- ============================================
-- 1. Portal AI Agents
-- ============================================

-- Support Ticket AI Agent
INSERT INTO public.ai_agents (
  id,
  account_id,
  name,
  description,
  agent_type,
  model_config,
  system_prompt,
  tools,
  capabilities,
  constraints,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'Support Assistant',
  'AI assistant for handling support ticket triage and initial response',
  'support_triage',
  '{
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.3,
    "max_tokens": 1000,
    "top_p": 0.9,
    "frequency_penalty": 0.1,
    "presence_penalty": 0.1
  }'::jsonb,
  'You are a helpful customer support assistant for the Spine Framework. Your role is to:
1. Analyze support tickets and categorize issues
2. Provide initial helpful responses
3. Escalate complex issues to human agents when needed
4. Suggest relevant documentation or solutions
5. Maintain a professional and empathetic tone

Always prioritize customer satisfaction and provide clear, actionable guidance.',
  '["search_knowledge_base", "create_ticket", "escalate_to_human", "update_ticket_status"]',
  '["text_generation", "analysis", "categorization", "escalation"]',
  '{
    "max_daily_requests": 1000,
    "max_tokens_per_request": 1000,
    "allowed_scopes": ["support:*", "kb:read"],
    "escalation_threshold": 0.7,
    "response_time_limit": 30
  }'::jsonb,
  '{
    "department": "customer_support",
    "tier": "level_1",
    "languages": ["en"],
    "specialization": "technical_support",
    "confidence_threshold": 0.8
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Community Question AI Assistant
INSERT INTO public.ai_agents (
  id,
  account_id,
  name,
  description,
  agent_type,
  model_config,
  system_prompt,
  tools,
  capabilities,
  constraints,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'Community Helper',
  'AI assistant for answering community questions and fostering engagement',
  'community_assistant',
  '{
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.5,
    "max_tokens": 800,
    "top_p": 0.9,
    "frequency_penalty": 0.2,
    "presence_penalty": 0.1
  }'::jsonb,
  'You are a knowledgeable community helper for the Spine Framework. Your role is to:
1. Answer technical questions about Spine Framework
2. Share best practices and code examples
3. Encourage community discussion and collaboration
4. Point to relevant documentation and resources
5. Maintain a friendly, educational tone

Be accurate, helpful, and encourage others to contribute to the discussion.',
  '["search_knowledge_base", "search_code_examples", "suggest_documentation", "format_code"]',
  '["text_generation", "code_generation", "analysis", "education"]',
  '{
    "max_daily_requests": 500,
    "max_tokens_per_request": 800,
    "allowed_scopes": ["community:*", "kb:read", "examples:read"],
    "response_time_limit": 45
  }'::jsonb,
  '{
    "department": "community",
    "tier": "general",
    "languages": ["en"],
    "specialization": "technical_education",
    "confidence_threshold": 0.7
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Knowledge Base Generator
INSERT INTO public.ai_agents (
  id,
  account_id,
  name,
  description,
  agent_type,
  model_config,
  system_prompt,
  tools,
  capabilities,
  constraints,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'KB Content Generator',
  'AI agent for generating knowledge base articles from support interactions',
  'kb_generator',
  '{
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.2,
    "max_tokens": 2000,
    "top_p": 0.8,
    "frequency_penalty": 0.1,
    "presence_penalty": 0.1
  }'::jsonb,
  'You are a technical writer specializing in creating knowledge base articles for the Spine Framework. Your role is to:
1. Analyze resolved support tickets and community discussions
2. Identify common patterns and issues
3. Generate comprehensive, well-structured KB articles
4. Include code examples and step-by-step instructions
5. Ensure accuracy and clarity for technical audiences

Write in a clear, professional style with proper formatting, examples, and troubleshooting steps.',
  '["analyze_tickets", "search_similar_issues", "create_kb_article", "format_documentation"]',
  '["text_generation", "analysis", "summarization", "content_creation"]',
  '{
    "max_daily_requests": 50,
    "max_tokens_per_request": 2000,
    "allowed_scopes": ["kb:*", "support:read", "community:read"],
    "min_resolution_confidence": 0.9,
    "review_required": true
  }'::jsonb,
  '{
    "department": "knowledge_management",
    "tier": "content_creator",
    "languages": ["en"],
    "specialization": "technical_writing",
    "auto_publish": false
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Course Content Assistant
INSERT INTO public.ai_agents (
  id,
  account_id,
  name,
  description,
  agent_type,
  model_config,
  system_prompt,
  tools,
  capabilities,
  constraints,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'Course Assistant',
  'AI assistant for creating and managing educational course content',
  'course_assistant',
  '{
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.4,
    "max_tokens": 1500,
    "top_p": 0.9,
    "frequency_penalty": 0.1,
    "presence_penalty": 0.1
  }'::jsonb,
  'You are an educational content creator for the Spine Framework. Your role is to:
1. Design comprehensive course curricula and lesson plans
2. Create engaging learning materials with practical examples
3. Develop assessments and progress tracking
4. Adapt content to different skill levels
5. Ensure learning objectives are clearly defined and met

Focus on hands-on learning, real-world applications, and progressive skill building.',
  '["create_lesson", "generate_exercises", "assess_progress", "recommend_content"]',
  '["text_generation", "curriculum_design", "assessment_creation", "personalization"]',
  '{
    "max_daily_requests": 100,
    "max_tokens_per_request": 1500,
    "allowed_scopes": ["course:*", "kb:read"],
    "max_lessons_per_day": 5,
    "review_required": true
  }'::jsonb,
  '{
    "department": "education",
    "tier": "instructional_designer",
    "languages": ["en"],
    "specialization": "software_engineering",
    "difficulty_levels": ["beginner", "intermediate", "advanced"]
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- ============================================
-- 2. Portal Pipelines
-- ============================================

-- KB Generation from Resolved Tickets Pipeline
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
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
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
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
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

-- ============================================
-- 3. Portal Triggers
-- ============================================

-- KB Generation Trigger
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
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
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
WHERE p.name = 'KB Generation from Resolved Tickets'
LIMIT 1;
