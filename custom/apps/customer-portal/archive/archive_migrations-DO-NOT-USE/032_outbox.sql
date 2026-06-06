-- Outbox table for Spine v2
-- Reliable event delivery pattern

CREATE TABLE v2.outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  destination_type text NOT NULL CHECK (destination_type IN ('webhook', 'queue', 'topic', 'function')),
  destination_config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'cancelled')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  error_message text,
  response_data jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (sent_at IS NULL OR status IN ('processing', 'delivered', 'failed', 'cancelled')),
  CHECK (delivered_at IS NULL OR status IN ('delivered', 'failed', 'cancelled')),
  CHECK (retry_count >= 0 AND retry_count <= max_retries)
);

-- Indexes
CREATE INDEX idx_outbox_app_id ON v2.outbox(app_id);
CREATE INDEX idx_outbox_event_type ON v2.outbox(event_type);
CREATE INDEX idx_outbox_destination_type ON v2.outbox(destination_type);
CREATE INDEX idx_outbox_status ON v2.outbox(status);
CREATE INDEX idx_outbox_priority ON v2.outbox(priority DESC);
CREATE INDEX idx_outbox_scheduled ON v2.outbox(scheduled_at);
CREATE INDEX idx_outbox_sent ON v2.outbox(sent_at);
CREATE INDEX idx_outbox_delivered ON v2.outbox(delivered_at);
CREATE INDEX idx_outbox_account ON v2.outbox(account_id);

-- Composite indexes for efficient querying
CREATE INDEX idx_outbox_status_scheduled ON v2.outbox(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_outbox_account_status ON v2.outbox(account_id, status);
CREATE INDEX idx_outbox_priority_status ON v2.outbox(priority DESC, status) WHERE status IN ('pending', 'processing');

-- GIN indexes for JSONB
CREATE INDEX idx_outbox_event_data_gin ON v2.outbox USING gin(event_data);
CREATE INDEX idx_outbox_destination_config_gin ON v2.outbox USING gin(destination_config);
CREATE INDEX idx_outbox_response_data_gin ON v2.outbox USING gin(response_data);

-- Function to create outbox event
CREATE OR REPLACE FUNCTION v2.create_outbox_event(
  app_id uuid,
  event_type text,
  event_data jsonb DEFAULT '{}',
  destination_type text,
  destination_config jsonb DEFAULT '{}',
  priority integer DEFAULT 0,
  scheduled_at timestamptz DEFAULT now(),
  max_retries integer DEFAULT 3,
  metadata jsonb DEFAULT '{}',
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  outbox_id uuid;
BEGIN
  -- Validate destination type
  IF destination_type NOT IN ('webhook', 'queue', 'topic', 'function') THEN
    RAISE EXCEPTION 'Invalid destination type';
  END IF;
  
  -- Insert outbox event
  INSERT INTO v2.outbox (
    app_id, event_type, event_data, destination_type, destination_config,
    priority, scheduled_at, max_retries, metadata, account_id
  )
  VALUES (
    app_id, event_type, event_data, destination_type, destination_config,
    priority, scheduled_at, max_retries, metadata, account_id
  )
  RETURNING id INTO outbox_id;
  
  RETURN outbox_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending outbox events
CREATE OR REPLACE FUNCTION v2.get_pending_outbox_events(
  account_id uuid DEFAULT NULL,
  destination_type text DEFAULT NULL,
  event_type text DEFAULT NULL,
  limit integer DEFAULT 100,
  priority_filter integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  event_type text,
  event_data jsonb,
  destination_type text,
  destination_config jsonb,
  priority integer,
  status text,
  scheduled_at timestamptz,
  retry_count integer,
  max_retries integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.app_id,
    o.event_type,
    o.event_data,
    o.destination_type,
    o.destination_config,
    o.priority,
    o.status,
    o.scheduled_at,
    o.retry_count,
    o.max_retries
  FROM v2.outbox o
  WHERE o.status = 'pending'
  AND o.scheduled_at <= now()
  AND (account_id IS NULL OR o.account_id = get_pending_outbox_events.account_id)
  AND (destination_type IS NULL OR o.destination_type = get_pending_outbox_events.destination_type)
  AND (event_type IS NULL OR o.event_type = get_pending_outbox_events.event_type)
  AND (priority_filter IS NULL OR o.priority >= priority_filter)
  ORDER BY o.priority DESC, o.scheduled_at ASC
  LIMIT get_pending_outbox_events.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to send outbox event
CREATE OR REPLACE FUNCTION v2.send_outbox_event(
  event_id uuid
)
RETURNS TABLE (
  success boolean,
  response_data jsonb,
  error_message text
) AS $$
DECLARE
  event_record RECORD;
  delivery_result jsonb;
  delivery_error text;
  delivery_success boolean;
BEGIN
  -- Get and lock the event
  SELECT * INTO event_record
  FROM v2.outbox
  WHERE id = send_outbox_event.event_id
  AND status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '{}'::jsonb, 'Event not found or not pending'::text;
    RETURN;
  END IF;
  
  -- Mark as processing
  UPDATE v2.outbox
  SET 
    status = 'processing',
    sent_at = now(),
    updated_at = now()
  WHERE id = event_id;
  
  delivery_success := false;
  delivery_result := '{}'::jsonb;
  delivery_error := NULL;
  
  BEGIN
    -- Send based on destination type
    IF event_record.destination_type = 'webhook' THEN
      -- Webhook delivery (placeholder)
      delivery_result := jsonb_build_object(
        'webhook_url', event_record.destination_config->>'url',
        'method', event_record.destination_config->>'method',
        'status', 'delivered'
      );
      delivery_success := true;
      
    ELSIF event_record.destination_type = 'queue' THEN
      -- Queue delivery (placeholder)
      delivery_result := jsonb_build_object(
        'queue_name', event_record.destination_config->>'queue_name',
        'message_id', gen_random_uuid(),
        'status', 'queued'
      );
      delivery_success := true;
      
    ELSIF event_record.destination_type = 'topic' THEN
      -- Topic delivery (placeholder)
      delivery_result := jsonb_build_object(
        'topic_name', event_record.destination_config->>'topic_name',
        'subscribers_notified', 1,
        'status', 'published'
      );
      delivery_success := true;
      
    ELSIF event_record.destination_type = 'function' THEN
      -- Function delivery (placeholder)
      delivery_result := jsonb_build_object(
        'function_name', event_record.destination_config->>'function_name',
        'execution_id', gen_random_uuid(),
        'status', 'executed'
      );
      delivery_success := true;
      
    ELSE
      delivery_success := false;
      delivery_error := 'Unknown destination type: ' || event_record.destination_type;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      delivery_success := false;
      delivery_error := SQLERRM;
  END;
  
  -- Update event record
  IF delivery_success THEN
    UPDATE v2.outbox
    SET 
      status = 'delivered',
      delivered_at = now(),
      response_data = delivery_result,
      updated_at = now()
    WHERE id = event_id;
  ELSE
    UPDATE v2.outbox
    SET 
      status = CASE 
        WHEN retry_count >= max_retries THEN 'failed'
        ELSE 'pending'
      END,
      retry_count = retry_count + 1,
      error_message = delivery_error,
      delivered_at = CASE WHEN retry_count >= max_retries THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = event_id;
  END IF;
  
  RETURN QUERY SELECT 
    delivery_success as success,
    delivery_result as response_data,
    delivery_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to retry failed outbox events
CREATE OR REPLACE FUNCTION v2.retry_failed_outbox_events(
  account_id uuid DEFAULT NULL,
  destination_type text DEFAULT NULL,
  hours_back integer DEFAULT 1
)
RETURNS TABLE (
  retried_count integer
) AS $$
DECLARE
  retried_count integer;
BEGIN
  UPDATE v2.outbox
  SET 
    status = 'pending',
    retry_count = 0,
    error_message = NULL,
    updated_at = now()
  WHERE status = 'failed'
  AND account_id = retry_failed_outbox_events.account_id
  AND (destination_type IS NULL OR destination_type = retry_failed_outbox_events.destination_type)
  AND updated_at >= now() - (hours_back || ' hours')::interval;
  
  GET DIAGNOSTICS retried_count = ROW_COUNT;
  RETURN QUERY SELECT retried_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel pending outbox events
CREATE OR REPLACE FUNCTION v2.cancel_pending_outbox_events(
  account_id uuid DEFAULT NULL,
  destination_type text DEFAULT NULL,
  event_type text DEFAULT NULL
)
RETURNS TABLE (
  cancelled_count integer
) AS $$
DECLARE
  cancelled_count integer;
BEGIN
  UPDATE v2.outbox
  SET 
    status = 'cancelled',
    delivered_at = now(),
    updated_at = now()
  WHERE status = 'pending'
  AND account_id = cancel_pending_outbox_events.account_id
  AND (destination_type IS NULL OR destination_type = cancel_pending_outbox_events.destination_type)
  AND (event_type IS NULL OR event_type = cancel_pending_outbox_events.event_type);
  
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  RETURN QUERY SELECT cancelled_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get outbox statistics
CREATE OR REPLACE FUNCTION v2.get_outbox_statistics(
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  destination_type text,
  event_type text,
  total_events bigint,
  pending_events bigint,
  processing_events bigint,
  delivered_events bigint,
  failed_events bigint,
  cancelled_events bigint,
  avg_delivery_time_seconds numeric,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    destination_type,
    event_type,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_events,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_events,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_events,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_events,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_events,
    AVG(EXTRACT(EPOCH FROM (delivered_at - sent_at))) FILTER (WHERE status = 'delivered' AND sent_at IS NOT NULL) as avg_delivery_time_seconds,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('delivered', 'failed')) > 0 THEN 
        COUNT(*) FILTER (WHERE status = 'delivered')::numeric / COUNT(*) FILTER (WHERE status IN ('delivered', 'failed')) * 100
      ELSE 0
    END as success_rate
  FROM v2.outbox
  WHERE (account_id IS NULL OR account_id = get_outbox_statistics.account_id)
  AND (date_from IS NULL OR created_at >= get_outbox_statistics.date_from)
  AND (date_to IS NULL OR created_at <= get_outbox_statistics.date_to)
  GROUP BY destination_type, event_type
  ORDER BY total_events DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old outbox events
CREATE OR REPLACE FUNCTION v2.cleanup_outbox_events(
  days_to_keep integer DEFAULT 30,
  status_filter text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.outbox
  WHERE created_at < cutoff_date
  AND delivered_at IS NOT NULL
  AND (status_filter IS NULL OR status = status_filter);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to publish event to outbox (helper for other tables)
CREATE OR REPLACE FUNCTION v2.publish_event(
  event_type text,
  event_data jsonb DEFAULT '{}',
  destination_type text DEFAULT 'webhook',
  destination_config jsonb DEFAULT '{}',
  app_id uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  outbox_id uuid;
BEGIN
  outbox_id := v2.create_outbox_event(
    app_id,
    event_type,
    event_data,
    destination_type,
    destination_config,
    0, -- default priority
    now(), -- send immediately
    3, -- default max retries
    '{}', -- default metadata
    account_id
  );
  
  RETURN outbox_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.outbox IS 'Reliable event delivery pattern';
COMMENT ON FUNCTION v2.create_outbox_event(uuid, text, jsonb, text, jsonb, integer, timestamptz, integer, jsonb, uuid) IS 'Create outbox event';
COMMENT ON FUNCTION v2.get_pending_outbox_events(uuid, text, text, integer, integer) IS 'Get pending outbox events';
COMMENT ON FUNCTION v2.send_outbox_event(uuid) IS 'Send outbox event';
COMMENT ON FUNCTION v2.retry_failed_outbox_events(uuid, text, integer) IS 'Retry failed outbox events';
COMMENT ON FUNCTION v2.cancel_pending_outbox_events(uuid, text, text) IS 'Cancel pending outbox events';
COMMENT ON FUNCTION v2.get_outbox_statistics(uuid, timestamptz, timestamptz) IS 'Get outbox statistics';
COMMENT ON FUNCTION v2.cleanup_outbox_events(integer, text) IS 'Cleanup old outbox events';
COMMENT ON FUNCTION v2.publish_event(text, jsonb, text, jsonb, uuid, uuid) IS 'Publish event to outbox';
