-- Timers table for Spine v2
-- Scheduled automation timers

CREATE TABLE v2.timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  schedule_type text NOT NULL CHECK (schedule_type IN ('once', 'recurring', 'cron')),
  schedule_config jsonb NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('pipeline', 'trigger', 'webhook', 'custom')),
  action_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR action_type IN ('system', 'account', 'person')) -- System timers don't need app_id
);

-- Indexes
CREATE INDEX idx_timers_app_id ON v2.timers(app_id);
CREATE INDEX idx_timers_schedule_type ON v2.timers(schedule_type);
CREATE INDEX idx_timers_action_type ON v2.timers(action_type);
CREATE INDEX idx_timers_active ON v2.timers(is_active);
CREATE INDEX idx_timers_next_run ON v2.timers(next_run_at);
CREATE INDEX idx_timers_last_run ON v2.timers(last_run_at);
CREATE INDEX idx_timers_created_by ON v2.timers(created_by);
CREATE INDEX idx_timers_account ON v2.timers(account_id);

-- Composite indexes
CREATE INDEX idx_timers_active_next_run ON v2.timers(is_active, next_run_at) WHERE is_active = true;
CREATE INDEX idx_timers_account_active ON v2.timers(account_id, is_active) WHERE is_active = true;

-- GIN indexes for JSONB
CREATE INDEX idx_timers_schedule_config_gin ON v2.timers USING gin(schedule_config);
CREATE INDEX idx_timers_action_config_gin ON v2.timers USING gin(action_config);

-- Function to get timers due to run
CREATE OR REPLACE FUNCTION v2.get_due_timers(
  account_id uuid DEFAULT NULL,
  limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  name text,
  schedule_type text,
  schedule_config jsonb,
  action_type text,
  action_config jsonb,
  next_run_at timestamptz,
  last_run_at timestamptz,
  run_count integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.app_id,
    t.name,
    t.schedule_type,
    t.schedule_config,
    t.action_type,
    t.action_config,
    t.next_run_at,
    t.last_run_at,
    t.run_count
  FROM v2.timers t
  WHERE t.is_active = true
  AND t.next_run_at <= now()
  AND (account_id IS NULL OR t.account_id = get_due_timers.account_id)
  ORDER BY t.next_run_at
  LIMIT get_due_timers.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to create timer
CREATE OR REPLACE FUNCTION v2.create_timer(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  schedule_type text,
  schedule_config jsonb,
  action_type text,
  action_config jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  timer_id uuid;
  next_run timestamptz;
BEGIN
  -- Validate schedule type
  IF schedule_type NOT IN ('once', 'recurring', 'cron') THEN
    RAISE EXCEPTION 'Invalid schedule type';
  END IF;
  
  -- Validate action type
  IF action_type NOT IN ('pipeline', 'trigger', 'webhook', 'custom') THEN
    RAISE EXCEPTION 'Invalid action type';
  END IF;
  
  -- Calculate next run time
  next_run := v2.calculate_next_run(schedule_type, schedule_config);
  
  -- Insert timer
  INSERT INTO v2.timers (
    app_id, name, description, schedule_type, schedule_config,
    action_type, action_config, next_run_at, metadata,
    created_by, account_id
  )
  VALUES (
    app_id, name, description, schedule_type, schedule_config,
    action_type, action_config, next_run, metadata,
    created_by, account_id
  )
  RETURNING id INTO timer_id;
  
  RETURN timer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate next run time
CREATE OR REPLACE FUNCTION v2.calculate_next_run(
  schedule_type text,
  schedule_config jsonb
)
RETURNS timestamptz AS $$
DECLARE
  next_run timestamptz;
  interval_val interval;
BEGIN
  CASE schedule_type
    WHEN 'once' THEN
      -- Run at specific time
      IF schedule_config ? 'run_at' THEN
        next_run := (schedule_config->>'run_at')::timestamptz;
      ELSE
        next_run := now();
      END IF;
      
    WHEN 'recurring' THEN
      -- Run at intervals
      IF schedule_config ? 'interval' THEN
        interval_val := (schedule_config->>'interval')::interval;
        next_run := now() + interval_val;
      ELSIF schedule_config ? 'interval_seconds' THEN
        interval_val := (schedule_config->>'interval_seconds' || ' seconds')::interval;
        next_run := now() + interval_val;
      ELSIF schedule_config ? 'interval_minutes' THEN
        interval_val := (schedule_config->>'interval_minutes' || ' minutes')::interval;
        next_run := now() + interval_val;
      ELSIF schedule_config ? 'interval_hours' THEN
        interval_val := (schedule_config->>'interval_hours' || ' hours')::interval;
        next_run := now() + interval_val;
      ELSIF schedule_config ? 'interval_days' THEN
        interval_val := (schedule_config->>'interval_days' || ' days')::interval;
        next_run := now() + interval_val;
      ELSE
        RAISE EXCEPTION 'Recurring timer missing interval configuration';
      END IF;
      
    WHEN 'cron' THEN
      -- Run based on cron expression (simplified)
      IF schedule_config ? 'cron' THEN
        -- This is a simplified implementation
        -- In production, use a proper cron library
        next_run := now() + '1 hour'::interval; -- Placeholder
      ELSIF schedule_config ? 'hour' AND schedule_config ? 'minute' THEN
        -- Run at specific hour:minute daily
        next_run := date_trunc('day', now()) + 
                    (schedule_config->>'hour' || ' hours')::interval +
                    (schedule_config->>'minute' || ' minutes')::interval;
        IF next_run <= now() THEN
          next_run := next_run + '1 day'::interval;
        END IF;
      ELSIF schedule_config ? 'hour' THEN
        -- Run hourly at specific minute
        next_run := date_trunc('hour', now()) + 
                    (schedule_config->>'minute' || ' minutes')::interval;
        IF next_run <= now() THEN
          next_run := next_run + '1 hour'::interval;
        END IF;
      ELSE
        RAISE EXCEPTION 'Cron timer missing configuration';
      END IF;
      
    ELSE
      RAISE EXCEPTION 'Unknown schedule type';
  END CASE;
  
  RETURN next_run;
END;
$$ LANGUAGE plpgsql;

-- Function to execute timer
CREATE OR REPLACE FUNCTION v2.execute_timer(
  timer_id uuid
)
RETURNS TABLE (
  execution_id uuid,
  status text,
  result jsonb,
  error_message text,
  next_run_at timestamptz
) AS $$
DECLARE
  timer_record RECORD;
  execution_id uuid;
  execution_status text;
  execution_result jsonb;
  execution_error text;
  next_run timestamptz;
BEGIN
  -- Get timer
  SELECT * INTO timer_record
  FROM v2.timers
  WHERE id = execute_timer.timer_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  execution_status := 'pending';
  execution_result := '{}'::jsonb;
  execution_error := NULL;
  
  BEGIN
    -- Execute action based on type
    IF timer_record.action_type = 'pipeline' THEN
      -- Execute pipeline
      PERFORM v2.create_pipeline_execution(
        (timer_record.action_config->>'pipeline_id')::uuid,
        timer_record.action_config->'input_data',
        jsonb_build_object('timer_id', timer_id),
        NULL, -- system action
        timer_record.account_id
      );
      
      execution_result := jsonb_build_object('pipeline_executed', true);
      execution_status := 'completed';
      
    ELSIF timer_record.action_type = 'trigger' THEN
      -- Execute trigger
      PERFORM v2.create_trigger_execution(
        (timer_record.action_config->>'trigger_id')::uuid,
        'timer.fired',
        jsonb_build_object('timer_id', timer_id, 'timer_name', timer_record.name),
        timer_record.account_id
      );
      
      execution_result := jsonb_build_object('trigger_executed', true);
      execution_status := 'completed';
      
    ELSIF timer_record.action_type = 'webhook' THEN
      -- Execute webhook (placeholder)
      execution_result := jsonb_build_object(
        'webhook_url', timer_record.action_config->>'url',
        'status', 'not_implemented'
      );
      execution_status := 'failed';
      execution_error := 'Webhook actions not yet implemented';
      
    ELSIF timer_record.action_type = 'custom' THEN
      -- Custom action (placeholder)
      execution_result := jsonb_build_object(
        'custom_action', timer_record.action_config->>'action',
        'status', 'not_implemented'
      );
      execution_status := 'failed';
      execution_error := 'Custom actions not yet implemented';
      
    ELSE
      execution_status := 'failed';
      execution_error := 'Unknown action type: ' || timer_record.action_type;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      execution_status := 'failed';
      execution_error := SQLERRM;
  END;
  
  -- Calculate next run time
  IF timer_record.schedule_type = 'once' THEN
    -- One-time timer, deactivate
    UPDATE v2.timers
    SET 
      is_active = false,
      last_run_at = now(),
      run_count = run_count + 1,
      updated_at = now()
    WHERE id = timer_id;
    next_run := NULL;
  ELSE
    -- Calculate next run
    next_run := v2.calculate_next_run(timer_record.schedule_type, timer_record.schedule_config);
    
    UPDATE v2.timers
    SET 
      last_run_at = now(),
      next_run_at = next_run,
      run_count = run_count + 1,
      updated_at = now()
    WHERE id = timer_id;
  END IF;
  
  -- Return execution result
  execution_id := gen_random_uuid();
  RETURN QUERY SELECT 
    execution_id,
    execution_status as status,
    execution_result as result,
    execution_error as error_message,
    next_run_at;
END;
$$ LANGUAGE plpgsql;

-- Function to update timer
CREATE OR REPLACE FUNCTION v2.update_timer(
  timer_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  schedule_config jsonb DEFAULT NULL,
  action_config jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  next_run timestamptz;
BEGIN
  -- Calculate new next run time if schedule changed
  IF schedule_config IS NOT NULL THEN
    next_run := v2.calculate_next_run(
      (SELECT schedule_type FROM v2.timers WHERE id = update_timer.timer_id),
      schedule_config
    );
  END IF;
  
  UPDATE v2.timers
  SET 
    name = COALESCE(update_timer.name, name),
    description = COALESCE(update_timer.description, description),
    schedule_config = COALESCE(update_timer.schedule_config, schedule_config),
    action_config = COALESCE(update_timer.action_config, action_config),
    next_run_at = COALESCE(next_run, next_run_at),
    metadata = COALESCE(update_timer.metadata, metadata),
    updated_at = now()
  WHERE id = update_timer.timer_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to activate/deactivate timer
CREATE OR REPLACE FUNCTION v2.toggle_timer(
  timer_id uuid,
  is_active boolean
)
RETURNS boolean AS $$
DECLARE
  next_run timestamptz;
BEGIN
  -- If activating, calculate next run time
  IF is_active THEN
    SELECT v2.calculate_next_run(schedule_type, schedule_config) INTO next_run
    FROM v2.timers
    WHERE id = toggle_timer.timer_id;
    
    UPDATE v2.timers
    SET 
      is_active = is_active,
      next_run_at = next_run,
      updated_at = now()
    WHERE id = toggle_timer.timer_id;
  ELSE
    UPDATE v2.timers
    SET 
      is_active = is_active,
      updated_at = now()
    WHERE id = toggle_timer.timer_id;
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get timer statistics
CREATE OR REPLACE FUNCTION v2.get_timer_statistics(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  timer_id uuid,
  name text,
  schedule_type text,
  action_type text,
  is_active boolean,
  run_count integer,
  last_run_at timestamptz,
  next_run_at timestamptz,
  avg_interval_hours numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as timer_id,
    t.name,
    t.schedule_type,
    t.action_type,
    t.is_active,
    t.run_count,
    t.last_run_at,
    t.next_run_at,
    CASE 
      WHEN t.run_count > 1 AND t.last_run_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (t.last_run_at - LAG(t.last_run_at) OVER (PARTITION BY t.id ORDER BY t.last_run_at))) / 3600
      ELSE NULL
    END as avg_interval_hours
  FROM v2.timers t
  WHERE (account_id IS NULL OR t.account_id = get_timer_statistics.account_id)
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.timers IS 'Scheduled automation timers';
COMMENT ON FUNCTION v2.get_due_timers(uuid, integer) IS 'Get timers due to run';
COMMENT ON FUNCTION v2.create_timer(uuid, text, text, text, jsonb, text, jsonb, jsonb, uuid, uuid) IS 'Create a new timer';
COMMENT ON FUNCTION v2.calculate_next_run(text, jsonb) IS 'Calculate next run time for timer';
COMMENT ON FUNCTION v2.execute_timer(uuid) IS 'Execute timer action';
COMMENT ON FUNCTION v2.update_timer(uuid, text, text, jsonb, jsonb, jsonb) IS 'Update timer configuration';
COMMENT ON FUNCTION v2.toggle_timer(uuid, boolean) IS 'Activate or deactivate timer';
COMMENT ON FUNCTION v2.get_timer_statistics(uuid) IS 'Get timer statistics';
