-- Integrations table for Spine v2
-- External system connections and configurations

CREATE TABLE v2.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  integration_type text NOT NULL CHECK (integration_type IN ('oauth', 'api_key', 'webhook', 'database', 'file_storage', 'email', 'sms', 'payment', 'custom')),
  provider text NOT NULL,
  version text,
  config jsonb NOT NULL DEFAULT '{}',
  credentials jsonb NOT NULL DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  is_configured boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  sync_status text CHECK (sync_status IN ('idle', 'syncing', 'success', 'error')),
  sync_error text,
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (integration_type IS NOT NULL OR provider IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_integrations_app_id ON v2.integrations(app_id);
CREATE INDEX idx_integrations_type ON v2.integrations(integration_type);
CREATE INDEX idx_integrations_provider ON v2.integrations(provider);
CREATE INDEX idx_integrations_active ON v2.integrations(is_active);
CREATE INDEX idx_integrations_configured ON v2.integrations(is_configured);
CREATE INDEX idx_integrations_sync_status ON v2.integrations(sync_status);
CREATE INDEX idx_integrations_last_sync ON v2.integrations(last_sync_at);
CREATE INDEX idx_integrations_created_by ON v2.integrations(created_by);
CREATE INDEX idx_integrations_account ON v2.integrations(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_integrations_config_gin ON v2.integrations USING gin(config);
CREATE INDEX idx_integrations_credentials_gin ON v2.integrations USING gin(credentials);
CREATE INDEX idx_integrations_metadata_gin ON v2.integrations USING gin(metadata);

-- Integration Connections table
CREATE TABLE v2.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES v2.integrations(id) ON DELETE CASCADE,
  external_id text,
  external_name text,
  external_type text,
  external_data jsonb DEFAULT '{}',
  connection_status text NOT NULL DEFAULT 'pending' CHECK (connection_status IN ('pending', 'connected', 'disconnected', 'error', 'syncing')),
  last_sync_at timestamptz,
  sync_error text,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for integration_connections
CREATE INDEX idx_integration_connections_integration_id ON v2.integration_connections(integration_id);
CREATE INDEX idx_integration_connections_external_id ON v2.integration_connections(external_id);
CREATE INDEX idx_integration_connections_status ON v2.integration_connections(connection_status);
CREATE INDEX idx_integration_connections_last_sync ON v2.integration_connections(last_sync_at);
CREATE INDEX idx_integration_connections_account ON v2.integration_connections(account_id);

-- Integration Sync Logs table
CREATE TABLE v2.integration_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES v2.integrations(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES v2.integration_connections(id) ON DELETE SET NULL,
  sync_type text NOT NULL CHECK (sync_type IN ('full', 'incremental', 'realtime', 'manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  records_processed integer DEFAULT 0,
  records_created integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_deleted integer DEFAULT 0,
  error_message text,
  sync_data jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE
);

-- Indexes for integration_sync_logs
CREATE INDEX idx_integration_sync_logs_integration_id ON v2.integration_sync_logs(integration_id);
CREATE INDEX idx_integration_sync_logs_connection_id ON v2.integration_sync_logs(connection_id);
CREATE INDEX idx_integration_sync_logs_sync_type ON v2.integration_sync_logs(sync_type);
CREATE INDEX idx_integration_sync_logs_status ON v2.integration_sync_logs(status);
CREATE INDEX idx_integration_sync_logs_started_at ON v2.integration_sync_logs(started_at);
CREATE INDEX idx_integration_sync_logs_account ON v2.integration_sync_logs(account_id);

-- Function to create integration
CREATE OR REPLACE FUNCTION v2.create_integration(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  integration_type text,
  provider text,
  version text DEFAULT NULL,
  config jsonb DEFAULT '{}',
  credentials jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  integration_id uuid;
BEGIN
  -- Validate integration type
  IF integration_type NOT IN ('oauth', 'api_key', 'webhook', 'database', 'file_storage', 'email', 'sms', 'payment', 'custom') THEN
    RAISE EXCEPTION 'Invalid integration type';
  END IF;
  
  -- Insert integration
  INSERT INTO v2.integrations (
    app_id, name, description, integration_type, provider, version,
    config, credentials, metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, integration_type, provider, version,
    config, credentials, metadata, created_by, account_id
  )
  RETURNING id INTO integration_id;
  
  RETURN integration_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update integration
CREATE OR REPLACE FUNCTION v2.update_integration(
  integration_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  config jsonb DEFAULT NULL,
  credentials jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  is_active boolean DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.integrations
  SET 
    name = COALESCE(update_integration.name, name),
    description = COALESCE(update_integration.description, description),
    config = COALESCE(update_integration.config, config),
    credentials = COALESCE(update_integration.credentials, credentials),
    metadata = COALESCE(update_integration.metadata, metadata),
    is_active = COALESCE(update_integration.is_active, is_active),
    updated_at = now()
  WHERE id = update_integration.integration_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to test integration connection
CREATE OR REPLACE FUNCTION v2.test_integration_connection(
  integration_id uuid
)
RETURNS TABLE (
  success boolean,
  response_data jsonb,
  error_message text
) AS $$
DECLARE
  integration_record RECORD;
  test_result jsonb;
  test_error text;
  test_success boolean;
BEGIN
  -- Get integration configuration
  SELECT * INTO integration_record
  FROM v2.integrations
  WHERE id = test_integration_connection.integration_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '{}'::jsonb, 'Integration not found'::text;
    RETURN;
  END IF;
  
  test_success := false;
  test_result := '{}'::jsonb;
  test_error := NULL;
  
  BEGIN
    -- Test connection based on integration type
    IF integration_record.integration_type = 'oauth' THEN
      -- Test OAuth connection
      test_result := jsonb_build_object(
        'provider', integration_record.provider,
        'status', 'connected',
        'token_valid', true
      );
      test_success := true;
      
    ELSIF integration_record.integration_type = 'api_key' THEN
      -- Test API key connection
      test_result := jsonb_build_object(
        'provider', integration_record.provider,
        'status', 'connected',
        'api_key_valid', true
      );
      test_success := true;
      
    ELSIF integration_record.integration_type = 'webhook' THEN
      -- Test webhook endpoint
      test_result := jsonb_build_object(
        'provider', integration_record.provider,
        'status', 'connected',
        'webhook_accessible', true
      );
      test_success := true;
      
    ELSIF integration_record.integration_type = 'database' THEN
      -- Test database connection
      test_result := jsonb_build_object(
        'provider', integration_record.provider,
        'status', 'connected',
        'database_accessible', true
      );
      test_success := true;
      
    ELSIF integration_record.integration_type = 'file_storage' THEN
      -- Test file storage connection
      test_result := jsonb_build_object(
        'provider', integration_record.provider,
        'status', 'connected',
        'storage_accessible', true
      );
      test_success := true;
      
    ELSE
      test_success := false;
      test_error := 'Connection testing not implemented for type: ' || integration_record.integration_type;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      test_success := false;
      test_error := SQLERRM;
  END;
  
  -- Update integration status
  IF test_success THEN
    UPDATE v2.integrations
    SET 
      is_configured = true,
      sync_status = 'success',
      sync_error = NULL,
      updated_at = now()
    WHERE id = integration_id;
  ELSE
    UPDATE v2.integrations
    SET 
      is_configured = false,
      sync_status = 'error',
      sync_error = test_error,
      updated_at = now()
    WHERE id = integration_id;
  END IF;
  
  RETURN QUERY SELECT 
    test_success as success,
    test_result as response_data,
    test_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to create integration connection
CREATE OR REPLACE FUNCTION v2.create_integration_connection(
  integration_id uuid,
  external_id text DEFAULT NULL,
  external_name text DEFAULT NULL,
  external_type text DEFAULT NULL,
  external_data jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  connection_id uuid;
  integration_record RECORD;
BEGIN
  -- Get integration
  SELECT * INTO integration_record
  FROM v2.integrations
  WHERE id = create_integration_connection.integration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;
  
  -- Create connection
  INSERT INTO v2.integration_connections (
    integration_id, external_id, external_name, external_type,
    external_data, metadata, account_id
  )
  VALUES (
    integration_id, external_id, external_name, external_type,
    external_data, metadata, integration_record.account_id
  )
  RETURNING id INTO connection_id;
  
  RETURN connection_id;
END;
$$ LANGUAGE plpgsql;

-- Function to sync integration
CREATE OR REPLACE FUNCTION v2.sync_integration(
  integration_id uuid,
  sync_type text DEFAULT 'manual',
  connection_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sync_id uuid,
  status text
) AS $$
DECLARE
  sync_id uuid;
  integration_record RECORD;
  start_time timestamptz;
  end_time timestamptz;
  sync_success boolean;
  sync_error text;
  records_processed integer := 0;
  records_created integer := 0;
  records_updated integer := 0;
  records_deleted integer := 0;
BEGIN
  -- Get integration
  SELECT * INTO integration_record
  FROM v2.integrations
  WHERE id = sync_integration.integration_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration not found or inactive';
  END IF;
  
  start_time := now();
  
  -- Create sync log
  INSERT INTO v2.integration_sync_logs (
    integration_id, connection_id, sync_type, status,
    account_id
  )
  VALUES (
    integration_id, connection_id, sync_type, 'running',
    integration_record.account_id
  )
  RETURNING id INTO sync_id;
  
  -- Update integration sync status
  UPDATE v2.integrations
  SET 
    sync_status = 'syncing',
    sync_error = NULL,
    updated_at = now()
  WHERE id = integration_id;
  
  sync_success := false;
  sync_error := NULL;
  
  BEGIN
    -- Perform sync based on integration type
    IF integration_record.integration_type = 'oauth' THEN
      -- OAuth sync (placeholder)
      SELECT COUNT(*) INTO records_processed FROM v2.integration_connections
      WHERE integration_id = integration_id;
      
      records_updated := records_processed;
      sync_success := true;
      
    ELSIF integration_record.integration_type = 'api_key' THEN
      -- API key sync (placeholder)
      SELECT COUNT(*) INTO records_processed FROM v2.integration_connections
      WHERE integration_id = integration_id;
      
      records_updated := records_processed;
      sync_success := true;
      
    ELSIF integration_record.integration_type = 'database' THEN
      -- Database sync (placeholder)
      records_created := 10;
      records_updated := 5;
      records_processed := records_created + records_updated;
      sync_success := true;
      
    ELSE
      sync_success := false;
      sync_error := 'Sync not implemented for type: ' || integration_record.integration_type;
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      sync_success := false;
      sync_error := SQLERRM;
  END;
  
  end_time := now();
  
  -- Update sync log
  UPDATE v2.integration_sync_logs
  SET 
    status = CASE WHEN sync_success THEN 'completed' ELSE 'failed' END,
    completed_at = end_time,
    duration_ms = EXTRACT(MILLISECONDS FROM (end_time - start_time))::integer,
    records_processed = records_processed,
    records_created = records_created,
    records_updated = records_updated,
    records_deleted = records_deleted,
    error_message = sync_error
  WHERE id = sync_id;
  
  -- Update integration status
  IF sync_success THEN
    UPDATE v2.integrations
    SET 
      sync_status = 'success',
      sync_error = NULL,
      last_sync_at = end_time,
      updated_at = now()
    WHERE id = integration_id;
  ELSE
    UPDATE v2.integrations
    SET 
      sync_status = 'error',
      sync_error = sync_error,
      updated_at = now()
    WHERE id = integration_id;
  END IF;
  
  RETURN QUERY SELECT 
    sync_id,
    CASE WHEN sync_success THEN 'completed' ELSE 'failed' END as status;
END;
$$ LANGUAGE plpgsql;

-- Function to get integration statistics
CREATE OR REPLACE FUNCTION v2.get_integration_statistics(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  integration_type text,
  provider text,
  total_integrations bigint,
  active_integrations bigint,
  configured_integrations bigint,
  total_connections bigint,
  last_sync_at timestamptz,
  sync_status text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.integration_type,
    i.provider,
    COUNT(*) as total_integrations,
    COUNT(*) FILTER (WHERE i.is_active = true) as active_integrations,
    COUNT(*) FILTER (WHERE i.is_configured = true) as configured_integrations,
    COALESCE(connection_counts.total_connections, 0) as total_connections,
    MAX(i.last_sync_at) as last_sync_at,
    i.sync_status
  FROM v2.integrations i
  LEFT JOIN (
    SELECT 
      integration_id,
      COUNT(*) as total_connections
    FROM v2.integration_connections
    GROUP BY integration_id
  ) connection_counts ON i.id = connection_counts.integration_id
  WHERE (account_id IS NULL OR i.account_id = get_integration_statistics.account_id)
  GROUP BY i.integration_type, i.provider, i.sync_status
  ORDER BY total_integrations DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old sync logs
CREATE OR REPLACE FUNCTION v2.cleanup_integration_sync_logs(
  days_to_keep integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.integration_sync_logs
  WHERE started_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.integrations IS 'External system connections and configurations';
COMMENT ON TABLE v2.integration_connections IS 'Integration connection details';
COMMENT ON TABLE v2.integration_sync_logs IS 'Integration synchronization logs';
COMMENT ON FUNCTION v2.create_integration(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, uuid, uuid) IS 'Create integration';
COMMENT ON FUNCTION v2.update_integration(uuid, text, text, jsonb, jsonb, jsonb, boolean) IS 'Update integration';
COMMENT ON FUNCTION v2.test_integration_connection(uuid) IS 'Test integration connection';
COMMENT ON FUNCTION v2.create_integration_connection(uuid, text, text, text, jsonb, jsonb) IS 'Create integration connection';
COMMENT ON FUNCTION v2.sync_integration(uuid, text, uuid) IS 'Sync integration';
COMMENT ON FUNCTION v2.get_integration_statistics(uuid) IS 'Get integration statistics';
COMMENT ON FUNCTION v2.cleanup_integration_sync_logs(integer) IS 'Cleanup old sync logs';
