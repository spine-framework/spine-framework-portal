-- Triggers table for Spine v2
-- Event-based automation triggers

CREATE TABLE v2.triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  event_type text NOT NULL,
  conditions jsonb DEFAULT '{}',
  actions jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR event_type IN ('system', 'account', 'person')) -- System triggers don't need app_id
);

-- Indexes
CREATE INDEX idx_triggers_app_id ON v2.triggers(app_id);
CREATE INDEX idx_triggers_event_type ON v2.triggers(event_type);
CREATE INDEX idx_triggers_active ON v2.triggers(is_active);
CREATE INDEX idx_triggers_created_by ON v2.triggers(created_by);
CREATE INDEX idx_triggers_account ON v2.triggers(account_id);
CREATE INDEX idx_triggers_created_at ON v2.triggers(created_at);

-- GIN indexes for JSONB
CREATE INDEX idx_triggers_conditions_gin ON v2.triggers USING gin(conditions);
CREATE INDEX idx_triggers_actions_gin ON v2.triggers USING gin(actions);

-- Function to get triggers by event type
CREATE OR REPLACE FUNCTION v2.get_triggers_by_event(
  event_type text,
  account_id uuid,
  app_id uuid DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  name text,
  description text,
  event_type text,
  conditions jsonb,
  actions jsonb,
  is_active boolean,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.app_id,
    t.name,
    t.description,
    t.event_type,
    t.conditions,
    t.actions,
    t.is_active,
    t.created_by,
    pe.full_name as created_by_name,
    t.created_at,
    t.updated_at
  FROM v2.triggers t
  LEFT JOIN v2.people pe ON t.created_by = pe.id
  WHERE t.event_type = get_triggers_by_event.event_type
  AND t.account_id = get_triggers_by_event.account_id
  AND (app_id IS NULL OR t.app_id = get_triggers_by_event.app_id)
  AND (include_inactive OR t.is_active = true)
  ORDER BY t.name;
END;
$$ LANGUAGE plpgsql;

-- Function to create trigger
CREATE OR REPLACE FUNCTION v2.create_trigger(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  event_type text,
  conditions jsonb DEFAULT '{}',
  actions jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  trigger_id uuid;
BEGIN
  -- Validate actions configuration
  IF NOT jsonb_is_array(actions) OR jsonb_array_length(actions) = 0 THEN
    RAISE EXCEPTION 'Trigger must have at least one action';
  END IF;
  
  -- Insert trigger
  INSERT INTO v2.triggers (
    app_id, name, description, event_type,
    conditions, actions, metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, event_type,
    conditions, actions, metadata, created_by, account_id
  )
  RETURNING id INTO trigger_id;
  
  RETURN trigger_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update trigger
CREATE OR REPLACE FUNCTION v2.update_trigger(
  trigger_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  conditions jsonb DEFAULT NULL,
  actions jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.triggers
  SET 
    name = COALESCE(update_trigger.name, name),
    description = COALESCE(update_trigger.description, description),
    conditions = COALESCE(update_trigger.conditions, conditions),
    actions = COALESCE(update_trigger.actions, actions),
    metadata = COALESCE(update_trigger.metadata, metadata),
    updated_at = now()
  WHERE id = update_trigger.trigger_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to activate/deactivate trigger
CREATE OR REPLACE FUNCTION v2.toggle_trigger(
  trigger_id uuid,
  is_active boolean
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.triggers
  SET 
    is_active = is_active,
    updated_at = now()
  WHERE id = toggle_trigger.trigger_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to evaluate trigger conditions
CREATE OR REPLACE FUNCTION v2.evaluate_trigger_conditions(
  trigger_id uuid,
  event_data jsonb
)
RETURNS boolean AS $$
DECLARE
  trigger_record RECORD;
  condition_record jsonb;
  condition_key text;
  condition_value jsonb;
  event_value jsonb;
BEGIN
  -- Get trigger
  SELECT * INTO trigger_record
  FROM v2.triggers
  WHERE id = evaluate_trigger_conditions.trigger_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- If no conditions, always true
  IF jsonb_typeof(trigger_record.conditions) = 'null' OR jsonb_typeof(trigger_record.conditions) = 'object' AND jsonb_each(trigger_record.conditions) IS NULL THEN
    RETURN true;
  END IF;
  
  -- Evaluate each condition
  FOR condition_key, condition_value IN SELECT * FROM jsonb_each(trigger_record.conditions) LOOP
    -- Get event value for condition key
    event_value := event_data->condition_key;
    
    -- Handle different condition types
    IF jsonb_typeof(condition_value) = 'object' THEN
      -- Complex condition with operator
      IF condition_value ? 'operator' AND condition_value ? 'value' THEN
        -- Evaluate based on operator
        IF condition_value->>'operator' = 'equals' THEN
          IF event_value != condition_value->'value' THEN
            RETURN false;
          END IF;
        ELSIF condition_value->>'operator' = 'not_equals' THEN
          IF event_value = condition_value->'value' THEN
            RETURN false;
          END IF;
        ELSIF condition_value->>'operator' = 'contains' THEN
          IF NOT (event_value::text LIKE '%' || condition_value->>'value' || '%') THEN
            RETURN false;
          END IF;
        ELSIF condition_value->>'operator' = 'greater_than' THEN
          IF (event_value::numeric) <= (condition_value->'value'::numeric) THEN
            RETURN false;
          END IF;
        ELSIF condition_value->>'operator' = 'less_than' THEN
          IF (event_value::numeric) >= (condition_value->'value'::numeric) THEN
            RETURN false;
          END IF;
        ELSIF condition_value->>'operator' = 'in' THEN
          IF NOT (event_value = ANY (SELECT value FROM jsonb_array_elements_text(condition_value->'values'))) THEN
            RETURN false;
          END IF;
        END IF;
      END IF;
    ELSE
      -- Simple equality check
      IF event_value != condition_value THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to execute trigger actions
CREATE OR REPLACE FUNCTION v2.execute_trigger_actions(
  trigger_id uuid,
  event_data jsonb
)
RETURNS TABLE (
  action_id uuid,
  action_type text,
  status text,
  result jsonb,
  error_message text
) AS $$
DECLARE
  trigger_record RECORD;
  action_record jsonb;
  action_index integer;
  action_result jsonb;
  action_status text;
  action_error text;
BEGIN
  -- Get trigger
  SELECT * INTO trigger_record
  FROM v2.triggers
  WHERE id = execute_trigger_actions.trigger_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Execute each action
  FOR action_index IN 0..jsonb_array_length(trigger_record.actions)-1 LOOP
    action_record := trigger_record.actions->action_index;
    action_status := 'pending';
    action_result := '{}'::jsonb;
    action_error := NULL;
    
    BEGIN
      -- Execute action based on type
      IF action_record->>'type' = 'create_item' THEN
        -- Create item action
        INSERT INTO v2.items (
          app_id, item_type, title, description, data,
          created_by, account_id
        )
        VALUES (
          trigger_record.app_id,
          action_record->>'item_type',
          action_record->>'title',
          action_record->>'description',
          COALESCE(action_record->'data', event_data),
          NULL, -- system action
          trigger_record.account_id
        )
        RETURNING id INTO action_result;
        
        action_status := 'completed';
        
      ELSIF action_record->>'type' = 'send_notification' THEN
        -- Send notification action
        action_result := jsonb_build_object(
          'notification_sent', true,
          'message', action_record->>'message'
        );
        action_status := 'completed';
        
      ELSIF action_record->>'type' = 'update_item' THEN
        -- Update item action
        UPDATE v2.items
        SET 
          data = COALESCE(action_record->'data', data),
          updated_at = now()
        WHERE id = (action_record->>'item_id')::uuid
        AND account_id = trigger_record.account_id
        RETURNING id INTO action_result;
        
        action_status := 'completed';
        
      ELSIF action_record->>'type' = 'create_thread' THEN
        -- Create thread action
        INSERT INTO v2.threads (
          app_id, target_type, target_id, title, description,
          created_by, account_id
        )
        VALUES (
          trigger_record.app_id,
          action_record->>'target_type',
          (action_record->>'target_id')::uuid,
          action_record->>'title',
          action_record->>'description',
          NULL, -- system action
          trigger_record.account_id
        )
        RETURNING id INTO action_result;
        
        action_status := 'completed';
        
      ELSIF action_record->>'type' = 'webhook' THEN
        -- Webhook action (placeholder)
        action_result := jsonb_build_object(
          'webhook_url', action_record->>'url',
          'status', 'not_implemented'
        );
        action_status := 'failed';
        action_error := 'Webhook actions not yet implemented';
        
      ELSE
        action_status := 'failed';
        action_error := 'Unknown action type: ' || action_record->>'type';
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        action_status := 'failed';
        action_error := SQLERRM;
    END;
    
    -- Return result for this action
    RETURN QUERY SELECT 
      gen_random_uuid() as action_id,
      action_record->>'type' as action_type,
      action_status as status,
      action_result as result,
      action_error as error_message;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get trigger execution history
CREATE OR REPLACE FUNCTION v2.get_trigger_executions(
  trigger_id uuid,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  execution_id uuid,
  event_type text,
  triggered_at timestamptz,
  conditions_met boolean,
  actions_executed bigint,
  actions_successful bigint,
  actions_failed bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as execution_id,
    e.event_type,
    e.triggered_at,
    e.conditions_met,
    e.actions_executed,
    e.actions_successful,
    e.actions_failed
  FROM v2.trigger_executions e
  WHERE e.trigger_id = get_trigger_executions.trigger_id
  ORDER BY e.triggered_at DESC
  LIMIT get_trigger_executions.limit
  OFFSET get_trigger_executions.offset;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.triggers IS 'Event-based automation triggers';
COMMENT ON FUNCTION v2.get_triggers_by_event(text, uuid, uuid, boolean) IS 'Get triggers by event type';
COMMENT ON FUNCTION v2.create_trigger(uuid, text, text, text, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create a new trigger';
COMMENT ON FUNCTION v2.update_trigger(uuid, text, text, jsonb, jsonb, jsonb) IS 'Update trigger configuration';
COMMENT ON FUNCTION v2.toggle_trigger(uuid, boolean) IS 'Activate or deactivate trigger';
COMMENT ON FUNCTION v2.evaluate_trigger_conditions(uuid, jsonb) IS 'Evaluate trigger conditions against event data';
COMMENT ON FUNCTION v2.execute_trigger_actions(uuid, jsonb) IS 'Execute trigger actions';
COMMENT ON FUNCTION v2.get_trigger_executions(uuid, integer, integer) IS 'Get trigger execution history';
