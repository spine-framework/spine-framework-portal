-- Webhooks table for Spine v2
-- External webhook endpoints and configurations

CREATE TABLE v2.webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  url text NOT NULL,
  method text NOT NULL DEFAULT 'POST' CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  headers jsonb DEFAULT '{}',
  secret_key text,
  signature_algorithm text DEFAULT 'sha256' CHECK (signature_algorithm IN ('sha256', 'sha1', 'md5')),
  timeout_seconds integer DEFAULT 30 CHECK (timeout_seconds > 0),
  retry_policy jsonb DEFAULT '{"max_retries": 3, "backoff_factor": 2}',
  is_active boolean NOT NULL DEFAULT true,
  event_filters jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (url ~ '^https?://'),
  CHECK (signature_algorithm IS NOT NULL OR secret_key IS NULL)
);

-- Indexes
CREATE INDEX idx_webhooks_app_id ON v2.webhooks(app_id);
CREATE INDEX idx_webhooks_method ON v2.webhooks(method);
CREATE INDEX idx_webhooks_active ON v2.webhooks(is_active);
CREATE INDEX idx_webhooks_created_by ON v2.webhooks(created_by);
CREATE INDEX idx_webhooks_account ON v2.webhooks(account_id);
CREATE INDEX idx_webhooks_created_at ON v2.webhooks(created_at);

-- GIN indexes for JSONB
CREATE INDEX idx_webhooks_headers_gin ON v2.webhooks USING gin(headers);
CREATE INDEX idx_webhooks_retry_policy_gin ON v2.webhooks USING gin(retry_policy);
CREATE INDEX idx_webhooks_event_filters_gin ON v2.webhooks USING gin(event_filters);

-- Webhook Deliveries table
CREATE TABLE v2.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES v2.webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb DEFAULT '{}',
  request_headers jsonb DEFAULT '{}',
  request_body text,
  response_status integer,
  response_headers jsonb DEFAULT '{}',
  response_body text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'delivered', 'failed', 'cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (sent_at IS NULL OR status IN ('sending', 'delivered', 'failed', 'cancelled')),
  CHECK (completed_at IS NULL OR status IN ('delivered', 'failed', 'cancelled')),
  CHECK (attempt_count >= 0 AND attempt_count <= max_attempts)
);

-- Indexes for webhook_deliveries
CREATE INDEX idx_webhook_deliveries_webhook_id ON v2.webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_event_type ON v2.webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_status ON v2.webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_scheduled ON v2.webhook_deliveries(scheduled_at);
CREATE INDEX idx_webhook_deliveries_sent ON v2.webhook_deliveries(sent_at);
CREATE INDEX idx_webhook_deliveries_completed ON v2.webhook_deliveries(completed_at);
CREATE INDEX idx_webhook_deliveries_account ON v2.webhook_deliveries(account_id);

-- Composite indexes
CREATE INDEX idx_webhook_deliveries_status_scheduled ON v2.webhook_deliveries(status, scheduled_at) WHERE status IN ('pending', 'sending');
CREATE INDEX idx_webhook_deliveries_webhook_status ON v2.webhook_deliveries(webhook_id, status);

-- Function to create webhook
CREATE OR REPLACE FUNCTION v2.create_webhook(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  url text,
  method text DEFAULT 'POST',
  headers jsonb DEFAULT '{}',
  secret_key text DEFAULT NULL,
  signature_algorithm text DEFAULT 'sha256',
  timeout_seconds integer DEFAULT 30,
  retry_policy jsonb DEFAULT '{"max_retries": 3, "backoff_factor": 2}',
  event_filters jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  webhook_id uuid;
BEGIN
  -- Validate URL
  IF url NOT ~ '^https?://' THEN
    RAISE EXCEPTION 'Invalid URL format';
  END IF;
  
  -- Validate signature algorithm
  IF signature_algorithm IS NOT NULL AND secret_key IS NULL THEN
    RAISE EXCEPTION 'Secret key required for signature algorithm';
  END IF;
  
  -- Insert webhook
  INSERT INTO v2.webhooks (
    app_id, name, description, url, method, headers,
    secret_key, signature_algorithm, timeout_seconds, retry_policy,
    event_filters, metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, url, method, headers,
    secret_key, signature_algorithm, timeout_seconds, retry_policy,
    event_filters, metadata, created_by, account_id
  )
  RETURNING id INTO webhook_id;
  
  RETURN webhook_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update webhook
CREATE OR REPLACE FUNCTION v2.update_webhook(
  webhook_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  url text DEFAULT NULL,
  method text DEFAULT NULL,
  headers jsonb DEFAULT NULL,
  secret_key text DEFAULT NULL,
  signature_algorithm text DEFAULT NULL,
  timeout_seconds integer DEFAULT NULL,
  retry_policy jsonb DEFAULT NULL,
  event_filters jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  -- Validate URL if provided
  IF url IS NOT NULL AND url NOT ~ '^https?://' THEN
    RAISE EXCEPTION 'Invalid URL format';
  END IF;
  
  -- Validate signature algorithm if provided
  IF signature_algorithm IS NOT NULL AND secret_key IS NULL THEN
    RAISE EXCEPTION 'Secret key required for signature algorithm';
  END IF;
  
  UPDATE v2.webhooks
  SET 
    name = COALESCE(update_webhook.name, name),
    description = COALESCE(update_webhook.description, description),
    url = COALESCE(update_webhook.url, url),
    method = COALESCE(update_webhook.method, method),
    headers = COALESCE(update_webhook.headers, headers),
    secret_key = COALESCE(update_webhook.secret_key, secret_key),
    signature_algorithm = COALESCE(update_webhook.signature_algorithm, signature_algorithm),
    timeout_seconds = COALESCE(update_webhook.timeout_seconds, timeout_seconds),
    retry_policy = COALESCE(update_webhook.retry_policy, retry_policy),
    event_filters = COALESCE(update_webhook.event_filters, event_filters),
    metadata = COALESCE(update_webhook.metadata, metadata),
    updated_at = now()
  WHERE id = update_webhook.webhook_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to toggle webhook
CREATE OR REPLACE FUNCTION v2.toggle_webhook(
  webhook_id uuid,
  is_active boolean
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.webhooks
  SET 
    is_active = is_active,
    updated_at = now()
  WHERE id = toggle_webhook.webhook_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get webhooks for event
CREATE OR REPLACE FUNCTION v2.get_webhooks_for_event(
  event_type text,
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  name text,
  url text,
  method text,
  headers jsonb,
  secret_key text,
  signature_algorithm text,
  timeout_seconds integer,
  retry_policy jsonb,
  event_filters jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.app_id,
    w.name,
    w.url,
    w.method,
    w.headers,
    w.secret_key,
    w.signature_algorithm,
    w.timeout_seconds,
    w.retry_policy,
    w.event_filters
  FROM v2.webhooks w
  WHERE w.is_active = true
  AND w.account_id = get_webhooks_for_event.account_id
  AND (app_id IS NULL OR w.app_id = get_webhooks_for_event.app_id)
  AND (
    -- No event filters means all events
    jsonb_array_length(w.event_filters) = 0
    OR event_type = ANY (SELECT value FROM jsonb_array_elements_text(w.event_filters))
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create webhook delivery
CREATE OR REPLACE FUNCTION v2.create_webhook_delivery(
  webhook_id uuid,
  event_type text,
  event_data jsonb DEFAULT '{}',
  scheduled_at timestamptz DEFAULT now()
)
RETURNS uuid AS $$
DECLARE
  delivery_id uuid;
  webhook_record RECORD;
BEGIN
  -- Get webhook configuration
  SELECT * INTO webhook_record
  FROM v2.webhooks
  WHERE id = create_webhook_delivery.webhook_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook not found or inactive';
  END IF;
  
  -- Create delivery record
  INSERT INTO v2.webhook_deliveries (
    webhook_id, event_type, event_data, scheduled_at,
    max_attempts, account_id
  )
  VALUES (
    webhook_id, event_type, event_data, scheduled_at,
    (webhook_record.retry_policy->>'max_retries')::integer,
    webhook_record.account_id
  )
  RETURNING id INTO delivery_id;
  
  RETURN delivery_id;
END;
$$ LANGUAGE plpgsql;

-- Function to deliver webhook
CREATE OR REPLACE FUNCTION v2.deliver_webhook(
  delivery_id uuid
)
RETURNS TABLE (
  success boolean,
  response_status integer,
  response_body text,
  error_message text
) AS $$
DECLARE
  delivery_record RECORD;
  webhook_record RECORD;
  request_body text;
  request_headers jsonb;
  response_status integer;
  response_body text;
  response_headers jsonb;
  delivery_success boolean;
  delivery_error text;
  start_time timestamptz;
  end_time timestamptz;
BEGIN
  -- Get delivery and webhook
  SELECT d.*, w.* INTO delivery_record, webhook_record
  FROM v2.webhook_deliveries d
  JOIN v2.webhooks w ON d.webhook_id = w.id
  WHERE d.id = deliver_webhook.delivery_id
  AND d.status = 'pending'
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::integer, NULL::text, 'Delivery not found or not pending'::text;
    RETURN;
  END IF;
  
  -- Mark as sending
  UPDATE v2.webhook_deliveries
  SET 
    status = 'sending',
    sent_at = now(),
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = delivery_id;
  
  delivery_success := false;
  response_status := NULL;
  response_body := NULL;
  response_headers := '{}'::jsonb;
  delivery_error := NULL;
  start_time := clock_timestamp();
  
  BEGIN
    -- Prepare request
    request_body := jsonb_pretty(delivery_record.event_data);
    request_headers := webhook_record.headers;
    
    -- Add signature if secret key exists
    IF webhook_record.secret_key IS NOT NULL THEN
      -- This is a placeholder - actual signature generation would be done in application layer
      request_headers := jsonb_set(
        request_headers,
        '{X-Spine-Signature}',
        to_jsonb('sha256=' || encode(digest(request_body, 'sha256'), 'hex'))
      );
    END IF;
    
    -- Add standard headers
    request_headers := jsonb_set(
      request_headers,
      '{Content-Type}',
      to_jsonb('application/json')
    );
    
    request_headers := jsonb_set(
      request_headers,
      '{User-Agent}',
      to_jsonb('Spine-Webhook/2.0')
    );
    
    -- Simulate webhook delivery (placeholder)
    -- In production, this would make an actual HTTP request
    response_status := 200;
    response_body := '{"status": "delivered", "message": "Webhook delivered successfully"}';
    response_headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Request-ID', gen_random_uuid()::text
    );
    delivery_success := true;
    
  EXCEPTION
    WHEN OTHERS THEN
      delivery_success := false;
      delivery_error := SQLERRM;
      response_status := 500;
      response_body := '{"error": "' || delivery_error || '"}';
  END;
  
  end_time := clock_timestamp();
  
  -- Update delivery record
  IF delivery_success THEN
    UPDATE v2.webhook_deliveries
    SET 
      status = 'delivered',
      response_status = response_status,
      response_headers = response_headers,
      response_body = response_body,
      request_headers = request_headers,
      request_body = request_body,
      completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer,
      updated_at = now()
    WHERE id = delivery_id;
  ELSE
    UPDATE v2.webhook_deliveries
    SET 
      status = CASE 
        WHEN attempt_count >= max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      response_status = response_status,
      response_headers = response_headers,
      response_body = response_body,
      request_headers = request_headers,
      request_body = request_body,
      error_message = delivery_error,
      completed_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE NULL END,
      duration_ms = EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer,
      updated_at = now()
    WHERE id = delivery_id;
  END IF;
  
  RETURN QUERY SELECT 
    delivery_success as success,
    response_status,
    response_body,
    delivery_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to get webhook statistics
CREATE OR REPLACE FUNCTION v2.get_webhook_statistics(
  webhook_id uuid DEFAULT NULL,
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  webhook_id uuid,
  webhook_name text,
  total_deliveries bigint,
  pending_deliveries bigint,
  sending_deliveries bigint,
  delivered_deliveries bigint,
  failed_deliveries bigint,
  cancelled_deliveries bigint,
  avg_response_time_ms numeric,
  success_rate numeric,
  last_delivery_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wd.webhook_id,
    w.name as webhook_name,
    COUNT(*) as total_deliveries,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_deliveries,
    COUNT(*) FILTER (WHERE status = 'sending') as sending_deliveries,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_deliveries,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_deliveries,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_deliveries,
    AVG(duration_ms) FILTER (WHERE status = 'delivered' AND duration_ms IS NOT NULL) as avg_response_time_ms,
    CASE 
      WHEN COUNT(*) FILTER (WHERE status IN ('delivered', 'failed')) > 0 THEN 
        COUNT(*) FILTER (WHERE status = 'delivered')::numeric / COUNT(*) FILTER (WHERE status IN ('delivered', 'failed')) * 100
      ELSE 0
    END as success_rate,
    MAX(completed_at) as last_delivery_at
  FROM v2.webhook_deliveries wd
  JOIN v2.webhooks w ON wd.webhook_id = w.id
  WHERE (webhook_id IS NULL OR wd.webhook_id = get_webhook_statistics.webhook_id)
  AND (account_id IS NULL OR wd.account_id = get_webhook_statistics.account_id)
  AND (date_from IS NULL OR wd.created_at >= get_webhook_statistics.date_from)
  AND (date_to IS NULL OR wd.created_at <= get_webhook_statistics.date_to)
  GROUP BY wd.webhook_id, w.name
  ORDER BY total_deliveries DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old webhook deliveries
CREATE OR REPLACE FUNCTION v2.cleanup_webhook_deliveries(
  days_to_keep integer DEFAULT 30,
  status_filter text DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.webhook_deliveries
  WHERE created_at < cutoff_date
  AND completed_at IS NOT NULL
  AND (status_filter IS NULL OR status = status_filter);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.webhooks IS 'External webhook endpoints and configurations';
COMMENT ON TABLE v2.webhook_deliveries IS 'Webhook delivery attempts and results';
COMMENT ON FUNCTION v2.create_webhook(uuid, text, text, text, text, jsonb, text, text, integer, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create webhook';
COMMENT ON FUNCTION v2.update_webhook(uuid, text, text, text, text, jsonb, text, text, integer, jsonb, jsonb, jsonb) IS 'Update webhook';
COMMENT ON FUNCTION v2.toggle_webhook(uuid, boolean) IS 'Toggle webhook active status';
COMMENT ON FUNCTION v2.get_webhooks_for_event(text, uuid, uuid) IS 'Get webhooks for event';
COMMENT ON FUNCTION v2.create_webhook_delivery(uuid, text, jsonb, timestamptz) IS 'Create webhook delivery';
COMMENT ON FUNCTION v2.deliver_webhook(uuid) IS 'Deliver webhook';
COMMENT ON FUNCTION v2.get_webhook_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get webhook statistics';
COMMENT ON FUNCTION v2.cleanup_webhook_deliveries(integer, text) IS 'Cleanup old webhook deliveries';
