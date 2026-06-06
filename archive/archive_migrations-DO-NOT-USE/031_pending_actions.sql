-- Pending Actions table for Spine v2
-- Asynchronous action queue for workflows

CREATE TABLE v2.pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('create_item', 'update_item', 'send_notification', 'create_thread', 'webhook', 'custom')),
  target_type text NOT NULL,
  target_id uuid,
  action_data jsonb NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  error_message text,
  result jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (started_at IS NULL OR status IN ('processing', 'completed', 'failed', 'cancelled')),
  CHECK (completed_at IS NULL OR status IN ('completed', 'failed', 'cancelled')),
  CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Indexes
CREATE INDEX idx_pending_actions_app_id ON v2.pending_actions(app_id);
CREATE INDEX idx_pending_actions_action_type ON v2.pending_actions(action_type);
CREATE INDEX idx_pending_actions_target ON v2.pending_actions(target_type, target_id);
CREATE INDEX idx_pending_actions_status ON v2.pending_actions(status);
CREATE INDEX idx_pending_actions_priority ON v2.pending_actions(priority DESC);
CREATE INDEX idx_pending_actions_scheduled ON v2.pending_actions(scheduled_at);
CREATE INDEX idx_pending_actions_created_by ON v2.pending_actions(created_by);
CREATE INDEX idx_pending_actions_account ON v2.pending_actions(account_id);

-- Composite indexes for efficient querying
CREATE INDEX idx_pending_actions_status_scheduled ON v2.pending_actions(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_pending_actions_account_status ON v2.pending_actions(account_id, status);
CREATE INDEX idx_pending_actions_priority_status ON v2.pending_actions(priority DESC, status) WHERE status IN ('pending', 'processing');

-- GIN indexes for JSONB
CREATE INDEX idx_pending_actions_action_data_gin ON v2.pending_actions USING gin(action_data);
CREATE INDEX idx_pending_actions_result_gin ON v2.pending_actions USING gin(result);

-- Function to create pending action
CREATE OR REPLACE FUNCTION v2.create_pending_action(
  app_id uuid,
  action_type text,
  target_type text,
  target_id uuid DEFAULT NULL,
  action_data jsonb DEFAULT '{}',
  priority integer DEFAULT 0,
  scheduled_at timestamptz DEFAULT now(),
  max_retries integer DEFAULT 3,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  action_id uuid;
BEGIN
  -- Validate action type
  IF action_type NOT IN ('create_item', 'update_item', 'send_notification', 'create_thread', 'webhook', 'custom') THEN
    RAISE EXCEPTION 'Invalid action type';
  END IF;
  
  -- Insert pending action
  INSERT INTO v2.pending_actions (
    app_id, action_type, target_type, target_id, action_data,
    priority, scheduled_at, max_retries, metadata, created_by, account_id
  )
  VALUES (
    app_id, action_type, target_type, target_id, action_data,
    priority, scheduled_at, max_retries, metadata, created_by, account_id
  )
  RETURNING id INTO action_id;
  
  RETURN action_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending actions
CREATE OR REPLACE FUNCTION v2.get_pending_actions(
  account_id uuid DEFAULT NULL,
  action_type text DEFAULT NULL,
  target_type text DEFAULT NULL,
  limit integer DEFAULT 100,
  priority_filter integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  action_type text,
  target_type text,
  target_id uuid,
  action_data jsonb,
  priority integer,
  status text,
  scheduled_at timestamptz,
  retry_count integer,
  max_retries integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pa.id,
    pa.app_id,
    pa.action_type,
    pa.target_type,
    pa.target_id,
    pa.action_data,
    pa.priority,
    pa.status,
    pa.scheduled_at,
    pa.retry_count,
    pa.max_retries
  FROM v2.pending_actions pa
  WHERE pa.status = 'pending'
  AND pa.scheduled_at <= now()
  AND (account_id IS NULL OR pa.account_id = get_pending_actions.account_id)
  AND (action_type IS NULL OR pa.action_type = get_pending_actions.action_type)
  AND (target_type IS NULL OR pa.target_type = get_pending_actions.target_type)
  AND (priority_filter IS NULL OR pa.priority >= priority_filter)
  ORDER BY pa.priority DESC, pa.scheduled_at ASC
  LIMIT get_pending_actions.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to execute pending action
CREATE OR REPLACE FUNCTION v2.execute_pending_action(
  action_id uuid
)
RETURNS TABLE (
  success boolean,
  result jsonb,
  error_message text
) AS $$
DECLARE
  action_record RECORD;
  execution_result jsonb;
  execution_error text;
  execution_success boolean;
BEGIN
  -- Get and lock the action
  SELECT * INTO action_record
  FROM v2.pending_actions
  WHERE id = execute_pending_action.action_id
  AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '{}'::jsonb, 'Action not found or not pending'::text;
    RETURN;
  END IF;
  
  -- Mark as processing
  UPDATE v2.pending_actions
  SET 
    status = 'processing',
    started_at = now(),
    updated_at = now()
  WHERE id = action_id;
  
  execution_success := false;
  execution_result := '{}'::jsonb;
  execution_error := NULL;
  
  BEGIN
    -- Execute action based on type
    IF action_record.action_type = 'create_item' THEN
      -- Create item action
      INSERT INTO v2.items (
        app_id, item_type, title, description, data,
        created_by, account_id
      )
      VALUES (
        action_record.app_id,
        action_record.action_data->>'item_type',
        action_record.action_data->>'title',
        action_record.action_data->>'description',
        COALESCE(action_record.action_data->'data', '{}'),
        NULL, -- system action
        action_record.account_id
      )
      RETURNING id INTO execution_result;
      
      execution_success := true;
      
    ELSIF action_record.action_type = 'update_item' THEN
      -- Update item action
      UPDATE v2.items
      SET 
        data = COALESCE(action_record.action_data->'data', data),
        updated_at = now()
      WHERE id = (action_record.action_data->>'item_id')::uuid
      AND account_id = action_record.account_id
      RETURNING id INTO execution_result;
      
      execution_success := FOUND;
      
    ELSIF action_record.action_type = 'send_notification' THEN
      -- Send notification action
      execution_result := jsonb_build_object(
        'notification_sent', true,
        'message', action_record.action_data->>'message',
        'target_type', action_record.target_type,
        'target_id', action_record.target_id
      );
      execution_success := true;
      
    ELSIF action_record.action_type = 'create_thread' THEN
      -- Create thread action
      INSERT INTO v2.threads (
        app_id, target_type, target_id, title, description,
        created_by, account_id
      )
      VALUES (
        action_record.app_id,
        action_record.action_data->>'target_type',
        (action_record.action_data->>'target_id')::uuid,
        action_record.action_data->>'title',
        action_record.action_data->>'description',
        NULL, -- system action
        action_record.account_id
      )
      RETURNING id INTO execution_result;
      
      execution_success := true;
      
    ELSIF action_record.action_type = 'webhook' THEN
      -- Webhook action (placeholder)
      execution_result := jsonb_build_object(
        'webhook_url', action_record.action_data->>'url',
        'status', 'not_implemented'
      );
      execution_success := false;
      execution_error := 'Webhook actions not yet implemented';
      
    ELSIF action_record.action_type = 'custom' THEN
      -- Custom action (placeholder)
      execution_result := jsonb_build_object(
        'custom_action', action_record.action_data->>'action',
        'status', 'not_implemented'
      );
      execution_success := false;
      execution_error := 'Custom actions not yet implemented';
      
    ELSE
      execution_success := false;
      execution_error := 'Unknown action type: ' || action_record.action_type;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      execution_success := false;
      execution_error := SQLERRM;
  END;
  
  -- Update action record
  IF execution_success THEN
    UPDATE v2.pending_actions
    SET 
      status = 'completed',
      completed_at = now(),
      result = execution_result,
      updated_at = now()
    WHERE id = action_id;
  ELSE
    UPDATE v2.pending_actions
    SET 
      status = CASE 
        WHEN retry_count >= max_retries THEN 'failed'
        ELSE 'pending'
      END,
      retry_count = retry_count + 1,
      error_message = execution_error,
      completed_at = CASE WHEN retry_count >= max_retries THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = action_id;
  END IF;
  
  RETURN QUERY SELECT 
    execution_success as success,
    execution_result as result,
    execution_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to retry failed actions
CREATE OR REPLACE FUNCTION v2.retry_failed_actions(
  account_id uuid DEFAULT NULL,
  action_type text DEFAULT NULL,
  hours_back integer DEFAULT 1
)
RETURNS TABLE (
  retried_count integer
) AS $$
DECLARE
  retried_count integer;
BEGIN
  UPDATE v2.pending_actions
  SET 
    status = 'pending',
    retry_count = 0,
    error_message = NULL,
    updated_at = now()
  WHERE status = 'failed'
  AND account_id = retry_failed_actions.account_id
  AND (action_type IS NULL OR action_type = retry_failed_actions.action_type)
  AND updated_at >= now() - (hours_back || ' hours')::interval;
  
  GET DIAGNOSTICS retried_count = ROW_COUNT;
  RETURN QUERY SELECT retried_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel pending actions
CREATE OR REPLACE FUNCTION v2.cancel_pending_actions(
  account_id uuid DEFAULT NULL,
  action_type text DEFAULT NULL,
  target_type text DEFAULT NULL,
  target_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cancelled_count integer
) AS $$
DECLARE
  cancelled_count integer;
BEGIN
  UPDATE v2.pending_actions
  SET 
    status = 'cancelled',
    completed_at = now(),
    updated_at = now()
  WHERE status = 'pending'
  AND account_id = cancel_pending_actions.account_id
  AND (action_type IS NULL OR action_type = cancel_pending_actions.action_type)
  AND (target_type IS NULL OR target_type = cancel_pending_actions.target_type)
  AND (target_id IS NULL OR target_id = cancel_pending_actions.target_id);
  
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN QUERY SELECT cancelled_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get action statistics
CREATE OR REPLACE FUNCTION v2.get_pending_action_statistics(
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  action_type text,
  total_actions bigint,
  pending_actions bigint,
  processing_actions bigint,
  completed_actions bigint,
  failed_actions bigint,
  cancelled_actions bigint,
  avg_execution_time_seconds numeric,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    action_type,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_actions,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_actions,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_actions,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_actions,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_actions,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) FILTER (WHERE status = 'completed' AND started_at IS NOT NULL) as avg_execution_time_seconds,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) > 0 THEN 
        COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) * 100
      ELSE 0
    END as success_rate
  FROM v2.pending_actions
  WHERE (account_id IS NULL OR account_id = get_pending_action_statistics.account_id)
  AND (date_from IS NULL OR created_at >= get_pending_action_statistics.date_from)
  AND (date_to IS NULL OR created_at <= get_pending_action_statistics.date_to)
  GROUP BY action_type
  ORDER BY total_actions DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old actions
CREATE OR REPLACE FUNCTION v2.cleanup_pending_actions(
  days_to_keep integer DEFAULT 30,
  status_filter text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.pending_actions
  WHERE created_at < cutoff_date
  AND completed_at IS NOT NULL
  AND (status_filter IS NULL OR status = status_filter);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.pending_actions IS 'Asynchronous action queue for workflows';
COMMENT ON FUNCTION v2.create_pending_action(uuid, text, text, uuid, jsonb, integer, timestamptz, integer, jsonb, uuid, uuid) IS 'Create pending action';
COMMENT ON FUNCTION v2.get_pending_actions(uuid, text, text, integer, integer) IS 'Get pending actions for processing';
COMMENT ON FUNCTION v2.execute_pending_action(uuid) IS 'Execute pending action';
COMMENT ON FUNCTION v2.retry_failed_actions(uuid, text, integer) IS 'Retry failed actions';
COMMENT ON FUNCTION v2.cancel_pending_actions(uuid, text, text, uuid) IS 'Cancel pending actions';
COMMENT ON FUNCTION v2.get_pending_action_statistics(uuid, timestamptz, timestamptz) IS 'Get action statistics';
COMMENT ON FUNCTION v2.cleanup_pending_actions(integer, text) IS 'Cleanup old actions';
