-- AI Agents table for Spine v2
-- AI agent configurations and execution tracking

CREATE TABLE v2.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  agent_type text NOT NULL CHECK (agent_type IN ('chat', 'assistant', 'workflow', 'analysis', 'custom')),
  model_config jsonb NOT NULL DEFAULT '{}',
  system_prompt text,
  tools jsonb DEFAULT '[]',
  capabilities jsonb DEFAULT '[]',
  constraints jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (agent_type IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_ai_agents_app_id ON v2.ai_agents(app_id);
CREATE INDEX idx_ai_agents_type ON v2.ai_agents(agent_type);
CREATE INDEX idx_ai_agents_active ON v2.ai_agents(is_active);
CREATE INDEX idx_ai_agents_created_by ON v2.ai_agents(created_by);
CREATE INDEX idx_ai_agents_account ON v2.ai_agents(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_ai_agents_model_config_gin ON v2.ai_agents USING gin(model_config);
CREATE INDEX idx_ai_agents_tools_gin ON v2.ai_agents USING gin(tools);
CREATE INDEX idx_ai_agents_capabilities_gin ON v2.ai_agents USING gin(capabilities);
CREATE INDEX idx_ai_agents_constraints_gin ON v2.ai_agents USING gin(constraints);

-- AI Agent Conversations table
CREATE TABLE v2.ai_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES v2.ai_agents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  title text,
  context_type text,
  context_id uuid,
  context_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ai_agent_conversations
CREATE INDEX idx_ai_agent_conversations_agent_id ON v2.ai_agent_conversations(agent_id);
CREATE INDEX idx_ai_agent_conversations_user_id ON v2.ai_agent_conversations(user_id);
CREATE INDEX idx_ai_agent_conversations_context ON v2.ai_agent_conversations(context_type, context_id);
CREATE INDEX idx_ai_agent_conversations_status ON v2.ai_agent_conversations(status);
CREATE INDEX idx_ai_agent_conversations_account ON v2.ai_agent_conversations(account_id);

-- AI Agent Messages table
CREATE TABLE v2.ai_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES v2.ai_agent_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  tool_calls jsonb DEFAULT '[]',
  tool_results jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (role IS NOT NULL AND content IS NOT NULL)
);

-- Indexes for ai_agent_messages
CREATE INDEX idx_ai_agent_messages_conversation_id ON v2.ai_agent_messages(conversation_id);
CREATE INDEX idx_ai_agent_messages_role ON v2.ai_agent_messages(role);
CREATE INDEX idx_ai_agent_messages_created_at ON v2.ai_agent_messages(created_at);
CREATE INDEX idx_ai_agent_messages_account ON v2.ai_agent_messages(account_id);

-- Function to create AI agent
CREATE OR REPLACE FUNCTION v2.create_ai_agent(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  agent_type text,
  model_config jsonb DEFAULT '{}',
  system_prompt text DEFAULT NULL,
  tools jsonb DEFAULT '[]',
  capabilities jsonb DEFAULT '[]',
  constraints jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  agent_id uuid;
BEGIN
  -- Validate agent type
  IF agent_type NOT IN ('chat', 'assistant', 'workflow', 'analysis', 'custom') THEN
    RAISE EXCEPTION 'Invalid agent type';
  END IF;
  
  -- Insert agent
  INSERT INTO v2.ai_agents (
    app_id, name, description, agent_type, model_config,
    system_prompt, tools, capabilities, constraints, metadata,
    created_by, account_id
  )
  VALUES (
    app_id, name, description, agent_type, model_config,
    system_prompt, tools, capabilities, constraints, metadata,
    created_by, account_id
  )
  RETURNING id INTO agent_id;
  
  RETURN agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update AI agent
CREATE OR REPLACE FUNCTION v2.update_ai_agent(
  agent_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  model_config jsonb DEFAULT NULL,
  system_prompt text DEFAULT NULL,
  tools jsonb DEFAULT NULL,
  capabilities jsonb DEFAULT NULL,
  constraints jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  is_active boolean DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.ai_agents
  SET 
    name = COALESCE(update_ai_agent.name, name),
    description = COALESCE(update_ai_agent.description, description),
    model_config = COALESCE(update_ai_agent.model_config, model_config),
    system_prompt = COALESCE(update_ai_agent.system_prompt, system_prompt),
    tools = COALESCE(update_ai_agent.tools, tools),
    capabilities = COALESCE(update_ai_agent.capabilities, capabilities),
    constraints = COALESCE(update_ai_agent.constraints, constraints),
    metadata = COALESCE(update_ai_agent.metadata, metadata),
    is_active = COALESCE(update_ai_agent.is_active, is_active),
    updated_at = now()
  WHERE id = update_ai_agent.agent_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to create AI agent conversation
CREATE OR REPLACE FUNCTION v2.create_ai_agent_conversation(
  agent_id uuid,
  user_id uuid DEFAULT NULL,
  title text DEFAULT NULL,
  context_type text DEFAULT NULL,
  context_id uuid DEFAULT NULL,
  context_data jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  conversation_id uuid;
  agent_record RECORD;
BEGIN
  -- Get agent to get account_id
  SELECT * INTO agent_record
  FROM v2.ai_agents
  WHERE id = create_ai_agent_conversation.agent_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;
  
  -- Create conversation
  INSERT INTO v2.ai_agent_conversations (
    agent_id, user_id, title, context_type, context_id,
    context_data, metadata, account_id
  )
  VALUES (
    agent_id, user_id, title, context_type, context_id,
    context_data, metadata, agent_record.account_id
  )
  RETURNING id INTO conversation_id;
  
  RETURN conversation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add message to conversation
CREATE OR REPLACE FUNCTION v2.add_ai_agent_message(
  conversation_id uuid,
  role text,
  content text,
  tool_calls jsonb DEFAULT '[]',
  tool_results jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  message_id uuid;
  conversation_record RECORD;
BEGIN
  -- Get conversation to get account_id
  SELECT * INTO conversation_record
  FROM v2.ai_agent_conversations
  WHERE id = add_ai_agent_message.conversation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;
  
  -- Validate role
  IF role NOT IN ('user', 'assistant', 'system', 'tool') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;
  
  -- Add message
  INSERT INTO v2.ai_agent_messages (
    conversation_id, role, content, tool_calls, tool_results,
    metadata, account_id
  )
  VALUES (
    conversation_id, role, content, tool_calls, tool_results,
    metadata, conversation_record.account_id
  )
  RETURNING id INTO message_id;
  
  -- Update conversation timestamp
  UPDATE v2.ai_agent_conversations
  SET updated_at = now()
  WHERE id = conversation_id;
  
  RETURN message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get conversation messages
CREATE OR REPLACE FUNCTION v2.get_ai_agent_conversation_messages(
  conversation_id uuid,
  limit integer DEFAULT 100,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  role text,
  content text,
  tool_calls jsonb,
  tool_results jsonb,
  created_at timestamptz,
  metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.role,
    m.content,
    m.tool_calls,
    m.tool_results,
    m.created_at,
    m.metadata
  FROM v2.ai_agent_messages m
  WHERE m.conversation_id = get_ai_agent_conversation_messages.conversation_id
  ORDER BY m.created_at ASC
  LIMIT get_ai_agent_conversation_messages.limit
  OFFSET get_ai_agent_conversation_messages.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get AI agent statistics
CREATE OR REPLACE FUNCTION v2.get_ai_agent_statistics(
  account_id uuid DEFAULT NULL,
  agent_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  agent_type text,
  total_conversations bigint,
  active_conversations bigint,
  total_messages bigint,
  avg_messages_per_conversation numeric,
  last_activity_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as agent_id,
    a.name as agent_name,
    a.agent_type,
    COALESCE(conv_stats.total_conversations, 0) as total_conversations,
    COALESCE(conv_stats.active_conversations, 0) as active_conversations,
    COALESCE(msg_stats.total_messages, 0) as total_messages,
    CASE 
      WHEN conv_stats.total_conversations > 0 THEN 
        msg_stats.total_messages::numeric / conv_stats.total_conversations
      ELSE 0
    END as avg_messages_per_conversation,
    GREATEST(conv_stats.last_message_at, msg_stats.last_message_at) as last_activity_at
  FROM v2.ai_agents a
  LEFT JOIN (
    SELECT 
      c.agent_id,
      COUNT(*) as total_conversations,
      COUNT(*) FILTER (WHERE c.status = 'active') as active_conversations,
      MAX(c.updated_at) as last_message_at
    FROM v2.ai_agent_conversations c
    WHERE (date_from IS NULL OR c.created_at >= date_from)
    AND (date_to IS NULL OR c.created_at <= date_to)
    GROUP BY c.agent_id
  ) conv_stats ON a.id = conv_stats.agent_id
  LEFT JOIN (
    SELECT 
      c.agent_id,
      COUNT(m.id) as total_messages,
      MAX(m.created_at) as last_message_at
    FROM v2.ai_agent_conversations c
    JOIN v2.ai_agent_messages m ON c.id = m.conversation_id
    WHERE (date_from IS NULL OR m.created_at >= date_from)
    AND (date_to IS NULL OR m.created_at <= date_to)
    GROUP BY c.agent_id
  ) msg_stats ON a.id = msg_stats.agent_id
  WHERE (account_id IS NULL OR a.account_id = get_ai_agent_statistics.account_id)
  AND (agent_id IS NULL OR a.id = get_ai_agent_statistics.agent_id)
  ORDER BY total_conversations DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to search AI agent conversations
CREATE OR REPLACE FUNCTION v2.search_ai_agent_conversations(
  account_id uuid DEFAULT NULL,
  agent_id uuid DEFAULT NULL,
  user_id uuid DEFAULT NULL,
  search_query text DEFAULT NULL,
  status text DEFAULT NULL,
  limit integer DEFAULT 50
)
RETURNS TABLE (
  conversation_id uuid,
  agent_id uuid,
  agent_name text,
  user_id uuid,
  user_name text,
  title text,
  status text,
  message_count bigint,
  last_message_at timestamptz,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as conversation_id,
    c.agent_id,
    a.name as agent_name,
    c.user_id,
    p.full_name as user_name,
    c.title,
    c.status,
    msg_counts.message_count,
    msg_counts.last_message_at,
    c.created_at
  FROM v2.ai_agent_conversations c
  JOIN v2.ai_agents a ON c.agent_id = a.id
  LEFT JOIN v2.people p ON c.user_id = p.id
  LEFT JOIN (
    SELECT 
      conversation_id,
      COUNT(*) as message_count,
      MAX(created_at) as last_message_at
    FROM v2.ai_agent_messages
    GROUP BY conversation_id
  ) msg_counts ON c.id = msg_counts.conversation_id
  WHERE (account_id IS NULL OR c.account_id = search_ai_agent_conversations.account_id)
  AND (agent_id IS NULL OR c.agent_id = search_ai_agent_conversations.agent_id)
  AND (user_id IS NULL OR c.user_id = search_ai_agent_conversations.user_id)
  AND (status IS NULL OR c.status = search_ai_agent_conversations.status)
  AND (search_query IS NULL OR 
       EXISTS (
         SELECT 1 FROM v2.ai_agent_messages m
         WHERE m.conversation_id = c.id
         AND to_tsvector('english', m.content) @@ plainto_tsquery('english', search_query)
       ))
  ORDER BY msg_counts.last_message_at DESC NULLS LAST
  LIMIT search_ai_agent_conversations.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old conversations
CREATE OR REPLACE FUNCTION v2.cleanup_ai_agent_conversations(
  days_to_keep integer DEFAULT 90,
  status_filter text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  -- Delete messages first
  DELETE FROM v2.ai_agent_messages
  WHERE conversation_id IN (
    SELECT id FROM v2.ai_agent_conversations
    WHERE created_at < cutoff_date
    AND (status_filter IS NULL OR status = status_filter)
  );
  
  -- Then delete conversations
  DELETE FROM v2.ai_agent_conversations
  WHERE created_at < cutoff_date
  AND (status_filter IS NULL OR status = status_filter);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get agent capabilities
CREATE OR REPLACE FUNCTION v2.get_ai_agent_capabilities(
  agent_id uuid
)
RETURNS TABLE (
  capability_name text,
  capability_type text,
  description text,
  is_enabled boolean
) AS $$
DECLARE
  agent_record RECORD;
BEGIN
  -- Get agent
  SELECT * INTO agent_record
  FROM v2.ai_agents
  WHERE id = get_ai_agent_capabilities.agent_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Return capabilities from JSON array
  RETURN QUERY
  SELECT 
    cap.value->>'name' as capability_name,
    cap.value->>'type' as capability_type,
    cap.value->>'description' as description,
    (cap.value->>'enabled')::boolean as is_enabled
  FROM jsonb_array_elements(agent_record.capabilities) cap;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.ai_agents IS 'AI agent configurations and execution tracking';
COMMENT ON TABLE v2.ai_agent_conversations IS 'AI agent conversation sessions';
COMMENT ON TABLE v2.ai_agent_messages IS 'Messages within AI agent conversations';
COMMENT ON FUNCTION v2.create_ai_agent(uuid, text, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create AI agent';
COMMENT ON FUNCTION v2.update_ai_agent(uuid, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb, boolean) IS 'Update AI agent';
COMMENT ON FUNCTION v2.create_ai_agent_conversation(uuid, uuid, text, text, uuid, jsonb, jsonb) IS 'Create AI agent conversation';
COMMENT ON FUNCTION v2.add_ai_agent_message(uuid, text, text, jsonb, jsonb, jsonb) IS 'Add message to conversation';
COMMENT ON FUNCTION v2.get_ai_agent_conversation_messages(uuid, integer, integer) IS 'Get conversation messages';
COMMENT ON FUNCTION v2.get_ai_agent_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get AI agent statistics';
COMMENT ON FUNCTION v2.search_ai_agent_conversations(uuid, uuid, uuid, text, text, integer) IS 'Search AI agent conversations';
COMMENT ON FUNCTION v2.cleanup_ai_agent_conversations(integer, text) IS 'Cleanup old conversations';
COMMENT ON FUNCTION v2.get_ai_agent_capabilities(uuid) IS 'Get agent capabilities';
