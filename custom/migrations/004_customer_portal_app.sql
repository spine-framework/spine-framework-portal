-- Migration 012: Customer Portal App
-- Creates the customer portal app entry for the app router system

-- ============================================
-- 1. Customer Portal App
-- ============================================

INSERT INTO public.apps (
  id,
  account_id,
  slug,
  name,
  description,
  route_prefix,
  renderer,
  min_role,
  nav_items,
  metadata,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'customer-portal',
  'Customer Portal',
  'Self-service customer portal for support tickets, community questions, knowledge base, and course content',
  '/portal',
  'custom',
  NULL, -- No minimum role - accessible to authenticated users
  '[
    {
      "type": "nav_item",
      "label": "Interactions",
      "path": "/portal/interactions",
      "icon": "message-square",
      "description": "Support tickets and community questions"
    },
    {
      "type": "nav_item", 
      "label": "Content",
      "path": "/portal/content",
      "icon": "book-open",
      "description": "Knowledge base articles and course lessons"
    },
    {
      "type": "nav_item",
      "label": "Integrity", 
      "path": "/portal/integrity",
      "icon": "shield",
      "description": "System integrity and compliance information"
    },
    {
      "type": "nav_item",
      "label": "Account",
      "path": "/portal/account", 
      "icon": "user",
      "description": "Account settings and profile"
    }
  ]'::jsonb,
  '{
    "version": "1.0.0",
    "features": [
      "support_tickets",
      "community_questions", 
      "knowledge_base",
      "course_content",
      "ai_assistance",
      "pipeline_automation"
    ],
    "ui_framework": "react",
    "responsive": true,
    "accessibility": "wcag_aa"
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- ============================================
-- 2. Portal Item Types
-- ============================================

-- Support Ticket Type
INSERT INTO public.types (
  id,
  account_id,
  slug,
  name,
  description,
  kind,
  schema,
  metadata,
  design_schema,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'support_ticket',
  'Support Ticket',
  'Customer support ticket for technical issues and assistance requests',
  'item',
  '{
    "fields": {
      "context": {
        "type": "select",
        "label": "Context",
        "required": true,
        "options": ["support", "technical", "billing", "general"]
      },
      "title": {
        "type": "text",
        "label": "Title",
        "required": true,
        "validation": {"minLength": 5, "maxLength": 200}
      },
      "description": {
        "type": "textarea",
        "label": "Description",
        "required": true,
        "validation": {"minLength": 10, "maxLength": 2000}
      },
      "priority": {
        "type": "select",
        "label": "Priority",
        "required": true,
        "options": ["low", "medium", "high", "urgent"],
        "default": "medium"
      },
      "ai_confidence": {
        "type": "number",
        "label": "AI Confidence Score",
        "required": false,
        "min": 0,
        "max": 1
      },
      "escalated": {
        "type": "boolean",
        "label": "Escalated to Human",
        "required": false,
        "default": false
      }
    },
    "status_options": ["open", "in_progress", "resolved", "closed"],
    "default_status": "open"
  }'::jsonb,
  '{
    "category": "customer_support",
    "workflow": "support_ticket",
    "ai_enabled": true,
    "escalation_rules": {
      "high_priority": true,
      "low_confidence": 0.7
    }
  }'::jsonb,
  '{"scope": "customer"}'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Community Question Type
INSERT INTO public.types (
  id,
  account_id,
  slug,
  name,
  description,
  kind,
  schema,
  metadata,
  design_schema,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'community_question',
  'Community Question',
  'Community discussion question for peer-to-peer support and knowledge sharing',
  'item',
  '{
    "fields": {
      "context": {
        "type": "select",
        "label": "Context",
        "required": true,
        "options": ["community", "technical", "best_practices", "general"]
      },
      "title": {
        "type": "text",
        "label": "Title",
        "required": true,
        "validation": {"minLength": 10, "maxLength": 200}
      },
      "description": {
        "type": "textarea",
        "label": "Description",
        "required": true,
        "validation": {"minLength": 20, "maxLength": 2000}
      },
      "helpful_count": {
        "type": "number",
        "label": "Helpful Votes",
        "required": false,
        "default": 0,
        "min": 0
      },
      "not_helpful_count": {
        "type": "number",
        "label": "Not Helpful Votes",
        "required": false,
        "default": 0,
        "min": 0
      },
      "answer_count": {
        "type": "number",
        "label": "Answer Count",
        "required": false,
        "default": 0,
        "min": 0
      }
    },
    "status_options": ["open", "answered", "closed"],
    "default_status": "open"
  }'::jsonb,
  '{
    "category": "community",
    "workflow": "discussion",
    "voting_enabled": true,
    "ai_assistance": true
  }'::jsonb,
  '{"scope": "platform"}'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Knowledge Base Article Type
INSERT INTO public.types (
  id,
  account_id,
  slug,
  name,
  description,
  kind,
  schema,
  metadata,
  design_schema,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'kb_article',
  'Knowledge Base Article',
  'Comprehensive documentation article for knowledge base and self-service support',
  'item',
  '{
    "fields": {
      "context": {
        "type": "select",
        "label": "Context",
        "required": true,
        "options": ["kb", "documentation", "tutorial", "faq"]
      },
      "title": {
        "type": "text",
        "label": "Title",
        "required": true,
        "validation": {"minLength": 10, "maxLength": 200}
      },
      "content": {
        "type": "richtext",
        "label": "Content",
        "required": true,
        "validation": {"minLength": 100}
      },
      "tags": {
        "type": "tags",
        "label": "Tags",
        "required": false
      },
      "difficulty": {
        "type": "select",
        "label": "Difficulty Level",
        "required": false,
        "options": ["beginner", "intermediate", "advanced"]
      },
      "estimated_read_time": {
        "type": "number",
        "label": "Estimated Read Time (minutes)",
        "required": false,
        "min": 1,
        "max": 60
      },
      "helpful_count": {
        "type": "number",
        "label": "Helpful Votes",
        "required": false,
        "default": 0,
        "min": 0
      },
      "not_helpful_count": {
        "type": "number",
        "label": "Not Helpful Votes", 
        "required": false,
        "default": 0,
        "min": 0
      },
      "auto_generated": {
        "type": "boolean",
        "label": "Auto Generated",
        "required": false,
        "default": false
      },
      "source_ticket_id": {
        "type": "text",
        "label": "Source Ticket ID",
        "required": false
      },
      "source_question_id": {
        "type": "text",
        "label": "Source Question ID",
        "required": false
      }
    },
    "status_options": ["draft", "review", "published", "archived"],
    "default_status": "draft"
  }'::jsonb,
  '{
    "category": "knowledge_management",
    "workflow": "content_lifecycle",
    "search_enabled": true,
    "voting_enabled": true,
    "auto_generation": true
  }'::jsonb,
  '{"scope": "platform"}'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);

-- Course Lesson Type
INSERT INTO public.types (
  id,
  account_id,
  slug,
  name,
  description,
  kind,
  schema,
  metadata,
  design_schema,
  ownership,
  is_system,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1),
  'course_lesson',
  'Course Lesson',
  'Educational lesson content for structured learning and skill development',
  'item',
  '{
    "fields": {
      "context": {
        "type": "select",
        "label": "Context",
        "required": true,
        "options": ["course", "tutorial", "workshop", "certification"]
      },
      "title": {
        "type": "text",
        "label": "Title",
        "required": true,
        "validation": {"minLength": 10, "maxLength": 200}
      },
      "content": {
        "type": "richtext",
        "label": "Content",
        "required": true,
        "validation": {"minLength": 200}
      },
      "sequence": {
        "type": "number",
        "label": "Lesson Sequence",
        "required": false,
        "min": 1
      },
      "progress_required": {
        "type": "number",
        "label": "Required Progress (%)",
        "required": false,
        "default": 80,
        "min": 0,
        "max": 100
      },
      "estimated_duration": {
        "type": "number",
        "label": "Estimated Duration (minutes)",
        "required": false,
        "min": 5,
        "max": 480
      },
      "difficulty": {
        "type": "select",
        "label": "Difficulty Level",
        "required": false,
        "options": ["beginner", "intermediate", "advanced"]
      },
      "prerequisites": {
        "type": "text",
        "label": "Prerequisites",
        "required": false
      }
    },
    "status_options": ["draft", "published", "archived"],
    "default_status": "draft"
  }'::jsonb,
  '{
    "category": "education",
    "workflow": "course_delivery",
    "progress_tracking": true,
    "certification": false
  }'::jsonb,
  '{"scope": "platform"}'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);
