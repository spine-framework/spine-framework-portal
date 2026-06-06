-- API Keys table for Spine v2
-- API key authentication and management

CREATE TABLE v2.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES v2.integrations(id) ON DELETE SET NULL,
  name text NOT NULL,
  key_value text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  key_type text NOT NULL CHECK (key_type IN ('public', 'private', 'secret', 'webhook')),
  permissions jsonb DEFAULT '{}',
  rate_limit integer DEFAULT 1000, -- requests per hour
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  last_used_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (key_value IS NOT NULL AND LENGTH(key_value) >= 32),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Indexes
CREATE INDEX idx_api_keys_integration_id ON v2.api_keys(integration_id);
CREATE INDEX idx_api_keys_key_value ON v2.api_keys(key_value);
CREATE INDEX idx_api_keys_key_prefix ON v2.api_keys(key_prefix);
CREATE INDEX idx_api_keys_key_type ON v2.api_keys(key_type);
CREATE INDEX idx_api_keys_active ON v2.api_keys(is_active);
CREATE INDEX idx_api_keys_expires_at ON v2.api_keys(expires_at);
CREATE INDEX idx_api_keys_last_used ON v2.api_keys(last_used_at);
CREATE INDEX idx_api_keys_created_by ON v2.api_keys(created_by);
CREATE INDEX idx_api_keys_account ON v2.api_keys(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_api_keys_permissions_gin ON v2.api_keys USING gin(permissions);
CREATE INDEX idx_api_keys_metadata_gin ON v2.api_keys USING gin(metadata);

-- API Key Usage Logs table
CREATE TABLE v2.api_key_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES v2.api_keys(id) ON DELETE CASCADE,
  request_method text,
  request_path text,
  request_ip text,
  user_agent text,
  response_status integer,
  response_size integer,
  duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for api_key_usage_logs
CREATE INDEX idx_api_key_usage_logs_api_key_id ON v2.api_key_usage_logs(api_key_id);
CREATE INDEX idx_api_key_usage_logs_response_status ON v2.api_key_usage_logs(response_status);
CREATE INDEX idx_api_key_usage_logs_success ON v2.api_key_usage_logs(success);
CREATE INDEX idx_api_key_usage_logs_created_at ON v2.api_key_usage_logs(created_at);
CREATE INDEX idx_api_key_usage_logs_account ON v2.api_key_usage_logs(account_id);

-- Function to generate API key
CREATE OR REPLACE FUNCTION v2.generate_api_key(
  key_type text DEFAULT 'private',
  key_prefix text DEFAULT 'sk_'
)
RETURNS text AS $$
DECLARE
  random_part text;
  full_key text;
BEGIN
  -- Generate 32 random characters
  random_part := encode(gen_random_bytes(32), 'base64');
  -- Remove URL-unsafe characters
  random_part := regexp_replace(random_part, '[+/=]', '', 'g');
  -- Ensure minimum length
  random_part := substr(random_part, 1, 32);
  
  -- Combine prefix with random part
  full_key := key_prefix || random_part;
  
  RETURN full_key;
END;
$$ LANGUAGE plpgsql;

-- Function to create API key
CREATE OR REPLACE FUNCTION v2.create_api_key(
  integration_id uuid DEFAULT NULL,
  name text,
  key_type text DEFAULT 'private',
  key_prefix text DEFAULT 'sk_',
  permissions jsonb DEFAULT '{}',
  rate_limit integer DEFAULT 1000,
  expires_at timestamptz DEFAULT NULL,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS TABLE (
  api_key_id uuid,
  api_key_value text
) AS $$
DECLARE
  api_key_id uuid;
  api_key_value text;
BEGIN
  -- Validate key type
  IF key_type NOT IN ('public', 'private', 'secret', 'webhook') THEN
    RAISE EXCEPTION 'Invalid key type';
  END IF;
  
  -- Generate API key
  SELECT v2.generate_api_key(key_type, key_prefix) INTO api_key_value;
  
  -- Insert API key
  INSERT INTO v2.api_keys (
    integration_id, name, key_value, key_prefix, key_type,
    permissions, rate_limit, expires_at, metadata, created_by, account_id
  )
  VALUES (
    integration_id, name, api_key_value, key_prefix, key_type,
    permissions, rate_limit, expires_at, metadata, created_by, account_id
  )
  RETURNING id INTO api_key_id;
  
  RETURN QUERY SELECT api_key_id, api_key_value;
END;
$$ LANGUAGE plpgsql;

-- Function to validate API key
CREATE OR REPLACE FUNCTION v2.validate_api_key(
  key_value text,
  required_permissions jsonb DEFAULT '{}'
)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  key_type text,
  permissions jsonb,
  rate_limit integer,
  expires_at timestamptz,
  error_message text
) AS $$
DECLARE
  key_record RECORD;
  key_valid boolean;
  validation_error text;
  has_permissions boolean;
BEGIN
  -- Get API key
  SELECT * INTO key_record
  FROM v2.api_keys
  WHERE key_value = validate_api_key.key_value
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, '{}'::jsonb, NULL::integer, NULL::timestamptz, 'Invalid or inactive API key'::text;
    RETURN;
  END IF;
  
  key_valid := true;
  validation_error := NULL;
  
  -- Check expiration
  IF key_record.expires_at IS NOT NULL AND key_record.expires_at <= now() THEN
    key_valid := false;
    validation_error := 'API key expired';
  END IF;
  
  -- Check rate limit (simplified - would need proper rate limiting in production)
  IF key_record.rate_limit > 0 AND key_record.usage_count >= key_record.rate_limit THEN
    key_valid := false;
    validation_error := 'Rate limit exceeded';
  END IF;
  
  -- Check permissions if required
  has_permissions := true;
  IF required_permissions IS NOT NULL AND jsonb_array_length(required_permissions) > 0 THEN
    -- Simplified permission check - in production would be more sophisticated
    IF key_record.permissions IS NULL OR jsonb_array_length(key_record.permissions) = 0 THEN
      has_permissions := false;
      validation_error := 'Insufficient permissions';
    END IF;
  END IF;
  
  -- Update usage count and last used timestamp
  IF key_valid AND has_permissions THEN
    UPDATE v2.api_keys
    SET 
      usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
    WHERE id = key_record.id;
  END IF;
  
  RETURN QUERY SELECT 
    (key_valid AND has_permissions) as is_valid,
    key_record.id as api_key_id,
    key_record.key_type,
    key_record.permissions,
    key_record.rate_limit,
    key_record.expires_at,
    validation_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to log API key usage
CREATE OR REPLACE FUNCTION v2.log_api_key_usage(
  api_key_id uuid,
  request_method text DEFAULT NULL,
  request_path text DEFAULT NULL,
  request_ip text DEFAULT NULL,
  user_agent text DEFAULT NULL,
  response_status integer DEFAULT NULL,
  response_size integer DEFAULT NULL,
  duration_ms integer DEFAULT NULL,
  success boolean DEFAULT true,
  error_message text DEFAULT NULL,
  metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  usage_log_id uuid;
  key_record RECORD;
BEGIN
  -- Get API key to get account_id
  SELECT * INTO key_record
  FROM v2.api_keys
  WHERE id = api_key_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
  
  -- Insert usage log
  INSERT INTO v2.api_key_usage_logs (
    api_key_id, request_method, request_path, request_ip, user_agent,
    response_status, response_size, duration_ms, success, error_message,
    metadata, account_id
  )
  VALUES (
    api_key_id, request_method, request_path, request_ip, user_agent,
    response_status, response_size, duration_ms, success, error_message,
    metadata, key_record.account_id
  )
  RETURNING id INTO usage_log_id;
  
  RETURN usage_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to rotate API key
CREATE OR REPLACE FUNCTION v2.rotate_api_key(
  api_key_id uuid,
  keep_old_key boolean DEFAULT false
)
RETURNS TABLE (
  new_api_key_value text,
  old_api_key_deactivated boolean
) AS $$
DECLARE
  key_record RECORD;
  new_key_value text;
  old_deactivated boolean;
BEGIN
  -- Get existing API key
  SELECT * INTO key_record
  FROM v2.api_keys
  WHERE id = rotate_api_key.api_key_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'API key not found';
  END IF;
  
  -- Generate new key
  SELECT v2.generate_api_key(key_record.key_type, key_record.key_prefix) INTO new_key_value;
  
  -- Update with new key
  UPDATE v2.api_keys
  SET 
    key_value = new_key_value,
    usage_count = 0,
    last_used_at = NULL,
    updated_at = now()
  WHERE id = api_key_id;
  
  old_deactivated := NOT keep_old_key;
  
  RETURN QUERY SELECT new_key_value, old_deactivated;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke API key
CREATE OR REPLACE FUNCTION v2.revoke_api_key(
  api_key_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.api_keys
  SET 
    is_active = false,
    updated_at = now()
  WHERE id = revoke_api_key.api_key_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get API key statistics
CREATE OR REPLACE FUNCTION v2.get_api_key_statistics(
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  api_key_id uuid,
  api_key_name text,
  key_type text,
  total_requests bigint,
  successful_requests bigint,
  failed_requests bigint,
  avg_response_time_ms numeric,
  last_used_at timestamptz,
  rate_limit_usage_percent numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.id as api_key_id,
    ak.name as api_key_name,
    ak.key_type,
    COALESCE(usage_stats.total_requests, 0) as total_requests,
    COALESCE(usage_stats.successful_requests, 0) as successful_requests,
    COALESCE(usage_stats.failed_requests, 0) as failed_requests,
    usage_stats.avg_response_time_ms,
    ak.last_used_at,
    CASE 
      WHEN ak.rate_limit > 0 THEN (ak.usage_count::numeric / ak.rate_limit * 100)
      ELSE 0
    END as rate_limit_usage_percent
  FROM v2.api_keys ak
  LEFT JOIN (
    SELECT 
      api_key_id,
      COUNT(*) as total_requests,
      COUNT(*) FILTER (WHERE success = true) as successful_requests,
      COUNT(*) FILTER (WHERE success = false) as failed_requests,
      AVG(duration_ms) as avg_response_time_ms
    FROM v2.api_key_usage_logs
    WHERE (date_from IS NULL OR created_at >= date_from)
    AND (date_to IS NULL OR created_at <= date_to)
    GROUP BY api_key_id
  ) usage_stats ON ak.id = usage_stats.api_key_id
  WHERE (account_id IS NULL OR ak.account_id = get_api_key_statistics.account_id)
  ORDER BY total_requests DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old API key usage logs
CREATE OR REPLACE FUNCTION v2.cleanup_api_key_usage_logs(
  days_to_keep integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.api_key_usage_logs
  WHERE created_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to deactivate expired API keys
CREATE OR REPLACE FUNCTION v2.deactivate_expired_api_keys()
RETURNS integer AS $$
DECLARE
  deactivated_count integer;
BEGIN
  UPDATE v2.api_keys
  SET 
    is_active = false,
    updated_at = now()
  WHERE is_active = true
  AND expires_at IS NOT NULL
  AND expires_at <= now();
  
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  RETURN deactivated_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.api_keys IS 'API key authentication and management';
COMMENT ON TABLE v2.api_key_usage_logs IS 'API key usage tracking and analytics';
COMMENT ON FUNCTION v2.generate_api_key(text, text) IS 'Generate API key';
COMMENT ON FUNCTION v2.create_api_key(uuid, text, text, text, jsonb, integer, timestamptz, jsonb, uuid, uuid) IS 'Create API key';
COMMENT ON FUNCTION v2.validate_api_key(text, jsonb) IS 'Validate API key';
COMMENT ON FUNCTION v2.log_api_key_usage(uuid, text, text, text, text, integer, integer, integer, boolean, text, jsonb) IS 'Log API key usage';
COMMENT ON FUNCTION v2.rotate_api_key(uuid, boolean) IS 'Rotate API key';
COMMENT ON FUNCTION v2.revoke_api_key(uuid) IS 'Revoke API key';
COMMENT ON FUNCTION v2.get_api_key_statistics(uuid, timestamptz, timestamptz) IS 'Get API key statistics';
COMMENT ON FUNCTION v2.cleanup_api_key_usage_logs(integer) IS 'Cleanup old API key usage logs';
COMMENT ON FUNCTION v2.deactivate_expired_api_keys() IS 'Deactivate expired API keys';
