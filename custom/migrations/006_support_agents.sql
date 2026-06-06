-- Migration 006: Support AI Agents
-- AI triage agent for customer support and redaction analyzer for KB generation

-- ============================================
-- AI Triage Agent
-- ============================================

INSERT INTO public.ai_agents (id, account_id, name, agent_type, system_prompt, model_config, tools, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'Support Triage Agent',
  'support_triage',
  'You are a helpful support agent for the Spine framework. Analyze the customer''s question, search the knowledge base, and provide a clear answer. If uncertain, acknowledge what you found and what you need help with. Be concise but thorough.',
  '{"model": "gpt-4o", "temperature": 0.7, "max_tokens": 2000}',
  '["search_knowledge", "query_items"]',
  true,
  now(),
  now()
);

-- Prompt config for triage agent
INSERT INTO public.prompt_configs (id, account_id, name, context_template, confidence_threshold, escalation_action, escalation_target, available_tools, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'Support Triage Config',
  'Context: You are helping a developer using the Spine framework. Search KB articles and similar past cases to answer. Customer question: {{user_message}}',
  0.75,
  'pipeline',
  (SELECT id FROM public.pipelines WHERE slug = 'support_escalation'),
  '["search_knowledge", "query_items"]',
  true,
  now(),
  now()
);

-- Link agent to config
UPDATE public.ai_agents 
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{default_prompt_config_id}', to_jsonb((SELECT id FROM public.prompt_configs WHERE name = 'Support Triage Config')))
WHERE agent_type = 'support_triage';

-- ============================================
-- Redaction Analyzer Agent (separate)
-- ============================================

INSERT INTO public.ai_agents (id, account_id, name, agent_type, system_prompt, model_config, tools, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'KB Redaction Analyzer',
  'redaction_analyzer',
  'You are a privacy and security analyzer. Your job is to review support case resolutions and identify any information that should NOT become public knowledge base content. Mark sensitive information for redaction. Be thorough but not overzealous - general technical concepts should remain, specific customer details should be flagged.',
  '{"model": "gpt-4o", "temperature": 0.3, "max_tokens": 4000}',
  '[]',
  true,
  now(),
  now()
);

INSERT INTO public.prompt_configs (id, account_id, name, context_template, confidence_threshold, escalation_action, escalation_target, available_tools, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'Redaction Analysis Config',
  'Analyze the following support case resolution and identify sensitive information. Use [RED: ...] for highly sensitive content that MUST be redacted (names, emails, API keys, IPs, specific customer configs). Use [YELLOW: ...] for questionable content that needs review (unusual customizations, private beta references). Return the full text with markers.

Case resolution:
{{user_message}}',
  0.9,
  null,
  null,
  '[]',
  true,
  now(),
  now()
);

-- Link redaction agent to its config
UPDATE public.ai_agents 
SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{default_prompt_config_id}', to_jsonb((SELECT id FROM public.prompt_configs WHERE name = 'Redaction Analysis Config')))
WHERE agent_type = 'redaction_analyzer';

-- ============================================
-- Support Escalation Pipeline
-- ============================================

INSERT INTO public.pipelines (id, account_id, slug, name, description, config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'support_escalation',
  'Support Escalation Pipeline',
  'Triggered when AI confidence is below threshold',
  '{"stages": [{"stage": "update_ticket", "config": {"status": "human_assigned"}}, {"stage": "create_queue_entry", "config": {}}, {"stage": "notify_team", "config": {}}]}',
  true,
  now(),
  now()
);

-- ============================================
-- Escalation Actions
-- ============================================

INSERT INTO public.actions (id, account_id, slug, name, handler, config, is_active, created_at, updated_at)
VALUES 
  (gen_random_uuid(), (SELECT id FROM public.accounts WHERE slug = 'spine-system'), 'update_ticket_status', 'Update Ticket Status', 'update_item', '{"entity": "items", "field": "status"}', true, now(), now()),
  (gen_random_uuid(), (SELECT id FROM public.accounts WHERE slug = 'spine-system'), 'create_queue_entry', 'Create Queue Entry', 'create_record', '{"entity": "items", "type_slug": "support_queue"}', true, now(), now()),
  (gen_random_uuid(), (SELECT id FROM public.accounts WHERE slug = 'spine-system'), 'notify_support_team', 'Notify Support Team', 'send_notification', '{"recipients": ["support-team"]}', true, now(), now());

-- ============================================
-- Support Queue Type
-- ============================================

INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'cortex'),
  'item',
  'support_queue',
  'Support Queue Entry',
  'Human-assignable support ticket from AI escalation',
  'inbox',
  '#f59e0b',
  '{
    "fields": {
      "ticket_id": {"type": "string", "label": "Source Ticket"},
      "priority_score": {"type": "number", "label": "Priority Score"},
      "escalation_reason": {"type": "select", "options": ["low_confidence", "thumbs_down", "customer_request"]},
      "assigned_to": {"type": "string", "label": "Assignee"},
      "sla_deadline": {"type": "timestamp", "label": "SLA Deadline"}
    }
  }'::jsonb,
  '{}'::jsonb,
  'tenant',
  true,
  now(),
  now()
);
