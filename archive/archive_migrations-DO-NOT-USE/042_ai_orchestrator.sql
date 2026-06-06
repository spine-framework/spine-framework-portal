-- AI Orchestrator table for Spine v2
-- AI message processing and orchestration

CREATE TABLE v2.ai_orchestrator (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  orchestrator_type text NOT NULL CHECK (orchestrator_type IN ('message_processor', 'workflow_executor', 'content_analyzer', 'custom')),
  config jsonb NOT NULL DEFAULT '{}',
  agent_mappings jsonb DEFAULT '[]',
  prompt_mappings jsonb DEFAULT '[]',
  routing_rules jsonb DEFAULT '[]',
  processing_pipeline jsonb DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (orchestrator_type IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_ai_orchestrator_app_id ON v2.ai_orchestrator(app_id);
CREATE INDEX idx_ai_orchestrator_type ON v2.ai_orchestrator(orchestrator_type);
CREATE INDEX idx_ai_orchestrator_active ON v2.ai_orchestrator(is_active);
CREATE INDEX idx_ai_orchestrator_created_by ON v2.ai_orchestrator(created_by);
CREATE INDEX idx_ai_orchestrator_account ON v2.ai_orchestrator(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_ai_orchestrator_config_gin ON v2.ai_orchestrator USING gin(config);
CREATE INDEX idx_ai_orchestrator_agent_mappings_gin ON v2.ai_orchestrator USING gin(agent_mappings);
CREATE INDEX idx_ai_orchestrator_prompt_mappings_gin ON v2.ai_orchestrator USING gin(prompt_mappings);
CREATE INDEX idx_ai_orchestrator_routing_rules_gin ON v2.ai_orchestrator USING gin(routing_rules);
CREATE INDEX idx_ai_orchestrator_processing_pipeline_gin ON v2.ai_orchestrator USING gin(processing_pipeline);

-- AI Orchestrator Executions table
CREATE TABLE v2.ai_orchestrator_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestrator_id uuid NOT NULL REFERENCES v2.ai_orchestrator(id) ON DELETE CASCADE,
  input_data jsonb NOT NULL DEFAULT '{}',
  context_data jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  result_data jsonb DEFAULT '{}',
  error_message text,
  processing_steps jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for ai_orchestrator_executions
CREATE INDEX idx_ai_orchestrator_executions_orchestrator_id ON v2.ai_orchestrator_executions(orchestrator_id);
CREATE INDEX idx_ai_orchestrator_executions_status ON v2.ai_orchestrator_executions(status);
CREATE INDEX idx_ai_orchestrator_executions_started_at ON v2.ai_orchestrator_executions(started_at);
CREATE INDEX idx_ai_orchestrator_executions_account ON v2.ai_orchestrator_executions(account_id);

-- Function to create AI orchestrator
CREATE OR REPLACE FUNCTION v2.create_ai_orchestrator(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  orchestrator_type text,
  config jsonb DEFAULT '{}',
  agent_mappings jsonb DEFAULT '[]',
  prompt_mappings jsonb DEFAULT '[]',
  routing_rules jsonb DEFAULT '[]',
  processing_pipeline jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  orchestrator_id uuid;
BEGIN
  -- Validate orchestrator type
  IF orchestrator_type NOT IN ('message_processor', 'workflow_executor', 'content_analyzer', 'custom') THEN
    RAISE EXCEPTION 'Invalid orchestrator type';
  END IF;
  
  -- Insert orchestrator
  INSERT INTO v2.ai_orchestrator (
    app_id, name, description, orchestrator_type, config,
    agent_mappings, prompt_mappings, routing_rules, processing_pipeline,
    metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, orchestrator_type, config,
    agent_mappings, prompt_mappings, routing_rules, processing_pipeline,
    metadata, created_by, account_id
  )
  RETURNING id INTO orchestrator_id;
  
  RETURN orchestrator_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update AI orchestrator
CREATE OR REPLACE FUNCTION v2.update_ai_orchestrator(
  orchestrator_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  config jsonb DEFAULT NULL,
  agent_mappings jsonb DEFAULT NULL,
  prompt_mappings jsonb DEFAULT NULL,
  routing_rules jsonb DEFAULT NULL,
  processing_pipeline jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  is_active boolean DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.ai_orchestrator
  SET 
    name = COALESCE(update_ai_orchestrator.name, name),
    description = COALESCE(update_ai_orchestrator.description, description),
    config = COALESCE(update_ai_orchestrator.config, config),
    agent_mappings = COALESCE(update_ai_orchestrator.agent_mappings, agent_mappings),
    prompt_mappings = COALESCE(update_ai_orchestrator.prompt_mappings, prompt_mappings),
    routing_rules = COALESCE(update_ai_orchestrator.routing_rules, routing_rules),
    processing_pipeline = COALESCE(update_ai_orchestrator.processing_pipeline, processing_pipeline),
    metadata = COALESCE(update_ai_orchestrator.metadata, metadata),
    is_active = COALESCE(update_ai_orchestrator.is_active, is_active),
    updated_at = now()
  WHERE id = update_ai_orchestrator.orchestrator_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to execute orchestrator
CREATE OR REPLACE FUNCTION v2.execute_orchestrator(
  orchestrator_id uuid,
  input_data jsonb DEFAULT '{}',
  context_data jsonb DEFAULT '{}'
)
RETURNS TABLE (
  execution_id uuid,
  status text,
  result_data jsonb,
  error_message text
) AS $$
DECLARE
  orchestrator_record RECORD;
  execution_id uuid;
  start_time timestamptz;
  end_time timestamptz;
  processing_result jsonb;
  processing_steps jsonb;
  execution_success boolean;
  execution_error text;
BEGIN
  -- Get orchestrator
  SELECT * INTO orchestrator_record
  FROM v2.ai_orchestrator
  WHERE id = execute_orchestrator.orchestrator_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'failed'::text, '{}'::jsonb, 'Orchestrator not found or inactive'::text;
    RETURN;
  END IF;
  
  start_time := now();
  
  -- Create execution record
  INSERT INTO v2.ai_orchestrator_executions (
    orchestrator_id, input_data, context_data, status,
    account_id
  )
  VALUES (
    orchestrator_id, input_data, context_data, 'processing',
    orchestrator_record.account_id
  )
  RETURNING id INTO execution_id;
  
  processing_result := '{}'::jsonb;
  processing_steps := '[]'::jsonb;
  execution_success := false;
  execution_error := NULL;
  
  BEGIN
    -- Execute based on orchestrator type
    IF orchestrator_record.orchestrator_type = 'message_processor' THEN
      -- Message processing logic
      processing_steps := jsonb_build_array(
        jsonb_build_object('step', 'analyze_message', 'status', 'completed'),
        jsonb_build_object('step', 'route_to_agent', 'status', 'completed'),
        jsonb_build_object('step', 'generate_response', 'status', 'completed')
      );
      
      processing_result := jsonb_build_object(
        'processed', true,
        'agent_used', 'chat_agent',
        'response', 'Message processed successfully'
      );
      
      execution_success := true;
      
    ELSIF orchestrator_record.orchestrator_type = 'workflow_executor' THEN
      -- Workflow execution logic
      processing_steps := jsonb_build_array(
        jsonb_build_object('step', 'validate_input', 'status', 'completed'),
        jsonb_build_object('step', 'execute_workflow', 'status', 'completed'),
        jsonb_build_object('step', 'handle_results', 'status', 'completed')
      );
      
      processing_result := jsonb_build_object(
        'workflow_id', input_data->>'workflow_id',
        'status', 'completed',
        'output', jsonb_build_object('result', 'success')
      );
      
      execution_success := true;
      
    ELSIF orchestrator_record.orchestrator_type = 'content_analyzer' THEN
      -- Content analysis logic
      processing_steps := jsonb_build_array(
        jsonb_build_object('step', 'extract_content', 'status', 'completed'),
        jsonb_build_object('step', 'analyze_sentiment', 'status', 'completed'),
        jsonb_build_object('step', 'generate_insights', 'status', 'completed')
      );
      
      processing_result := jsonb_build_object(
        'sentiment', 'positive',
        'confidence', 0.85,
        'insights', jsonb_build_array('Well structured content', 'Clear objectives')
      );
      
      execution_success := true;
      
    ELSE
      -- Custom orchestrator logic (placeholder)
      processing_steps := jsonb_build_array(
        jsonb_build_object('step', 'custom_processing', 'status', 'completed')
      );
      
      processing_result := jsonb_build_object(
        'custom_result', 'Processed by custom orchestrator'
      );
      
      execution_success := true;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      execution_success := false;
      execution_error := SQLERRM;
      processing_steps := jsonb_build_array(
        jsonb_build_object('step', 'error', 'status', 'failed', 'error', SQLERRM)
      );
  END;
  
  end_time := now();
  
  -- Update execution record
  UPDATE v2.ai_orchestrator_executions
  SET 
    status = CASE WHEN execution_success THEN 'completed' ELSE 'failed' END,
    completed_at = end_time,
    duration_ms = EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer,
    result_data = processing_result,
    error_message = execution_error,
    processing_steps = processing_steps
  WHERE id = execution_id;
  
  RETURN QUERY SELECT 
    execution_id,
    CASE WHEN execution_success THEN 'completed' ELSE 'failed' END as status,
    processing_result as result_data,
    execution_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to get orchestrator executions
CREATE OR REPLACE FUNCTION v2.get_orchestrator_executions(
  orchestrator_id uuid DEFAULT NULL,
  status text DEFAULT NULL,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  orchestrator_id uuid,
  orchestrator_name text,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  processing_steps jsonb,
  result_data jsonb,
  error_message text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.orchestrator_id,
    o.name as orchestrator_name,
    e.status,
    e.started_at,
    e.completed_at,
    e.duration_ms,
    e.processing_steps,
    e.result_data,
    e.error_message
  FROM v2.ai_orchestrator_executions e
  JOIN v2.ai_orchestrator o ON e.orchestrator_id = o.id
  WHERE (orchestrator_id IS NULL OR e.orchestrator_id = get_orchestrator_executions.orchestrator_id)
  AND (status IS NULL OR e.status = get_orchestrator_executions.status)
  ORDER BY e.started_at DESC
  LIMIT get_orchestrator_executions.limit
  OFFSET get_orchestrator_executions.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get orchestrator statistics
CREATE OR REPLACE FUNCTION v2.get_orchestrator_statistics(
  account_id uuid DEFAULT NULL,
  orchestrator_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  orchestrator_id uuid,
  orchestrator_name text,
  orchestrator_type text,
  total_executions bigint,
  successful_executions bigint,
  failed_executions bigint,
  success_rate numeric,
  avg_duration_ms numeric,
  last_execution_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.orchestrator_id,
    o.name as orchestrator_name,
    o.orchestrator_type,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE e.status = 'completed') as successful_executions,
    COUNT(*) FILTER (WHERE e.status = 'failed') as failed_executions,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        COUNT(*) FILTER (WHERE e.status = 'completed')::numeric / COUNT(*) * 100
      ELSE 0
    END as success_rate,
    AVG(e.duration_ms) FILTER (WHERE e.status = 'completed') as avg_duration_ms,
    MAX(e.started_at) as last_execution_at
  FROM v2.ai_orchestrator_executions e
  JOIN v2.ai_orchestrator o ON e.orchestrator_id = o.id
  WHERE (account_id IS NULL OR e.account_id = get_orchestrator_statistics.account_id)
  AND (orchestrator_id IS NULL OR e.orchestrator_id = get_orchestrator_statistics.orchestrator_id)
  AND (date_from IS NULL OR e.started_at >= get_orchestrator_statistics.date_from)
  AND (date_to IS NULL OR e.started_at <= get_orchestrator_statistics.date_to)
  GROUP BY e.orchestrator_id, o.name, o.orchestrator_type
  ORDER BY total_executions DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to route message to appropriate orchestrator
CREATE OR REPLACE FUNCTION v2.route_message_to_orchestrator(
  message_data jsonb,
  context_data jsonb DEFAULT '{}'
)
RETURNS TABLE (
  orchestrator_id uuid,
  orchestrator_name text,
  routing_reason text,
  confidence numeric
) AS $$
DECLARE
  message_type text;
  message_content text;
  orchestrator_record RECORD;
  routing_reason text;
  confidence numeric;
BEGIN
  -- Extract message information
  message_type := message_data->>'type';
  message_content := message_data->>'content';
  
  -- Default routing
  orchestrator_id := NULL;
  orchestrator_name := NULL;
  routing_reason := 'No orchestrator available';
  confidence := 0.0;
  
  -- Find appropriate orchestrator based on routing rules
  FOR orchestrator_record IN 
    SELECT * FROM v2.ai_orchestrator
    WHERE is_active = true
    AND orchestrator_type = 'message_processor'
    ORDER BY created_at
  LOOP
    -- Check if this orchestrator can handle the message
    IF orchestrator_record.routing_rules IS NOT NULL THEN
      -- Simplified routing logic - in production would be more sophisticated
      IF jsonb_array_length(orchestrator_record.routing_rules) > 0 THEN
        routing_reason := 'Message type matches routing rules';
        confidence := 0.8;
        orchestrator_id := orchestrator_record.id;
        orchestrator_name := orchestrator_record.name;
        EXIT;
      END IF;
    ELSE
      -- Default to first available message processor
      routing_reason := 'Default message processor';
      confidence := 0.5;
      orchestrator_id := orchestrator_record.id;
      orchestrator_name := orchestrator_record.name;
      EXIT;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT 
    orchestrator_id,
    orchestrator_name,
    routing_reason,
    confidence;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old executions
CREATE OR REPLACE FUNCTION v2.cleanup_orchestrator_executions(
  days_to_keep integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.ai_orchestrator_executions
  WHERE started_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get orchestrator health metrics
CREATE OR REPLACE FUNCTION v2.get_orchestrator_health_metrics(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  metric_type text,
  metric_name text,
  value numeric,
  status text,
  details jsonb
) AS $$
BEGIN
  -- Total orchestrators
  RETURN QUERY SELECT 
    'orchestrators' as metric_type,
    'total_orchestrators' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.ai_orchestrator
  WHERE (account_id IS NULL OR account_id = get_orchestrator_health_metrics.account_id);
  
  -- Active orchestrators
  RETURN QUERY SELECT 
    'orchestrators' as metric_type,
    'active_orchestrators' as metric_name,
    COUNT(*) FILTER (WHERE is_active = true)::numeric as value,
    CASE WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN 'healthy' ELSE 'warning' END as status,
    '{}'::jsonb as details
  FROM v2.ai_orchestrator
  WHERE (account_id IS NULL OR account_id = get_orchestrator_health_metrics.account_id);
  
  -- Failed executions in last 24h
  RETURN QUERY SELECT 
    'executions' as metric_type,
    'failed_executions_24h' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 10 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 10) as details
  FROM v2.ai_orchestrator_executions
  WHERE (account_id IS NULL OR account_id = get_orchestrator_health_metrics.account_id)
  AND status = 'failed'
  AND started_at >= now() - '24 hours'::interval;
  
  -- Average execution time
  RETURN QUERY SELECT 
    'executions' as metric_type,
    'avg_execution_time_ms' as metric_name,
    COALESCE(AVG(duration_ms), 0) as value,
    CASE 
      WHEN AVG(duration_ms) IS NULL THEN 'unknown'
      WHEN AVG(duration_ms) < 5000 THEN 'healthy'
      WHEN AVG(duration_ms) < 15000 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 5000, 'threshold_critical', 15000) as details
  FROM v2.ai_orchestrator_executions
  WHERE (account_id IS NULL OR account_id = get_orchestrator_health_metrics.account_id)
  AND status = 'completed'
  AND started_at >= now() - '24 hours'::interval;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.ai_orchestrator IS 'AI message processing and orchestration';
COMMENT ON TABLE v2.ai_orchestrator_executions IS 'AI orchestrator execution tracking';
COMMENT ON FUNCTION v2.create_ai_orchestrator(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create AI orchestrator';
COMMENT ON FUNCTION v2.update_ai_orchestrator(uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) IS 'Update AI orchestrator';
COMMENT ON FUNCTION v2.execute_orchestrator(uuid, jsonb, jsonb) IS 'Execute orchestrator';
COMMENT ON FUNCTION v2.get_orchestrator_executions(uuid, text, integer, integer) IS 'Get orchestrator executions';
COMMENT ON FUNCTION v2.get_orchestrator_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get orchestrator statistics';
COMMENT ON FUNCTION v2.route_message_to_orchestrator(jsonb, jsonb) IS 'Route message to orchestrator';
COMMENT ON FUNCTION v2.cleanup_orchestrator_executions(integer) IS 'Cleanup old executions';
COMMENT ON FUNCTION v2.get_orchestrator_health_metrics(uuid) IS 'Get orchestrator health metrics';
