-- Migration 001: Portal AI Agents Configuration
-- Creates AI agents for customer portal workflows

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
  'mock-account-id',
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
  'mock-account-id',
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
  'mock-account-id',
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
  'mock-account-id',
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

-- Integrity Checker AI
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
  'mock-account-id',
  'Integrity Validator',
  'AI agent for system integrity validation and compliance checking',
  'integrity_checker',
  '{
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.1,
    "max_tokens": 1200,
    "top_p": 0.8,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0
  }'::jsonb,
  'You are a system integrity and compliance validator for the Spine Framework. Your role is to:
1. Analyze system configurations and deployments
2. Check for security vulnerabilities and compliance issues
3. Validate best practices adherence
4. Generate detailed integrity reports
5. Provide actionable remediation recommendations

Be thorough, precise, and prioritize security and stability. Flag any potential issues with clear severity levels.',
  '["scan_system", "check_compliance", "analyze_logs", "generate_report", "validate_configuration"]',
  '["analysis", "security_scanning", "compliance_checking", "report_generation"]',
  '{
    "max_daily_requests": 25,
    "max_tokens_per_request": 1200,
    "allowed_scopes": ["system:*", "logs:read", "config:read"],
    "severity_levels": ["critical", "high", "medium", "low"],
    "auto_fix_threshold": "medium"
  }'::jsonb,
  '{
    "department": "security_operations",
    "tier": "auditor",
    "languages": ["en"],
    "specialization": "system_security",
    "compliance_standards": ["SOC2", "GDPR", "OWASP"],
    "scan_frequency": "daily"
  }'::jsonb,
  'tenant',
  false,
  true,
  now(),
  now()
);
