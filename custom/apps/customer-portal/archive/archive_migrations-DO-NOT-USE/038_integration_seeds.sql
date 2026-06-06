-- Seed data and functions for integrations in Spine v2
-- Default integration providers and helper functions

-- Integration Providers table
CREATE TABLE v2.integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  integration_type text NOT NULL,
  auth_type text NOT NULL CHECK (auth_type IN ('oauth', 'api_key', 'basic', 'none')),
  config_schema jsonb DEFAULT '{}',
  default_config jsonb DEFAULT '{}',
  supported_features jsonb DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_integration_providers_type ON v2.integration_providers(integration_type);
CREATE INDEX idx_integration_providers_auth_type ON v2.integration_providers(auth_type);
CREATE INDEX idx_integration_providers_active ON v2.integration_providers(is_active);

-- Insert common integration providers
INSERT INTO v2.integration_providers (name, display_name, description, integration_type, auth_type, config_schema, default_config, supported_features) VALUES
('github', 'GitHub', 'Git repository hosting and collaboration', 'oauth', 'oauth', 
 '{"required": ["client_id", "client_secret"], "optional": ["scope", "webhook_secret"]}',
 '{"scope": "repo,user"}',
 '["webhooks", "api", "repositories", "issues", "pull_requests"]'),

('slack', 'Slack', 'Team communication and collaboration', 'oauth', 'oauth',
 '{"required": ["client_id", "client_secret"], "optional": ["scope", "signing_secret"]}',
 '{"scope": "channels:read,chat:write,users:read"}',
 '["webhooks", "api", "messaging", "channels", "users"]'),

('google_drive', 'Google Drive', 'Cloud file storage and collaboration', 'oauth', 'oauth',
 '{"required": ["client_id", "client_secret"], "optional": ["scope"]}',
 '{"scope": "drive.readonly,drive.file"}',
 '["api", "files", "folders", "sharing"]'),

('salesforce', 'Salesforce', 'Customer relationship management', 'oauth', 'oauth',
 '{"required": ["client_id", "client_secret"], "optional": ["instance_url", "api_version"]}',
 '{"api_version": "v58.0"}',
 '["api", "objects", "queries", "webhooks"]'),

('stripe', 'Stripe', 'Payment processing and financial services', 'api_key', 'api_key',
 '{"required": ["api_key"], "optional": ["webhook_secret"]}',
 '{}',
 '["api", "payments", "webhooks", "customers"]'),

('sendgrid', 'SendGrid', 'Email delivery and marketing', 'api_key', 'api_key',
 '{"required": ["api_key"], "optional": ["webhook_secret"]}',
 '{}',
 '["api", "email", "webhooks", "analytics"]'),

('twilio', 'Twilio', 'SMS and voice communication', 'api_key', 'api_key',
 '{"required": ["account_sid", "auth_token"], "optional": ["phone_number"]}',
 '{}',
 '["api", "sms", "voice", "webhooks"]'),

('aws_s3', 'AWS S3', 'Cloud object storage', 'api_key', 'basic',
 '{"required": ["access_key_id", "secret_access_key", "region", "bucket"]}',
 '{}',
 '["api", "files", "folders", "permissions"]'),

('postgres', 'PostgreSQL', 'Database server', 'database', 'basic',
 '{"required": ["host", "port", "database", "username", "password"], "optional": ["sslmode"]}',
 '{"port": 5432, "sslmode": "prefer"}',
 '["api", "query", "tables", "rows"]'),

('mysql', 'MySQL', 'Database server', 'database', 'basic',
 '{"required": ["host", "port", "database", "username", "password"], "optional": ["ssl"]}',
 '{"port": 3306}',
 '["api", "query", "tables", "rows"]'),

('webhook_generic', 'Generic Webhook', 'Custom webhook endpoint', 'webhook', 'none',
 '{"required": ["url"], "optional": ["headers", "method", "timeout"]}',
 '{"method": "POST", "timeout": 30}',
 '["webhooks", "events", "data"]');

-- Function to get integration providers
CREATE OR REPLACE FUNCTION v2.get_integration_providers(
  integration_type text DEFAULT NULL,
  auth_type text DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  name text,
  display_name text,
  description text,
  integration_type text,
  auth_type text,
  config_schema jsonb,
  default_config jsonb,
  supported_features jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ip.id,
    ip.name,
    ip.display_name,
    ip.description,
    ip.integration_type,
    ip.auth_type,
    ip.config_schema,
    ip.default_config,
    ip.supported_features
  FROM v2.integration_providers ip
  WHERE (integration_type IS NULL OR ip.integration_type = get_integration_providers.integration_type)
  AND (auth_type IS NULL OR ip.auth_type = get_integration_providers.auth_type)
  AND (include_inactive = true OR ip.is_active = true)
  ORDER BY ip.display_name;
END;
$$ LANGUAGE plpgsql;

-- Function to create integration from provider
CREATE OR REPLACE FUNCTION v2.create_integration_from_provider(
  provider_name text,
  app_id uuid DEFAULT NULL,
  name text DEFAULT NULL,
  config jsonb DEFAULT '{}',
  credentials jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  provider_record RECORD;
  integration_id uuid;
  final_config jsonb;
  final_credentials jsonb;
BEGIN
  -- Get provider
  SELECT * INTO provider_record
  FROM v2.integration_providers
  WHERE name = create_integration_from_provider.provider_name
  AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider not found or inactive: %', provider_name;
  END IF;
  
  -- Merge with default config
  final_config := jsonb_build_object();
  IF provider_record.default_config IS NOT NULL THEN
    final_config := provider_record.default_config;
  END IF;
  IF config IS NOT NULL AND jsonb_typeof(config) = 'object' THEN
    final_config := final_config || config;
  END IF;
  
  -- Create integration
  SELECT v2.create_integration(
    app_id,
    COALESCE(name, provider_record.display_name),
    provider_record.description,
    provider_record.integration_type,
    provider_name,
    NULL, -- version
    final_config,
    credentials,
    metadata,
    created_by,
    account_id
  ) INTO integration_id;
  
  RETURN integration_id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate integration config
CREATE OR REPLACE FUNCTION v2.validate_integration_config(
  integration_id uuid
)
RETURNS TABLE (
  is_valid boolean,
  validation_errors jsonb,
  missing_fields jsonb
) AS $$
DECLARE
  integration_record RECORD;
  provider_record RECORD;
  required_fields jsonb;
  missing_fields jsonb;
  validation_errors jsonb;
  config_valid boolean;
BEGIN
  -- Get integration
  SELECT * INTO integration_record
  FROM v2.integrations
  WHERE id = validate_integration_config.integration_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '["Integration not found"]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;
  
  -- Get provider
  SELECT * INTO provider_record
  FROM v2.integration_providers
  WHERE name = integration_record.provider
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '["Provider not found"]'::jsonb, '[]'::jsonb;
    RETURN;
  END IF;
  
  config_valid := true;
  validation_errors := '[]'::jsonb;
  missing_fields := '[]'::jsonb;
  
  -- Check required fields
  IF provider_record.config_schema ? 'required' THEN
    required_fields := provider_record.config_schema->'required';
    
    -- Check each required field
    FOR field IN SELECT value FROM jsonb_array_elements_text(required_fields) LOOP
      IF NOT (integration_record.config ? field) THEN
        config_valid := false;
        missing_fields := jsonb_array_append(missing_fields, to_jsonb(field));
      END IF;
    END LOOP;
  END IF;
  
  -- Additional validation based on integration type
  IF integration_record.integration_type = 'database' THEN
    -- Validate database connection parameters
    IF NOT (integration_record.config ? 'host' AND integration_record.config ? 'database') THEN
      config_valid := false;
      validation_errors := jsonb_array_append(validation_errors, to_jsonb('Database host and database are required'));
    END IF;
    
  ELSIF integration_record.integration_type = 'webhook' THEN
    -- Validate webhook URL
    IF NOT (integration_record.config ? 'url') THEN
      config_valid := false;
      validation_errors := jsonb_array_append(validation_errors, to_jsonb('Webhook URL is required'));
    ELSIF (integration_record.config->>'url') NOT ~ '^https?://' THEN
      config_valid := false;
      validation_errors := jsonb_array_append(validation_errors, to_jsonb('Invalid webhook URL format'));
    END IF;
  END IF;
  
  RETURN QUERY SELECT 
    config_valid as is_valid,
    validation_errors as validation_errors,
    missing_fields as missing_fields;
END;
$$ LANGUAGE plpgsql;

-- Function to sync all integrations
CREATE OR REPLACE FUNCTION v2.sync_all_integrations(
  account_id uuid DEFAULT NULL,
  integration_type text DEFAULT NULL
)
RETURNS TABLE (
  integration_id uuid,
  integration_name text,
  sync_status text,
  sync_id uuid
) AS $$
DECLARE
  integration_record RECORD;
  sync_result RECORD;
BEGIN
  -- Get all active integrations
  FOR integration_record IN 
    SELECT * FROM v2.integrations
    WHERE is_active = true
    AND is_configured = true
    AND (account_id IS NULL OR account_id = sync_all_integrations.account_id)
    AND (integration_type IS NULL OR integration_type = sync_all_integrations.integration_type)
  LOOP
    -- Trigger sync
    FOR sync_result IN 
      SELECT * FROM v2.sync_integration(integration_record.id, 'manual')
    LOOP
      RETURN QUERY SELECT 
        integration_record.id as integration_id,
        integration_record.name as integration_name,
        sync_result.status as sync_status,
        sync_result.sync_id as sync_id;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get integration health metrics
CREATE OR REPLACE FUNCTION v2.get_integration_health_metrics(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  metric_type text,
  metric_name text,
  value numeric,
  status text,
  details jsonb
) AS $$
BEGIN
  -- Integration count metrics
  RETURN QUERY SELECT 
    'integrations' as metric_type,
    'total_integrations' as metric_name,
    COUNT(*)::numeric as value,
    CASE WHEN COUNT(*) > 0 THEN 'healthy' ELSE 'none' END as status,
    '{}'::jsonb as details
  FROM v2.integrations
  WHERE (account_id IS NULL OR account_id = get_integration_health_metrics.account_id);
  
  RETURN QUERY SELECT 
    'integrations' as metric_type,
    'active_integrations' as metric_name,
    COUNT(*) FILTER (WHERE is_active = true)::numeric as value,
    CASE WHEN COUNT(*) FILTER (WHERE is_active = true) > 0 THEN 'healthy' ELSE 'warning' END as status,
    '{}'::jsonb as details
  FROM v2.integrations
  WHERE (account_id IS NULL OR account_id = get_integration_health_metrics.account_id);
  
  RETURN QUERY SELECT 
    'integrations' as metric_type,
    'configured_integrations' as metric_name,
    COUNT(*) FILTER (WHERE is_configured = true)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'critical'
      WHEN COUNT(*) FILTER (WHERE is_configured = true) = COUNT(*) THEN 'healthy'
      ELSE 'warning'
    END as status,
    '{}'::jsonb as details
  FROM v2.integrations
  WHERE (account_id IS NULL OR account_id = get_integration_health_metrics.account_id)
  AND is_active = true;
  
  -- Sync status metrics
  RETURN QUERY SELECT 
    'syncs' as metric_type,
    'failed_syncs_24h' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 5) as details
  FROM v2.integration_sync_logs
  WHERE (account_id IS NULL OR account_id = get_integration_health_metrics.account_id)
  AND status = 'failed'
  AND started_at >= now() - '24 hours'::interval;
  
  -- OAuth metrics
  RETURN QUERY SELECT 
    'oauth' as metric_type,
    'expired_tokens' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 3 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 3) as details
  FROM v2.oauth_connections oc
  JOIN v2.integrations i ON oc.integration_id = i.id
  WHERE (account_id IS NULL OR i.account_id = get_integration_health_metrics.account_id)
  AND oc.is_active = true
  AND oc.expires_at IS NOT NULL
  AND oc.expires_at <= now();
  
  -- API key metrics
  RETURN QUERY SELECT 
    'api_keys' as metric_type,
    'expiring_keys_7d' as metric_name,
    COUNT(*)::numeric as value,
    CASE 
      WHEN COUNT(*) = 0 THEN 'healthy'
      WHEN COUNT(*) < 5 THEN 'warning'
      ELSE 'critical'
    END as status,
    jsonb_build_object('threshold', 5) as details
  FROM v2.api_keys
  WHERE (account_id IS NULL OR account_id = get_integration_health_metrics.account_id)
  AND is_active = true
  AND expires_at IS NOT NULL
  AND expires_at <= now() + '7 days'::interval;
END;
$$ LANGUAGE plpgsql;

-- Function to create webhook integration
CREATE OR REPLACE FUNCTION v2.create_webhook_integration(
  name text,
  url text,
  app_id uuid DEFAULT NULL,
  headers jsonb DEFAULT '{}',
  method text DEFAULT 'POST',
  timeout integer DEFAULT 30,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  integration_id uuid;
  webhook_id uuid;
BEGIN
  -- Create integration
  SELECT v2.create_integration_from_provider(
    'webhook_generic',
    app_id,
    name,
    jsonb_build_object(
      'url', url,
      'headers', headers,
      'method', method,
      'timeout', timeout
    ),
    '{}',
    metadata,
    created_by,
    account_id
  ) INTO integration_id;
  
  -- Create webhook for this integration
  SELECT v2.create_webhook(
    app_id,
    name || ' Webhook',
    'Webhook for ' || name,
    url,
    method,
    headers,
    NULL, -- secret key
    'sha256',
    timeout,
    '{"max_retries": 3, "backoff_factor": 2}',
    '[]', -- event filters
    metadata,
    created_by,
    account_id
  ) INTO webhook_id;
  
  RETURN integration_id;
END;
$$ LANGUAGE plpgsql;

-- Function to enable/disable all integrations for account
CREATE OR REPLACE FUNCTION v2.toggle_account_integrations(
  account_id uuid,
  is_active boolean
)
RETURNS TABLE (
  integration_type text,
  disabled_count bigint,
  enabled_count bigint
) AS $$
BEGIN
  -- Update integrations
  UPDATE v2.integrations
  SET is_active = toggle_account_integrations.is_active
  WHERE account_id = toggle_account_integrations.account_id;
  
  RETURN QUERY SELECT 
    integration_type,
    COUNT(*) FILTER (WHERE is_active = false) as disabled_count,
    COUNT(*) FILTER (WHERE is_active = true) as enabled_count
  FROM v2.integrations
  WHERE account_id = toggle_account_integrations.account_id
  GROUP BY integration_type;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.integration_providers IS 'Integration provider definitions';
COMMENT ON FUNCTION v2.get_integration_providers(text, text, boolean) IS 'Get integration providers';
COMMENT ON FUNCTION v2.create_integration_from_provider(text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create integration from provider';
COMMENT ON FUNCTION v2.validate_integration_config(uuid) IS 'Validate integration configuration';
COMMENT ON FUNCTION v2.sync_all_integrations(uuid, text) IS 'Sync all integrations';
COMMENT ON FUNCTION v2.get_integration_health_metrics(uuid) IS 'Get integration health metrics';
COMMENT ON FUNCTION v2.create_webhook_integration(text, text, uuid, jsonb, text, integer, jsonb, uuid, uuid) IS 'Create webhook integration';
COMMENT ON FUNCTION v2.toggle_account_integrations(uuid, boolean) IS 'Enable/disable all integrations for account';
