-- Seed data and functions for automation layer in Spine v2
-- Default automation configurations and helper functions

-- Function to process event triggers
CREATE OR REPLACE FUNCTION v2.process_event_triggers(
  event_type text,
  event_data jsonb,
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  trigger_id uuid,
  trigger_name text,
  conditions_met boolean,
  actions_executed integer,
  execution_id uuid
) AS $$
DECLARE
  trigger_record RECORD;
  execution_id uuid;
BEGIN
  -- Get all triggers for this event
  FOR trigger_record IN 
    SELECT * FROM v2.get_triggers_by_event(event_type, account_id, app_id, false)
  LOOP
    -- Create execution record
    execution_id := v2.create_trigger_execution(
      trigger_record.id,
      event_type,
      event_data,
      account_id
    );
    
    -- Return execution result
    SELECT 
      id, conditions_met, actions_executed
    INTO trigger_record.id, trigger_record.conditions_met, trigger_record.actions_executed
    FROM v2.trigger_executions
    WHERE id = execution_id;
    
    RETURN QUERY SELECT 
      trigger_record.id as trigger_id,
      trigger_record.name as trigger_name,
      trigger_record.conditions_met as conditions_met,
      trigger_record.actions_executed as actions_executed,
      execution_id as execution_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to run due timers
CREATE OR REPLACE FUNCTION v2.run_due_timers(
  account_id uuid DEFAULT NULL,
  limit integer DEFAULT 100
)
RETURNS TABLE (
  timer_id uuid,
  timer_name text,
  execution_id uuid,
  status text,
  result jsonb,
  error_message text,
  next_run_at timestamptz
) AS $$
DECLARE
  timer_record RECORD;
  execution_result RECORD;
BEGIN
  -- Get all due timers
  FOR timer_record IN 
    SELECT * FROM v2.get_due_timers(account_id, limit)
  LOOP
    -- Execute timer
    FOR execution_result IN 
      SELECT * FROM v2.execute_timer(timer_record.id)
    LOOP
      RETURN QUERY SELECT 
        timer_record.id as timer_id,
        timer_record.name as timer_name,
        execution_result.execution_id,
        execution_result.status,
        execution_result.result,
        execution_result.error_message,
        execution_result.next_run_at;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to create welcome automation for new accounts
CREATE OR REPLACE FUNCTION v2.create_welcome_automations(
  account_id uuid
)
RETURNS void AS $$
DECLARE
  welcome_trigger_id uuid;
  welcome_pipeline_id uuid;
  welcome_timer_id uuid;
BEGIN
  -- Create welcome trigger for new person joins
  INSERT INTO v2.triggers (
    app_id, name, description, event_type,
    conditions, actions, created_by, account_id
  )
  VALUES (
    NULL, -- system trigger
    'Welcome New Team Member',
    'Sends welcome message and creates onboarding tasks when a new person joins the account',
    'person.created',
    '{
      "account_id": "' || account_id::text || '"
    }',
    '[
      {
        "type": "create_thread",
        "target_type": "person",
        "target_id": "{{event.data.person_id}}",
        "title": "Welcome to the Team!",
        "description": "A space to help you get started and ask questions"
      },
      {
        "type": "send_notification",
        "message": "Welcome aboard! Check your welcome thread for getting started information."
      }
    ]',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO welcome_trigger_id;
  
  -- Create onboarding pipeline
  INSERT INTO v2.pipelines (
    app_id, name, description, trigger_type,
    config, stages, created_by, account_id
  )
  VALUES (
    NULL, -- system pipeline
    'New Member Onboarding',
    'Guides new team members through the onboarding process',
    'manual',
    '{}',
    '[
      {
        "name": "Welcome Message",
        "type": "action",
        "config": {
          "action": "send_welcome_email"
        }
      },
      {
        "name": "Create Onboarding Tasks",
        "type": "action",
        "config": {
          "action": "create_onboarding_items"
        }
      },
      {
        "name": "Schedule Check-in",
        "type": "delay",
        "config": {
          "delay": "3 days"
        }
      },
      {
        "name": "Follow-up Message",
        "type": "action",
        "config": {
          "action": "send_followup"
        }
      }
    ]',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO welcome_pipeline_id;
  
  -- Create daily summary timer
  INSERT INTO v2.timers (
    app_id, name, description, schedule_type, schedule_config,
    action_type, action_config, created_by, account_id
  )
  VALUES (
    NULL, -- system timer
    'Daily Activity Summary',
    'Sends daily summary of account activity',
    'cron',
    '{
      "hour": "18",
      "minute": "0"
    }',
    'trigger',
    '{
      "trigger_id": "' || welcome_trigger_id::text || '"
    }',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO welcome_timer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create item lifecycle automations
CREATE OR REPLACE FUNCTION v2.create_item_lifecycle_automations(
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  item_created_trigger_id uuid;
  item_updated_trigger_id uuid;
  cleanup_timer_id uuid;
BEGIN
  -- Create item created trigger
  INSERT INTO v2.triggers (
    app_id, name, description, event_type,
    conditions, actions, created_by, account_id
  )
  VALUES (
    app_id,
    'Item Created Notifications',
    'Notifies relevant people when items are created',
    'item.created',
    '{}',
    '[
      {
        "type": "send_notification",
        "message": "New item created: {{event.data.title}}"
      }
    ]',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO item_created_trigger_id;
  
  -- Create item updated trigger
  INSERT INTO v2.triggers (
    app_id, name, description, event_type,
    conditions, actions, created_by, account_id
  )
  VALUES (
    app_id,
    'Item Status Changes',
    'Tracks and notifies on item status changes',
    'item.updated',
    '{
      "old_status": {
        "operator": "not_equals",
        "value": "{{event.data.new_status}}"
      }
    }',
    '[
      {
        "type": "send_notification",
        "message": "Item status changed from {{event.data.old_status}} to {{event.data.new_status}}"
      }
    ]',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO item_updated_trigger_id;
  
  -- Create cleanup timer for old items
  INSERT INTO v2.timers (
    app_id, name, description, schedule_type, schedule_config,
    action_type, action_config, created_by, account_id
  )
  VALUES (
    app_id,
    'Archive Old Items',
    'Archives items inactive for more than 90 days',
    'cron',
    '{
      "hour": "2",
      "minute": "0"
    }',
    'custom',
    '{
      "action": "archive_old_items",
      "days_inactive": 90
    }',
    NULL, -- system created
    account_id
  )
  RETURNING id INTO cleanup_timer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get automation health metrics
CREATE OR REPLACE FUNCTION v2.get_automation_health_metrics(
  account_id uuid
)
RETURNS TABLE (
  metric_type text,
  metric_name text,
  value numeric,
  status text,
  details jsonb
) AS $$
BEGIN
  -- Pipeline metrics
  RETURN QUERY SELECT 
    'pipeline' as metric_type,
    'total_pipelines' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.pipelines
  WHERE account_id = get_automation_health_metrics.account_id
  AND is_active = true;
  
  RETURN QUERY SELECT 
    'pipeline' as metric_type,
    'failed_executions_24h' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 5) as details
  FROM v2.pipeline_executions
  WHERE account_id = get_automation_health_metrics.account_id
  AND status = 'failed'
  AND started_at >= now() - '24 hours'::interval;
  
  -- Trigger metrics
  RETURN QUERY SELECT 
    'trigger' as metric_type,
    'total_triggers' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.triggers
  WHERE account_id = get_automation_health_metrics.account_id
  AND is_active = true;
  
  RETURN QUERY SELECT 
    'trigger' as metric_type,
    'failed_executions_24h' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 10 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 10) as details
  FROM v2.trigger_executions
  WHERE account_id = get_automation_health_metrics.account_id
  AND actions_failed > 0
  AND triggered_at >= now() - '24 hours'::interval;
  
  -- Timer metrics
  RETURN QUERY SELECT 
    'timer' as metric_type,
    'active_timers' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.timers
  WHERE account_id = get_automation_health_metrics.account_id
  AND is_active = true;
  
  RETURN QUERY SELECT 
    'timer' as metric_type,
    'overdue_timers' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 5) as details
  FROM v2.timers
  WHERE account_id = get_automation_health_metrics.account_id
  AND is_active = true
  AND next_run_at < now() - '1 hour'::interval;
END;
$$ LANGUAGE plpgsql;

-- Function to enable/disable all automations for account
CREATE OR REPLACE FUNCTION v2.toggle_account_automations(
  account_id uuid,
  is_active boolean
)
RETURNS TABLE (
  automation_type text,
  disabled_count bigint,
  enabled_count bigint
) AS $$
BEGIN
  -- Update pipelines
  UPDATE v2.pipelines
  SET is_active = toggle_account_automations.is_active
  WHERE account_id = toggle_account_automations.account_id;
  
  RETURN QUERY SELECT 
    'pipeline' as automation_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.pipelines
  WHERE account_id = toggle_account_automations.account_id;
  
  -- Update triggers
  UPDATE v2.triggers
  SET is_active = toggle_account_automations.is_active
  WHERE account_id = toggle_account_automations.account_id;
  
  RETURN QUERY SELECT 
    'trigger' as automation_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.triggers
  WHERE account_id = toggle_account_automations.account_id;
  
  -- Update timers
  UPDATE v2.timers
  SET is_active = toggle_account_automations.is_active
  WHERE account_id = toggle_account_automations.account_id;
  
  RETURN QUERY SELECT 
    'timer' as automation_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.timers
  WHERE account_id = toggle_account_automations.account_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION v2.process_event_triggers(text, jsonb, uuid, uuid) IS 'Process all triggers for an event';
COMMENT ON FUNCTION v2.run_due_timers(uuid, integer) IS 'Run all timers that are due';
COMMENT ON FUNCTION v2.create_welcome_automations(uuid) IS 'Create default welcome automations for new account';
COMMENT ON FUNCTION v2.create_item_lifecycle_automations(uuid, uuid) IS 'Create item lifecycle automations';
COMMENT ON FUNCTION v2.get_automation_health_metrics(uuid) IS 'Get automation health and performance metrics';
COMMENT ON FUNCTION v2.toggle_account_automations(uuid, boolean) IS 'Enable/disable all automations for account';
