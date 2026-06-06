-- Seed data and functions for AI layer in Spine v2
-- Default AI configurations and helper functions

-- AI Model Configurations table
CREATE TABLE v2.ai_model_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_name text NOT NULL,
  display_name text NOT NULL,
  model_type text NOT NULL CHECK (model_type IN ('embedding', 'chat', 'completion', 'custom')),
  max_tokens integer DEFAULT 4096,
  temperature numeric DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  top_p numeric DEFAULT 1.0 CHECK (top_p >= 0 AND top_p <= 1),
  frequency_penalty numeric DEFAULT 0.0 CHECK (frequency_penalty >= -2 AND frequency_penalty <= 2),
  presence_penalty numeric DEFAULT 0.0 CHECK (presence_penalty >= -2 AND presence_penalty <= 2),
  capabilities jsonb DEFAULT '[]',
  pricing jsonb DEFAULT '{}',
  is_available boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (provider IS NOT NULL AND model_name IS NOT NULL),
  UNIQUE(provider, model_name)
);

-- Indexes
CREATE INDEX idx_ai_model_configs_provider ON v2.ai_model_configs(provider);
CREATE INDEX idx_ai_model_configs_type ON v2.ai_model_configs(model_type);
CREATE INDEX idx_ai_model_configs_available ON v2.ai_model_configs(is_available);
CREATE INDEX idx_ai_model_configs_default ON v2.ai_model_configs(is_default);

-- GIN indexes for JSONB
CREATE INDEX idx_ai_model_configs_capabilities_gin ON v2.ai_model_configs USING gin(capabilities);
CREATE INDEX idx_ai_model_configs_pricing_gin ON v2.ai_model_configs USING gin(pricing);

-- Insert common AI model configurations
INSERT INTO v2.ai_model_configs (provider, model_name, display_name, model_type, max_tokens, temperature, capabilities, pricing, is_default) VALUES
-- OpenAI models
('openai', 'text-embedding-ada-002', 'OpenAI Embeddings Ada 002', 'embedding', 8191, 0, '["text_embedding"]', '{"input_tokens": 0.0001, "output_tokens": 0}', true),
('openai', 'gpt-3.5-turbo', 'OpenAI GPT-3.5 Turbo', 'chat', 4096, 0.7, '["chat", "function_calling", "json_mode"]', '{"input_tokens": 0.0015, "output_tokens": 0.002}', false),
('openai', 'gpt-4', 'OpenAI GPT-4', 'chat', 8192, 0.7, '["chat", "function_calling", "json_mode", "vision"]', '{"input_tokens": 0.03, "output_tokens": 0.06}', false),
('openai', 'gpt-4-turbo', 'OpenAI GPT-4 Turbo', 'chat', 128000, 0.7, '["chat", "function_calling", "json_mode", "vision"]', '{"input_tokens": 0.01, "output_tokens": 0.03}', true),

-- Anthropic models
('anthropic', 'claude-3-haiku-20240307', 'Claude 3 Haiku', 'chat', 200000, 0.7, '["chat", "function_calling", "vision"]', '{"input_tokens": 0.00025, "output_tokens": 0.00125}', false),
('anthropic', 'claude-3-sonnet-20240229', 'Claude 3 Sonnet', 'chat', 200000, 0.7, '["chat", "function_calling", "vision"]', '{"input_tokens": 0.003, "output_tokens": 0.015}', false),
('anthropic', 'claude-3-opus-20240229', 'Claude 3 Opus', 'chat', 200000, 0.7, '["chat", "function_calling", "vision"]', '{"input_tokens": 0.015, "output_tokens": 0.075}', false),

-- Google models
('google', 'text-embedding-004', 'Google Embeddings 004', 'embedding', 2048, 0, '["text_embedding"]', '{"input_tokens": 0.0001, "output_tokens": 0}', false),
('google', 'gemini-pro', 'Google Gemini Pro', 'chat', 32768, 0.7, '["chat", "function_calling", "vision"]', '{"input_tokens": 0.0005, "output_tokens": 0.0015}', false),

-- Function to get AI model configurations
CREATE OR REPLACE FUNCTION v2.get_ai_model_configs(
  model_type text DEFAULT NULL,
  provider text DEFAULT NULL,
  include_unavailable boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  provider text,
  model_name text,
  display_name text,
  model_type text,
  max_tokens integer,
  temperature numeric,
  capabilities jsonb,
  pricing jsonb,
  is_available boolean,
  is_default boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mc.id,
    mc.provider,
    mc.model_name,
    mc.display_name,
    mc.model_type,
    mc.max_tokens,
    mc.temperature,
    mc.capabilities,
    mc.pricing,
    mc.is_available,
    mc.is_default
  FROM v2.ai_model_configs mc
  WHERE (model_type IS NULL OR mc.model_type = get_ai_model_configs.model_type)
  AND (provider IS NULL OR mc.provider = get_ai_model_configs.provider)
  AND (include_unavailable = true OR mc.is_available = true)
  ORDER BY mc.is_default DESC, mc.display_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get default AI model
CREATE OR REPLACE FUNCTION v2_get_default_ai_model(
  model_type text
)
RETURNS TABLE (
  id uuid,
  provider text,
  model_name text,
  display_name text,
  model_type text,
  max_tokens integer,
  temperature numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mc.id,
    mc.provider,
    mc.model_name,
    mc.display_name,
    mc.model_type,
    mc.max_tokens,
    mc.temperature
  FROM v2.ai_model_configs mc
  WHERE mc.model_type = v2_get_default_ai_model.model_type
  AND mc.is_available = true
  AND mc.is_default = true
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to create AI agent from template
CREATE OR REPLACE FUNCTION v2.create_ai_agent_from_template(
  template_name text,
  app_id uuid DEFAULT NULL,
  name text DEFAULT NULL,
  overrides jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  agent_id uuid;
  template_config jsonb;
  final_config jsonb;
BEGIN
  -- Get template configuration
  CASE template_name
    WHEN 'chat_assistant' THEN
      template_config := jsonb_build_object(
        'agent_type', 'assistant',
        'model_config', jsonb_build_object(
          'provider', 'openai',
          'model', 'gpt-4-turbo',
          'temperature', 0.7,
          'max_tokens', 4096
        ),
        'system_prompt', 'You are a helpful AI assistant. Please provide clear, accurate, and friendly responses to user questions.',
        'tools', jsonb_build_array(
          jsonb_build_object('name', 'search_knowledge', 'description', 'Search knowledge base'),
          jsonb_build_object('name', 'create_item', 'description', 'Create new item'),
          jsonb_build_object('name', 'send_notification', 'description', 'Send notification')
        ),
        'capabilities', jsonb_build_array(
          jsonb_build_object('name', 'chat', 'enabled', true),
          jsonb_build_object('name', 'tool_use', 'enabled', true),
          jsonb_build_object('name', 'knowledge_search', 'enabled', true)
        )
      );
      
    WHEN 'workflow_executor' THEN
      template_config := jsonb_build_object(
        'agent_type', 'workflow',
        'model_config', jsonb_build_object(
          'provider', 'anthropic',
          'model', 'claude-3-sonnet-20240229',
          'temperature', 0.3,
          'max_tokens', 8192
        ),
        'system_prompt', 'You are a workflow execution AI. Execute tasks step by step and provide clear status updates.',
        'tools', jsonb_build_array(
          jsonb_build_object('name', 'execute_pipeline', 'description', 'Execute workflow pipeline'),
          jsonb_build_object('name', 'create_task', 'description', 'Create task'),
          jsonb_build_object('name', 'update_status', 'description', 'Update task status')
        ),
        'capabilities', jsonb_build_array(
          jsonb_build_object('name', 'workflow_execution', 'enabled', true),
          jsonb_build_object('name', 'task_management', 'enabled', true),
          jsonb_build_object('name', 'status_tracking', 'enabled', true)
        )
      );
      
    WHEN 'content_analyzer' THEN
      template_config := jsonb_build_object(
        'agent_type', 'analysis',
        'model_config', jsonb_build_object(
          'provider', 'openai',
          'model', 'gpt-4-turbo',
          'temperature', 0.1,
          'max_tokens', 8192
        ),
        'system_prompt', 'You are a content analysis AI. Analyze content for sentiment, structure, and key insights.',
        'tools', jsonb_build_array(
          jsonb_build_object('name', 'sentiment_analysis', 'description', 'Analyze sentiment'),
          jsonb_build_object('name', 'extract_entities', 'description', 'Extract entities'),
          jsonb_build_object('name', 'summarize', 'description', 'Summarize content')
        ),
        'capabilities', jsonb_build_array(
          jsonb_build_object('name', 'sentiment_analysis', 'enabled', true),
          jsonb_build_object('name', 'entity_extraction', 'enabled', true),
          jsonb_build_object('name', 'summarization', 'enabled', true)
        )
      );
      
    ELSE
      RAISE EXCEPTION 'Unknown template: %', template_name;
  END CASE;
  
  -- Apply overrides
  final_config := template_config || overrides;
  
  -- Create agent
  SELECT v2.create_ai_agent(
    app_id,
    COALESCE(name, template_name),
    NULL, -- description
    final_config->>'agent_type',
    final_config->'model_config',
    final_config->>'system_prompt',
    final_config->>'tools',
    final_config->>'capabilities',
    '{}', -- constraints
    '{}', -- metadata
    created_by,
    account_id
  ) INTO agent_id;
  
  RETURN agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create prompt config from template
CREATE OR REPLACE FUNCTION v2_create_prompt_config_from_template(
  template_name text,
  app_id uuid DEFAULT NULL,
  name text DEFAULT NULL,
  overrides jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  config_id uuid;
  template_config jsonb;
  final_config jsonb;
BEGIN
  -- Get template configuration
  CASE template_name
    WHEN 'chat_system' THEN
      template_config := jsonb_build_object(
        'prompt_type', 'system',
        'category', 'chat',
        'template', 'You are a helpful AI assistant for {app_name}. Please provide clear, accurate, and friendly responses.',
        'variables', jsonb_build_array(
          jsonb_build_object('name', 'app_name', 'type', 'string', 'required', true),
          jsonb_build_object('name', 'user_role', 'type', 'string', 'required', false, 'default_value', 'user')
        ),
        'examples', jsonb_build_array(
          jsonb_build_object('input', jsonb_build_object('app_name', 'HelpDesk'), 'output', 'You are a helpful AI assistant for HelpDesk.'),
          jsonb_build_object('input', jsonb_build_object('app_name', 'CRM'), 'output', 'You are a helpful AI assistant for CRM.')
        )
      );
      
    WHEN 'item_creation' THEN
      template_config := jsonb_build_object(
        'prompt_type', 'user',
        'category', 'items',
        'template', 'Create a new {item_type} with the following details: {item_details}',
        'variables', jsonb_build_array(
          jsonb_build_object('name', 'item_type', 'type', 'string', 'required', true),
          jsonb_build_object('name', 'item_details', 'type', 'object', 'required', true),
          jsonb_build_object('name', 'priority', 'type', 'string', 'required', false, 'default_value', 'medium')
        ),
        'examples', jsonb_build_array(
          jsonb_build_object('input', jsonb_build_object('item_type', 'task', 'item_details', jsonb_build_object('title', 'Review document')), 'output', 'Create a new task with the following details: {"title": "Review document"}')
        )
      );
      
    WHEN 'email_template' THEN
      template_config := jsonb_build_object(
        'prompt_type', 'template',
        'category', 'communication',
        'template', 'Subject: {subject}\n\nDear {recipient_name},\n\n{message_body}\n\nBest regards,\n{sender_name}',
        'variables', jsonb_build_array(
          jsonb_build_object('name', 'subject', 'type', 'string', 'required', true),
          jsonb_build_object('name', 'recipient_name', 'type', 'string', 'required', true),
          jsonb_build_object('name', 'message_body', 'type', 'text', 'required', true),
          jsonb_build_object('name', 'sender_name', 'type', 'string', 'required', false, 'default_value', 'Team')
        )
      );
      
    ELSE
      RAISE EXCEPTION 'Unknown template: %', template_name;
  END CASE;
  
  -- Apply overrides
  final_config := template_config || overrides;
  
  -- Create prompt config
  SELECT v2.create_prompt_config(
    app_id,
    COALESCE(name, template_name),
    NULL, -- description
    final_config->>'prompt_type',
    final_config->>'category',
    final_config->>'template',
    final_config->>'variables',
    '{}', -- model_config
    '{}', -- constraints
    final_config->>'examples',
    false, -- is_default
    '{}', -- metadata
    created_by,
    account_id
  ) INTO config_id;
  
  RETURN config_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create AI orchestrator from template
CREATE OR REPLACE FUNCTION v2_create_ai_orchestrator_from_template(
  template_name text,
  app_id uuid DEFAULT NULL,
  name text DEFAULT NULL,
  overrides jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  orchestrator_id uuid;
  template_config jsonb;
  final_config jsonb;
BEGIN
  -- Get template configuration
  CASE template_name
    WHEN 'message_processor' THEN
      template_config := jsonb_build_object(
        'orchestrator_type', 'message_processor',
        'config', jsonb_build_object(
          'max_processing_time', 30000,
          'retry_attempts', 3
        ),
        'routing_rules', jsonb_build_array(
          jsonb_build_object('condition', 'message_type == "chat"', 'priority', 1),
          jsonb_build_object('condition', 'message_type == "task"', 'priority', 2),
          jsonb_build_object('condition', 'message_type == "analysis"', 'priority', 3)
        ),
        'processing_pipeline', jsonb_build_array(
          jsonb_build_object('step', 'validate_input', 'type', 'validator'),
          jsonb_build_object('step', 'route_to_agent', 'type', 'router'),
          jsonb_build_object('step', 'execute_agent', 'type', 'executor'),
          jsonb_build_object('step', 'format_response', 'type', 'formatter')
        )
      );
      
    WHEN 'workflow_executor' THEN
      template_config := jsonb_build_object(
        'orchestrator_type', 'workflow_executor',
        'config', jsonb_build_object(
          'max_execution_time', 60000,
          'parallel_execution', false
        ),
        'routing_rules', jsonb_build_array(
          jsonb_build_object('condition', 'workflow_type == "approval"', 'priority', 1),
          jsonb_build_object('condition', 'workflow_type == "notification"', 'priority', 2),
          jsonb_build_object('condition', 'workflow_type == "data_sync"', 'priority', 3)
        ),
        'processing_pipeline', jsonb_build_array(
          jsonb_build_object('step', 'validate_workflow', 'type', 'validator'),
          jsonb_build_object('step', 'prepare_context', 'type', 'context_builder'),
          jsonb_build_object('step', 'execute_steps', 'type', 'step_executor'),
          jsonb_build_object('step', 'handle_results', 'type', 'result_handler')
        )
      );
      
    ELSE
      RAISE EXCEPTION 'Unknown template: %', template_name;
  END CASE;
  
  -- Apply overrides
  final_config := template_config || overrides;
  
  -- Create orchestrator
  SELECT v2.create_ai_orchestrator(
    app_id,
    COALESCE(name, template_name),
    NULL, -- description
    final_config->>'orchestrator_type',
    final_config->>'config',
    final_config->>'agent_mappings',
    final_config->>'prompt_mappings',
    final_config->>'routing_rules',
    final_config->>'processing_pipeline',
    '{}', -- metadata
    created_by,
    account_id
  ) INTO orchestrator_id;
  
  RETURN orchestrator_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get AI layer statistics
CREATE OR REPLACE FUNCTION v2_get_ai_layer_statistics(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  component_type text,
  metric_name text,
  value numeric,
  status text,
  details jsonb
) AS $$
BEGIN
  -- Embeddings statistics
  RETURN QUERY SELECT 
    'embeddings' as component_type,
    'total_embeddings' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.embeddings
  WHERE (account_id IS NULL OR account_id = v2_get_ai_layer_statistics.account_id);
  
  -- AI agents statistics
  RETURN QUERY SELECT 
    'ai_agents' as component_type,
    'active_agents' as metric_name,
    COUNT(*) FILTER (WHERE is_active = true)::numeric as value,
    CASE WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN 'healthy' ELSE 'warning' END as status,
    '{}'::jsonb as details
  FROM v2.ai_agents
  WHERE (account_id IS NULL OR account_id = v2_get_ai_layer_statistics.account_id);
  
  -- Prompt configs statistics
  RETURN QUERY SELECT 
    'prompt_configs' as component_type,
    'active_configs' as metric_name,
    COUNT(*) FILTER (WHERE is_active = true)::numeric as value,
    CASE WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN 'healthy' ELSE 'warning' END as status,
    '{}'::jsonb as details
  FROM v2.prompt_configs
  WHERE (account_id IS NULL OR account_id = v2_get_ai_layer_statistics.account_id);
  
  -- Orchestrator statistics
  RETURN QUERY SELECT 
    'orchestrators' as component_type,
    'active_orchestrators' as metric_name,
    COUNT(*) FILTER (WHERE is_active = true)::numeric as value,
    CASE WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN 'healthy' ELSE 'warning' END as status,
    '{}'::jsonb as details
  FROM v2.ai_orchestrator
  WHERE (account_id IS NULL OR account_id = v2_get_ai_layer_statistics.account_id);
  
  -- Recent AI activity
  RETURN QUERY SELECT 
    'activity' as component_type,
    'conversations_24h' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'quiet' END as status,
    '{}'::jsonb as details
  FROM v2.ai_agent_conversations
  WHERE (account_id IS NULL OR account_id = v2_get_ai_layer_statistics.account_id)
  AND created_at >= now() - '24 hours'::interval;
END;
$$ LANGUAGE plpgsql;

-- Function to enable/disable all AI components for account
CREATE OR REPLACE FUNCTION v2_toggle_account_ai_components(
  account_id uuid,
  is_active boolean
)
RETURNS TABLE (
  component_type text,
  disabled_count bigint,
  enabled_count bigint
) AS $$
BEGIN
  -- Update AI agents
  UPDATE v2.ai_agents
  SET is_active = v2_toggle_account_ai_components.is_active
  WHERE account_id = v2_toggle_account_ai_components.account_id;
  
  RETURN QUERY SELECT 
    'ai_agents' as component_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.ai_agents
  WHERE account_id = v2_toggle_account_ai_components.account_id;
  
  -- Update prompt configs
  UPDATE v2.prompt_configs
  SET is_active = v2_toggle_account_ai_components.is_active
  WHERE account_id = v2_toggle_account_ai_components.account_id;
  
  RETURN QUERY SELECT 
    'prompt_configs' as component_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.prompt_configs
  WHERE account_id = v2_toggle_account_ai_components.account_id;
  
  -- Update orchestrators
  UPDATE v2.ai_orchestrator
  SET is_active = v2_toggle_account_ai_components.is_active
  WHERE account_id = v2_toggle_account_ai_components.account_id;
  
  RETURN QUERY SELECT 
    'orchestrators' as component_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.ai_orchestrator
  WHERE account_id = v2_toggle_account_ai_components.account_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.ai_model_configs IS 'AI model configurations and capabilities';
COMMENT ON FUNCTION v2.get_ai_model_configs(text, text, boolean) IS 'Get AI model configurations';
COMMENT ON FUNCTION v2_get_default_ai_model(text) IS 'Get default AI model';
COMMENT ON FUNCTION v2.create_ai_agent_from_template(text, uuid, text, jsonb, uuid, uuid) IS 'Create AI agent from template';
COMMENT ON FUNCTION v2_create_prompt_config_from_template(text, uuid, text, jsonb, uuid, uuid) IS 'Create prompt config from template';
COMMENT ON FUNCTION v2_create_ai_orchestrator_from_template(text, uuid, text, jsonb, uuid, uuid) IS 'Create AI orchestrator from template';
COMMENT ON FUNCTION v2_get_ai_layer_statistics(uuid) IS 'Get AI layer statistics';
COMMENT ON FUNCTION v2_toggle_account_ai_components(uuid, boolean) IS 'Enable/disable all AI components for account';
