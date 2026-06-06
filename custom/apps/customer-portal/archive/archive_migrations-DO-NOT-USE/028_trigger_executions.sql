-- Trigger Executions table for Spine v2
-- Tracks trigger execution runs

CREATE TABLE v2.trigger_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES v2.triggers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  conditions_met boolean NOT NULL DEFAULT false,
  actions_executed integer NOT NULL DEFAULT 0,
  actions_successful integer NOT NULL DEFAULT 0,
  actions_failed integer NOT NULL DEFAULT 0,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (actions_executed >= 0),
  CHECK (actions_successful >= 0),
  CHECK (actions_failed >= 0),
  CHECK (actions_successful + actions_failed <= actions_executed)
);

-- Indexes
CREATE INDEX idx_trigger_executions_trigger ON v2.trigger_executions(trigger_id);
CREATE INDEX idx_trigger_executions_event_type ON v2.trigger_executions(event_type);
CREATE INDEX idx_trigger_executions_triggered ON v2.trigger_executions(triggered_at);
CREATE INDEX idx_trigger_executions_completed ON v2.trigger_executions(completed_at);
CREATE INDEX idx_trigger_executions_conditions_met ON v2.trigger_executions(conditions_met);
CREATE INDEX idx_trigger_executions_account ON v2.trigger_executions(account_id);

-- Composite indexes
CREATE INDEX idx_trigger_executions_trigger_triggered ON v2.trigger_executions(trigger_id, triggered_at DESC);
CREATE INDEX idx_trigger_executions_account_recent ON v2.trigger_executions(account_id, triggered_at DESC);

-- Function to create trigger execution
CREATE OR REPLACE FUNCTION v2.create_trigger_execution(
  trigger_id uuid,
  event_type text,
  event_data jsonb DEFAULT '{}',
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  execution_id uuid;
  conditions_met boolean;
BEGIN
  -- Check if trigger exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM v2.triggers
    WHERE id = create_trigger_execution.trigger_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Trigger not found or inactive';
  END IF;
  
  -- Evaluate conditions
  SELECT v2.evaluate_trigger_conditions(trigger_id, event_data) INTO conditions_met;
  
  -- Create execution record
  INSERT INTO v2.trigger_executions (
    trigger_id, event_type, event_data, conditions_met,
    actions_executed, actions_successful, actions_failed,
    account_id
  )
  VALUES (
    trigger_id, event_type, event_data, conditions_met,
    0, 0, 0, account_id
  )
  RETURNING id INTO execution_id;
  
  -- If conditions met, execute actions
  IF conditions_met THEN
    UPDATE v2.trigger_executions
    SET 
      actions_executed = (
        SELECT COUNT(*) FROM v2.execute_trigger_actions(trigger_id, event_data)
      ),
      actions_successful = (
        SELECT COUNT(*) FROM v2.execute_trigger_actions(trigger_id, event_data) WHERE status = 'completed'
      ),
      actions_failed = (
        SELECT COUNT(*) FROM v2.execute_trigger_actions(trigger_id, event_data) WHERE status = 'failed'
      ),
      completed_at = now()
    WHERE id = execution_id;
  ELSE
    UPDATE v2.trigger_executions
    SET completed_at = now()
    WHERE id = execution_id;
  END IF;
  
  RETURN execution_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get execution details
CREATE OR REPLACE FUNCTION v2.get_trigger_execution(
  execution_id uuid
)
RETURNS TABLE (
  id uuid,
  trigger_id uuid,
  trigger_name text,
  event_type text,
  event_data jsonb,
  conditions_met boolean,
  actions_executed integer,
  actions_successful integer,
  actions_failed integer,
  triggered_at timestamptz,
  completed_at timestamptz,
  duration_seconds numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.trigger_id,
    t.name as trigger_name,
    e.event_type,
    e.event_data,
    e.conditions_met,
    e.actions_executed,
    e.actions_successful,
    e.actions_failed,
    e.triggered_at,
    e.completed_at,
    EXTRACT(EPOCH FROM (e.completed_at - e.triggered_at)) as duration_seconds
  FROM v2.trigger_executions e
  JOIN v2.triggers t ON e.trigger_id = t.id
  WHERE e.id = get_trigger_execution.execution_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get recent executions
CREATE OR REPLACE FUNCTION v2.get_recent_trigger_executions(
  account_id uuid DEFAULT NULL,
  trigger_id uuid DEFAULT NULL,
  hours_back integer DEFAULT 24,
  limit integer DEFAULT 100
)
RETURNS TABLE (
  execution_id uuid,
  trigger_name text,
  event_type text,
  conditions_met boolean,
  actions_executed integer,
  actions_successful integer,
  actions_failed integer,
  triggered_at timestamptz,
  duration_seconds numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as execution_id,
    t.name as trigger_name,
    e.event_type,
    e.conditions_met,
    e.actions_executed,
    e.actions_successful,
    e.actions_failed,
    e.triggered_at,
    EXTRACT(EPOCH FROM (e.completed_at - e.triggered_at)) as duration_seconds
  FROM v2.trigger_executions e
  JOIN v2.triggers t ON e.trigger_id = t.id
  WHERE e.triggered_at >= now() - (hours_back || ' hours')::interval
  AND (account_id IS NULL OR e.account_id = get_recent_trigger_executions.account_id)
  AND (trigger_id IS NULL OR e.trigger_id = get_recent_trigger_executions.trigger_id)
  ORDER BY e.triggered_at DESC
  LIMIT get_recent_trigger_executions.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get execution statistics
CREATE OR REPLACE FUNCTION v2.get_trigger_execution_statistics(
  trigger_id uuid DEFAULT NULL,
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  trigger_id uuid,
  trigger_name text,
  total_executions bigint,
  conditions_met_executions bigint,
  conditions_not_met_executions bigint,
  total_actions_executed bigint,
  successful_actions bigint,
  failed_actions bigint,
  avg_actions_per_execution numeric,
  success_rate numeric,
  last_execution_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.trigger_id,
    t.name as trigger_name,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE conditions_met = true) as conditions_met_executions,
    COUNT(*) FILTER (WHERE conditions_met = false) as conditions_not_met_executions,
    SUM(actions_executed) as total_actions_executed,
    SUM(actions_successful) as successful_actions,
    SUM(actions_failed) as failed_actions,
    CASE 
      WHEN COUNT(*) > 0 THEN SUM(actions_executed)::numeric / COUNT(*)
      ELSE 0
    END as avg_actions_per_execution,
    CASE 
      WHEN SUM(actions_executed) > 0 THEN 
        SUM(actions_successful)::numeric / SUM(actions_executed) * 100
      ELSE 0
    END as success_rate,
    MAX(triggered_at) as last_execution_at
  FROM v2.trigger_executions e
  JOIN v2.triggers t ON e.trigger_id = t.id
  WHERE (trigger_id IS NULL OR e.trigger_id = get_trigger_execution_statistics.trigger_id)
  AND (account_id IS NULL OR e.account_id = get_trigger_execution_statistics.account_id)
  AND (date_from IS NULL OR e.triggered_at >= get_trigger_execution_statistics.date_from)
  AND (date_to IS NULL OR e.triggered_at <= get_trigger_execution_statistics.date_to)
  GROUP BY e.trigger_id, t.name
  ORDER BY total_executions DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get event type statistics
CREATE OR REPLACE FUNCTION v2.get_event_type_statistics(
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  event_type text,
  execution_count bigint,
  triggers_fired bigint,
  conditions_met bigint,
  actions_executed bigint,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    event_type,
    COUNT(*) as execution_count,
    COUNT(*) FILTER (WHERE conditions_met = true) as triggers_fired,
    COUNT(*) FILTER (WHERE conditions_met = true) as conditions_met,
    SUM(actions_executed) as actions_executed,
    CASE 
      WHEN SUM(actions_executed) > 0 THEN 
        SUM(actions_successful)::numeric / SUM(actions_executed) * 100
      ELSE 0
    END as success_rate
  FROM v2.trigger_executions
  WHERE (account_id IS NULL OR account_id = get_event_type_statistics.account_id)
  AND (date_from IS NULL OR triggered_at >= get_event_type_statistics.date_from)
  AND (date_to IS NULL OR triggered_at <= get_event_type_statistics.date_to)
  GROUP BY event_type
  ORDER BY execution_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old executions
CREATE OR REPLACE FUNCTION v2.cleanup_trigger_executions(
  days_to_keep integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.trigger_executions
  WHERE triggered_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.trigger_executions IS 'Tracks trigger execution runs';
COMMENT ON FUNCTION v2.create_trigger_execution(uuid, text, jsonb, uuid) IS 'Create trigger execution';
COMMENT ON FUNCTION v2.get_trigger_execution(uuid) IS 'Get execution details';
COMMENT ON FUNCTION v2.get_recent_trigger_executions(uuid, uuid, integer, integer) IS 'Get recent executions';
COMMENT ON FUNCTION v2.get_trigger_execution_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get execution statistics';
COMMENT ON FUNCTION v2.get_event_type_statistics(uuid, timestamptz, timestamptz) IS 'Get event type statistics';
COMMENT ON FUNCTION v2.cleanup_trigger_executions(integer) IS 'Cleanup old executions';
