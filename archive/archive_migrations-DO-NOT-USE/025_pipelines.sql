-- Pipelines table for Spine v2
-- Workflow automation pipelines

CREATE TABLE v2.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL CHECK (trigger_type IN ('manual', 'event', 'schedule', 'webhook')),
  config jsonb DEFAULT '{}',
  stages jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR trigger_type IN ('manual', 'system')) -- System pipelines don't need app_id
);

-- Indexes
CREATE INDEX idx_pipelines_app_id ON v2.pipelines(app_id);
CREATE INDEX idx_pipelines_trigger_type ON v2.pipelines(trigger_type);
CREATE INDEX idx_pipelines_active ON v2.pipelines(is_active);
CREATE INDEX idx_pipelines_created_by ON v2.pipelines(created_by);
CREATE INDEX idx_pipelines_account ON v2.pipelines(account_id);
CREATE INDEX idx_pipelines_created_at ON v2.pipelines(created_at);

-- GIN indexes for JSONB
CREATE INDEX idx_pipelines_config_gin ON v2.pipelines USING gin(config);
CREATE INDEX idx_pipelines_stages_gin ON v2.pipelines USING gin(stages);

-- Function to get pipelines by trigger type
CREATE OR REPLACE FUNCTION v2.get_pipelines_by_trigger(
  trigger_type text,
  account_id uuid,
  app_id uuid DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  name text,
  description text,
  trigger_type text,
  config jsonb,
  stages jsonb,
  is_active boolean,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.app_id,
    p.name,
    p.description,
    p.trigger_type,
    p.config,
    p.stages,
    p.is_active,
    p.created_by,
    pe.full_name as created_by_name,
    p.created_at,
    p.updated_at
  FROM v2.pipelines p
  LEFT JOIN v2.people pe ON p.created_by = pe.id
  WHERE p.trigger_type = get_pipelines_by_trigger.trigger_type
  AND p.account_id = get_pipelines_by_trigger.account_id
  AND (app_id IS NULL OR p.app_id = get_pipelines_by_trigger.app_id)
  AND (include_inactive OR p.is_active = true)
  ORDER BY p.name;
END;
$$ LANGUAGE plpgsql;

-- Function to create pipeline
CREATE OR REPLACE FUNCTION v2.create_pipeline(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  trigger_type text,
  config jsonb DEFAULT '{}',
  stages jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  pipeline_id uuid;
BEGIN
  -- Validate trigger type
  IF trigger_type NOT IN ('manual', 'event', 'schedule', 'webhook') THEN
    RAISE EXCEPTION 'Invalid trigger type';
  END IF;
  
  -- Validate stages configuration
  IF NOT jsonb_is_array(stages) OR jsonb_array_length(stages) = 0 THEN
    RAISE EXCEPTION 'Pipeline must have at least one stage';
  END IF;
  
  -- Insert pipeline
  INSERT INTO v2.pipelines (
    app_id, name, description, trigger_type,
    config, stages, metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, trigger_type,
    config, stages, metadata, created_by, account_id
  )
  RETURNING id INTO pipeline_id;
  
  RETURN pipeline_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update pipeline
CREATE OR REPLACE FUNCTION v2.update_pipeline(
  pipeline_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  config jsonb DEFAULT NULL,
  stages jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.pipelines
  SET 
    name = COALESCE(update_pipeline.name, name),
    description = COALESCE(update_pipeline.description, description),
    config = COALESCE(update_pipeline.config, config),
    stages = COALESCE(update_pipeline.stages, stages),
    metadata = COALESCE(update_pipeline.metadata, metadata),
    updated_at = now()
  WHERE id = update_pipeline.pipeline_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to activate/deactivate pipeline
CREATE OR REPLACE FUNCTION v2.toggle_pipeline(
  pipeline_id uuid,
  is_active boolean
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.pipelines
  SET 
    is_active = is_active,
    updated_at = now()
  WHERE id = toggle_pipeline.pipeline_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to validate pipeline configuration
CREATE OR REPLACE FUNCTION v2.validate_pipeline(
  pipeline_id uuid
)
RETURNS TABLE (
  is_valid boolean,
  errors text[]
) AS $$
DECLARE
  pipeline_record RECORD;
  stage_record jsonb;
  stage_index integer;
  errors text[] := '{}';
BEGIN
  -- Get pipeline
  SELECT * INTO pipeline_record
  FROM v2.pipelines
  WHERE id = validate_pipeline.pipeline_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['Pipeline not found'];
    RETURN;
  END IF;
  
  -- Validate stages
  IF NOT jsonb_is_array(pipeline_record.stages) THEN
    errors := array_append(errors, 'Stages must be an array');
  ELSIF jsonb_array_length(pipeline_record.stages) = 0 THEN
    errors := array_append(errors, 'Pipeline must have at least one stage');
  ELSE
    -- Check each stage
    FOR stage_index IN 0..jsonb_array_length(pipeline_record.stages)-1 LOOP
      stage_record := pipeline_record.stages->stage_index;
      
      -- Check required fields
      IF NOT (stage_record ? 'name') THEN
        errors := array_append(errors, 'Stage ' || stage_index || ' missing name');
      END IF;
      
      IF NOT (stage_record ? 'type') THEN
        errors := array_append(errors, 'Stage ' || stage_index || ' missing type');
      END IF;
      
      -- Validate stage type
      IF (stage_record ? 'type') AND stage_record->>'type' NOT IN ('action', 'condition', 'delay', 'parallel', 'subpipeline') THEN
        errors := array_append(errors, 'Stage ' || stage_index || ' has invalid type');
      END IF;
    END LOOP;
  END IF;
  
  -- Validate trigger configuration
  IF pipeline_record.trigger_type = 'event' AND NOT (pipeline_record.config ? 'event_type') THEN
    errors := array_append(errors, 'Event trigger missing event_type');
  END IF;
  
  IF pipeline_record.trigger_type = 'schedule' AND NOT (pipeline_record.config ? 'schedule') THEN
    errors := array_append(errors, 'Schedule trigger missing schedule');
  END IF;
  
  IF pipeline_record.trigger_type = 'webhook' AND NOT (pipeline_record.config ? 'webhook_url') THEN
    errors := array_append(errors, 'Webhook trigger missing webhook_url');
  END IF;
  
  RETURN QUERY SELECT (array_length(errors, 1) = 0) as is_valid, errors;
END;
$$ LANGUAGE plpgsql;

-- Function to get pipeline execution history
CREATE OR REPLACE FUNCTION v2.get_pipeline_executions(
  pipeline_id uuid,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  execution_id uuid,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds numeric,
  error_message text,
  input_data jsonb,
  output_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as execution_id,
    e.status,
    e.started_at,
    e.completed_at,
    EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) as duration_seconds,
    e.error_message,
    e.input_data,
    e.output_data
  FROM v2.pipeline_executions e
  WHERE e.pipeline_id = get_pipeline_executions.pipeline_id
  ORDER BY e.started_at DESC
  LIMIT get_pipeline_executions.limit
  OFFSET get_pipeline_executions.offset;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.pipelines IS 'Workflow automation pipelines';
COMMENT ON FUNCTION v2.get_pipelines_by_trigger(text, uuid, uuid, boolean) IS 'Get pipelines by trigger type';
COMMENT ON FUNCTION v2.create_pipeline(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create a new pipeline';
COMMENT ON FUNCTION v2.update_pipeline(uuid, text, text, jsonb, jsonb, jsonb) IS 'Update pipeline configuration';
COMMENT ON FUNCTION v2.toggle_pipeline(uuid, boolean) IS 'Activate or deactivate pipeline';
COMMENT ON FUNCTION v2.validate_pipeline(uuid) IS 'Validate pipeline configuration';
COMMENT ON FUNCTION v2.get_pipeline_executions(uuid, integer, integer) IS 'Get pipeline execution history';
