-- Pipeline Executions table for Spine v2
-- Tracks pipeline execution runs

CREATE TABLE v2.pipeline_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES v2.pipelines(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  input_data jsonb DEFAULT '{}',
  output_data jsonb DEFAULT '{}',
  context jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  triggered_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (completed_at IS NULL OR status IN ('completed', 'failed', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_pipeline_executions_pipeline ON v2.pipeline_executions(pipeline_id);
CREATE INDEX idx_pipeline_executions_status ON v2.pipeline_executions(status);
CREATE INDEX idx_pipeline_executions_started ON v2.pipeline_executions(started_at);
CREATE INDEX idx_pipeline_executions_completed ON v2.pipeline_executions(completed_at);
CREATE INDEX idx_pipeline_executions_triggered_by ON v2.pipeline_executions(triggered_by);
CREATE INDEX idx_pipeline_executions_account ON v2.pipeline_executions(account_id);

-- Composite indexes
CREATE INDEX idx_pipeline_executions_pipeline_status ON v2.pipeline_executions(pipeline_id, status);
CREATE INDEX idx_pipeline_executions_account_recent ON v2.pipeline_executions(account_id, started_at DESC);

-- Function to create pipeline execution
CREATE OR REPLACE FUNCTION v2.create_pipeline_execution(
  pipeline_id uuid,
  input_data jsonb DEFAULT '{}',
  context jsonb DEFAULT '{}',
  triggered_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  execution_id uuid;
BEGIN
  -- Check if pipeline exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM v2.pipelines
    WHERE id = create_pipeline_execution.pipeline_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Pipeline not found or inactive';
  END IF;
  
  -- Create execution record
  INSERT INTO v2.pipeline_executions (
    pipeline_id, status, input_data, context,
    triggered_by, account_id
  )
  VALUES (
    pipeline_id, 'pending', input_data, context,
    triggered_by, account_id
  )
  RETURNING id INTO execution_id;
  
  RETURN execution_id;
END;
$$ LANGUAGE plpgsql;

-- Function to start pipeline execution
CREATE OR REPLACE FUNCTION v2.start_pipeline_execution(
  execution_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.pipeline_executions
  SET 
    status = 'running',
    started_at = now()
  WHERE id = start_pipeline_execution.execution_id
  AND status = 'pending';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to complete pipeline execution
CREATE OR REPLACE FUNCTION v2.complete_pipeline_execution(
  execution_id uuid,
  output_data jsonb DEFAULT '{}',
  error_message text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  new_status text;
BEGIN
  -- Determine status based on error message
  new_status := CASE 
    WHEN error_message IS NOT NULL THEN 'failed'
    ELSE 'completed'
  END;
  
  UPDATE v2.pipeline_executions
  SET 
    status = new_status,
    completed_at = now(),
    output_data = complete_pipeline_execution.output_data,
    error_message = error_message
  WHERE id = complete_pipeline_execution.execution_id
  AND status IN ('pending', 'running');
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel pipeline execution
CREATE OR REPLACE FUNCTION v2.cancel_pipeline_execution(
  execution_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.pipeline_executions
  SET 
    status = 'cancelled',
    completed_at = now()
  WHERE id = cancel_pipeline_execution.execution_id
  AND status IN ('pending', 'running');
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get execution details
CREATE OR REPLACE FUNCTION v2.get_pipeline_execution(
  execution_id uuid
)
RETURNS TABLE (
  id uuid,
  pipeline_id uuid,
  pipeline_name text,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds numeric,
  error_message text,
  input_data jsonb,
  output_data jsonb,
  context jsonb,
  triggered_by uuid,
  triggered_by_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.pipeline_id,
    p.name as pipeline_name,
    e.status,
    e.started_at,
    e.completed_at,
    EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) as duration_seconds,
    e.error_message,
    e.input_data,
    e.output_data,
    e.context,
    e.triggered_by,
    pe.full_name as triggered_by_name
  FROM v2.pipeline_executions e
  JOIN v2.pipelines p ON e.pipeline_id = p.id
  LEFT JOIN v2.people pe ON e.triggered_by = pe.id
  WHERE e.id = get_pipeline_execution.execution_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get running executions
CREATE OR REPLACE FUNCTION v2.get_running_executions(
  account_id uuid DEFAULT NULL,
  pipeline_id uuid DEFAULT NULL
)
RETURNS TABLE (
  execution_id uuid,
  pipeline_name text,
  status text,
  started_at timestamptz,
  duration_seconds numeric,
  triggered_by_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as execution_id,
    p.name as pipeline_name,
    e.status,
    e.started_at,
    EXTRACT(EPOCH FROM (now() - e.started_at)) as duration_seconds,
    pe.full_name as triggered_by_name
  FROM v2.pipeline_executions e
  JOIN v2.pipelines p ON e.pipeline_id = p.id
  LEFT JOIN v2.people pe ON e.triggered_by = pe.id
  WHERE e.status IN ('pending', 'running')
  AND (account_id IS NULL OR e.account_id = get_running_executions.account_id)
  AND (pipeline_id IS NULL OR e.pipeline_id = get_running_executions.pipeline_id)
  ORDER BY e.started_at;
END;
$$ LANGUAGE plpgsql;

-- Function to get execution statistics
CREATE OR REPLACE FUNCTION v2.get_execution_statistics(
  pipeline_id uuid DEFAULT NULL,
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  pipeline_id uuid,
  pipeline_name text,
  total_executions bigint,
  successful_executions bigint,
  failed_executions bigint,
  cancelled_executions bigint,
  avg_duration_seconds numeric,
  last_execution_at timestamptz,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.pipeline_id,
    p.name as pipeline_name,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_executions,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_executions,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_executions,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed') as avg_duration_seconds,
    MAX(started_at) as last_execution_at,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        (COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) * 100)
      ELSE 0
    END as success_rate
  FROM v2.pipeline_executions e
  JOIN v2.pipelines p ON e.pipeline_id = p.id
  WHERE (pipeline_id IS NULL OR e.pipeline_id = get_execution_statistics.pipeline_id)
  AND (account_id IS NULL OR e.account_id = get_execution_statistics.account_id)
  AND (date_from IS NULL OR e.started_at >= get_execution_statistics.date_from)
  AND (date_to IS NULL OR e.started_at <= get_execution_statistics.date_to)
  GROUP BY e.pipeline_id, p.name
  ORDER BY total_executions DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old executions
CREATE OR REPLACE FUNCTION v2.cleanup_executions(
  days_to_keep integer DEFAULT 30,
  status_filter text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.pipeline_executions
  WHERE started_at < cutoff_date
  AND completed_at IS NOT NULL
  AND (status_filter IS NULL OR status = status_filter);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.pipeline_executions IS 'Tracks pipeline execution runs';
COMMENT ON FUNCTION v2.create_pipeline_execution(uuid, jsonb, jsonb, uuid, uuid) IS 'Create pipeline execution';
COMMENT ON FUNCTION v2.start_pipeline_execution(uuid) IS 'Start pipeline execution';
COMMENT ON FUNCTION v2.complete_pipeline_execution(uuid, jsonb, text) IS 'Complete pipeline execution';
COMMENT ON FUNCTION v2.cancel_pipeline_execution(uuid) IS 'Cancel pipeline execution';
COMMENT ON FUNCTION v2.get_pipeline_execution(uuid) IS 'Get execution details';
COMMENT ON FUNCTION v2.get_running_executions(uuid, uuid) IS 'Get running executions';
COMMENT ON FUNCTION v2.get_execution_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get execution statistics';
COMMENT ON FUNCTION v2.cleanup_executions(integer, text) IS 'Cleanup old executions';
