-- Seed data and functions for workflow layer in Spine v2
-- Default workflow configurations and helper functions

-- Function to publish events to outbox from other system events
CREATE OR REPLACE FUNCTION v2.publish_system_event()
RETURNS trigger AS $$
DECLARE
  event_data jsonb;
  outbox_id uuid;
BEGIN
  -- Build event data based on operation type
  IF TG_OP = 'INSERT' THEN
    event_data := jsonb_build_object(
      'operation', 'created',
      'table', TG_TABLE_NAME,
      'id', NEW.id,
      'data', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    event_data := jsonb_build_object(
      'operation', 'updated',
      'table', TG_TABLE_NAME,
      'id', NEW.id,
      'data', to_jsonb(NEW),
      'old_data', to_jsonb(OLD)
    );
  ELSIF TG_OP = 'DELETE' THEN
    event_data := jsonb_build_object(
      'operation', 'deleted',
      'table', TG_TABLE_NAME,
      'id', OLD.id,
      'data', to_jsonb(OLD)
    );
  END IF;
  
  -- Publish to outbox for webhook delivery
  SELECT v2.publish_event(
    TG_TABLE_NAME || '.' || TG_OP,
    event_data,
    'webhook',
    '{}', -- default webhook config
    NULL, -- app_id
    COALESCE(NEW.account_id, OLD.account_id)
  ) INTO outbox_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for important tables
CREATE TRIGGER trigger_items_publish_event
  AFTER INSERT OR UPDATE OR DELETE ON v2.items
  FOR EACH ROW EXECUTE FUNCTION v2.publish_system_event();

CREATE TRIGGER trigger_threads_publish_event
  AFTER INSERT OR UPDATE OR DELETE ON v2.threads
  FOR EACH ROW EXECUTE FUNCTION v2.publish_system_event();

CREATE TRIGGER trigger_messages_publish_event
  AFTER INSERT OR UPDATE OR DELETE ON v2.messages
  FOR EACH ROW EXECUTE FUNCTION v2.publish_system_event();

-- Function to process pending actions batch
CREATE OR REPLACE FUNCTION v2.process_pending_actions_batch(
  account_id uuid DEFAULT NULL,
  batch_size integer DEFAULT 50
)
RETURNS TABLE (
  processed_count integer,
  success_count integer,
  failed_count integer
) AS $$
DECLARE
  action_record RECORD;
  action_result RECORD;
  processed_count integer := 0;
  success_count integer := 0;
  failed_count integer := 0;
BEGIN
  -- Get pending actions
  FOR action_record IN 
    SELECT * FROM v2.get_pending_actions(account_id, NULL, NULL, batch_size)
  LOOP
    -- Execute action
    FOR action_result IN 
      SELECT * FROM v2.execute_pending_action(action_record.id)
    LOOP
      processed_count := processed_count + 1;
      IF action_result.success THEN
        success_count := success_count + 1;
      ELSE
        failed_count := failed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT processed_count, success_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Function to send outbox events batch
CREATE OR REPLACE FUNCTION v2.send_outbox_events_batch(
  account_id uuid DEFAULT NULL,
  batch_size integer DEFAULT 50
)
RETURNS TABLE (
  sent_count integer,
  delivered_count integer,
  failed_count integer
) AS $$
DECLARE
  event_record RECORD;
  event_result RECORD;
  sent_count integer := 0;
  delivered_count integer := 0;
  failed_count integer := 0;
BEGIN
  -- Get pending outbox events
  FOR event_record IN 
    SELECT * FROM v2.get_pending_outbox_events(account_id, NULL, NULL, batch_size)
  LOOP
    -- Send event
    FOR event_result IN 
      SELECT * FROM v2.send_outbox_event(event_record.id)
    LOOP
      sent_count := sent_count + 1;
      IF event_result.success THEN
        delivered_count := delivered_count + 1;
      ELSE
        failed_count := failed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT sent_count, delivered_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Function to deliver webhooks batch
CREATE OR REPLACE FUNCTION v2.deliver_webhooks_batch(
  account_id uuid DEFAULT NULL,
  batch_size integer DEFAULT 50
)
RETURNS TABLE (
  delivered_count integer,
  success_count integer,
  failed_count integer
) AS $$
DECLARE
  delivery_record RECORD;
  delivery_result RECORD;
  delivered_count integer := 0;
  success_count integer := 0;
  failed_count integer := 0;
BEGIN
  -- Get pending webhook deliveries
  FOR delivery_record IN 
    SELECT wd.* 
    FROM v2.webhook_deliveries wd
    WHERE wd.status = 'pending'
    AND wd.scheduled_at <= now()
    AND (account_id IS NULL OR wd.account_id = deliver_webhooks_batch.account_id)
    ORDER BY wd.scheduled_at ASC
    LIMIT batch_size
  LOOP
    -- Deliver webhook
    FOR delivery_result IN 
      SELECT * FROM v2.deliver_webhook(delivery_record.id)
    LOOP
      delivered_count := delivered_count + 1;
      IF delivery_result.success THEN
        success_count := success_count + 1;
      ELSE
        failed_count := failed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT delivered_count, success_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Function to create workflow from template
CREATE OR REPLACE FUNCTION v2.create_workflow_from_template(
  template_name text,
  account_id uuid,
  app_id uuid DEFAULT NULL,
  config_overrides jsonb DEFAULT '{}'
)
RETURNS TABLE (
  pipeline_id uuid,
  trigger_id uuid,
  timer_id uuid
) AS $$
DECLARE
  pipeline_id uuid;
  trigger_id uuid;
  timer_id uuid;
  template_config jsonb;
BEGIN
  -- Get template configuration
  CASE template_name
    WHEN 'item_approval' THEN
      template_config := jsonb_build_object(
        'pipeline', jsonb_build_object(
          'name', 'Item Approval Workflow',
          'description', 'Automates item approval process',
          'stages', jsonb_build_array(
            jsonb_build_object('name', 'Submit', 'type', 'action'),
            jsonb_build_object('name', 'Review', 'type', 'condition'),
            jsonb_build_object('name', 'Approve/Reject', 'type', 'action'),
            jsonb_build_object('name', 'Notify', 'type', 'action')
          )
        ),
        'trigger', jsonb_build_object(
          'name', 'Item Submitted',
          'event_type', 'item.created',
          'conditions', jsonb_build_object('item_type', 'approval_required'),
          'actions', jsonb_build_array(
            jsonb_build_object('type', 'create_thread', 'target_type', 'item', 'title', 'Review Request')
          )
        ),
        'timer', jsonb_build_object(
          'name', 'Approval Reminder',
          'schedule_type', 'cron',
          'schedule_config', jsonb_build_object('hour', '9', 'minute', '0'),
          'action_type', 'trigger'
        )
      );
      
    WHEN 'onboarding' THEN
      template_config := jsonb_build_object(
        'pipeline', jsonb_build_object(
          'name', 'New User Onboarding',
          'description', 'Guides new users through onboarding',
          'stages', jsonb_build_array(
            jsonb_build_object('name', 'Welcome', 'type', 'action'),
            jsonb_build_object('name', 'Create Profile', 'type', 'action'),
            jsonb_build_object('name', 'Send Resources', 'type', 'action'),
            jsonb_build_object('name', 'Schedule Follow-up', 'type', 'delay')
          )
        ),
        'trigger', jsonb_build_object(
          'name', 'User Joined',
          'event_type', 'person.created',
          'actions', jsonb_build_array(
            jsonb_build_object('type', 'send_notification', 'message', 'Welcome to the team!')
          )
        ),
        'timer', jsonb_build_object(
          'name', 'Daily Check-in',
          'schedule_type', 'recurring',
          'schedule_config', jsonb_build_object('interval_hours', 24),
          'action_type', 'custom'
        )
      );
      
    WHEN 'content_moderation' THEN
      template_config := jsonb_build_object(
        'pipeline', jsonb_build_object(
          'name', 'Content Moderation',
          'description', 'Automated content review and moderation',
          'stages', jsonb_build_array(
            jsonb_build_object('name', 'Analyze Content', 'type', 'action'),
            jsonb_build_object('name', 'Check Rules', 'type', 'condition'),
            jsonb_build_object('name', 'Flag/Approve', 'type', 'action'),
            jsonb_build_object('name', 'Notify Moderators', 'type', 'action')
          )
        ),
        'trigger', jsonb_build_object(
          'name', 'Content Created',
          'event_type', 'item.created',
          'conditions', jsonb_build_object('item_type', 'content'),
          'actions', jsonb_build_array(
            jsonb_build_object('type', 'create_pending_action', 'action_type', 'analyze_content')
          )
        ),
        'timer', jsonb_build_object(
          'name', 'Moderation Queue',
          'schedule_type', 'recurring',
          'schedule_config', jsonb_build_object('interval_minutes', 15),
          'action_type', 'custom'
        )
      );
      
    ELSE
      RAISE EXCEPTION 'Unknown template: %', template_name;
  END CASE;
  
  -- Apply config overrides
  template_config := jsonb_set(
    jsonb_set(
      jsonb_set(template_config, '{pipeline}', template_config->'pipeline'),
      '{trigger}', template_config->'trigger'
    ),
    '{timer}', template_config->'timer'
  );
  
  -- Create pipeline
  SELECT v2.create_pipeline(
    app_id,
    (template_config->'pipeline'->>'name'),
    template_config->'pipeline'->>'description',
    'manual',
    '{}',
    template_config->'pipeline'->'stages',
    '{}',
    NULL,
    account_id
  ) INTO pipeline_id;
  
  -- Create trigger
  SELECT v2.create_trigger(
    app_id,
    (template_config->'trigger'->>'name'),
    template_config->'trigger'->>'description',
    template_config->'trigger'->>'event_type',
    template_config->'trigger'->'conditions',
    template_config->'trigger'->'actions',
    '{}',
    NULL,
    account_id
  ) INTO trigger_id;
  
  -- Create timer
  SELECT v2.create_timer(
    app_id,
    (template_config->'timer'->>'name'),
    template_config->'timer'->>'description',
    (template_config->'timer'->>'schedule_type'),
    template_config->'timer'->'schedule_config',
    (template_config->'timer'->>'action_type'),
    template_config->'timer'->'action_config',
    '{}',
    NULL,
    account_id
  ) INTO timer_id;
  
  RETURN QUERY SELECT pipeline_id, trigger_id, timer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get workflow health metrics
CREATE OR REPLACE FUNCTION v2.get_workflow_health_metrics(
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
  -- Pending actions metrics
  RETURN QUERY SELECT 
    'pending_actions' as metric_type,
    'total_pending' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) < 100 THEN 'healthy'
      WHEN COUNT(*) < 500 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 100, 'threshold_critical', 500) as details
  FROM v2.pending_actions
  WHERE account_id = get_workflow_health_metrics.account_id
  AND status = 'pending';
  
  RETURN QUERY SELECT 
    'pending_actions' as metric_type,
    'failed_rate' as metric_name,
    CASE 
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100)
      ELSE 0
    END as value,
    CASE 
      WHEN COUNT(*) = 0 OR (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100) < 10 THEN 'healthy'
      WHEN (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100) < 25 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 10, 'threshold_critical', 25) as details
  FROM v2.pending_actions
  WHERE account_id = get_workflow_health_metrics.account_id
  AND status IN ('completed', 'failed');
  
  -- Outbox metrics
  RETURN QUERY SELECT 
    'outbox' as metric_type,
    'total_pending' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) < 50 THEN 'healthy'
      WHEN COUNT(*) < 200 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 50, 'threshold_critical', 200) as details
  FROM v2.outbox
  WHERE account_id = get_workflow_health_metrics.account_id
  AND status = 'pending';
  
  -- Webhook metrics
  RETURN QUERY SELECT 
    'webhooks' as metric_type,
    'failed_rate' as metric_name,
    CASE 
      WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100)
      ELSE 0
    END as value,
    CASE 
      WHEN COUNT(*) = 0 OR (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100) < 5 THEN 'healthy'
      WHEN (COUNT(*) FILTER (WHERE status = 'failed')::numeric / COUNT(*) * 100) < 15 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 5, 'threshold_critical', 15) as details
  FROM v2.webhook_deliveries
  WHERE account_id = get_workflow_health_metrics.account_id
  AND created_at >= now() - '24 hours'::interval;
  
  -- Processing lag metrics
  RETURN QUERY SELECT 
    'processing' as metric_type,
    'avg_pending_age_hours' as metric_name,
    AVG(EXTRACT(EPOCH FROM (now() - scheduled_at)) / 3600) as value,
    CASE 
      WHEN AVG(EXTRACT(EPOCH FROM (now() - scheduled_at)) / 3600) < 1 THEN 'healthy'
      WHEN AVG(EXTRACT(EPOCH FROM (now() - scheduled_at)) / 3600) < 4 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold_warning', 1, 'threshold_critical', 4) as details
  FROM v2.pending_actions
  WHERE account_id = get_workflow_health_metrics.account_id
  AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- Function to enable/disable all workflows for account
CREATE OR REPLACE FUNCTION v2.toggle_account_workflows(
  account_id uuid,
  is_active boolean
)
RETURNS TABLE (
  workflow_type text,
  disabled_count bigint,
  enabled_count bigint
) AS $$
BEGIN
  -- Update pipelines
  UPDATE v2.pipelines
  SET is_active = toggle_account_workflows.is_active
  WHERE account_id = toggle_account_workflows.account_id;
  
  RETURN QUERY SELECT 
    'pipeline' as workflow_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.pipelines
  WHERE account_id = toggle_account_workflows.account_id;
  
  -- Update triggers
  UPDATE v2.triggers
  SET is_active = toggle_account_workflows.is_active
  WHERE account_id = toggle_account_workflows.account_id;
  
  RETURN QUERY SELECT 
    'trigger' as workflow_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.triggers
  WHERE account_id = toggle_account_workflows.account_id;
  
  -- Update timers
  UPDATE v2.timers
  SET is_active = toggle_account_workflows.is_active
  WHERE account_id = toggle_account_workflows.account_id;
  
  RETURN QUERY SELECT 
    'timer' as workflow_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.timers
  WHERE account_id = toggle_account_workflows.account_id;
  
  -- Update webhooks
  UPDATE v2.webhooks
  SET is_active = toggle_account_workflows.is_active
  WHERE account_id = toggle_account_workflows.account_id;
  
  RETURN QUERY SELECT 
    'webhook' as workflow_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.webhooks
  WHERE account_id = toggle_account_workflows.account_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION v2.publish_system_event() IS 'Publish system events to outbox';
COMMENT ON FUNCTION v2.process_pending_actions_batch(uuid, integer) IS 'Process pending actions in batch';
COMMENT ON FUNCTION v2.send_outbox_events_batch(uuid, integer) IS 'Send outbox events in batch';
COMMENT ON FUNCTION v2.deliver_webhooks_batch(uuid, integer) IS 'Deliver webhooks in batch';
COMMENT ON FUNCTION v2.create_workflow_from_template(text, uuid, uuid, jsonb) IS 'Create workflow from template';
COMMENT ON FUNCTION v2.get_workflow_health_metrics(uuid) IS 'Get workflow health metrics';
COMMENT ON FUNCTION v2.toggle_account_workflows(uuid, boolean) IS 'Enable/disable all workflows for account';
