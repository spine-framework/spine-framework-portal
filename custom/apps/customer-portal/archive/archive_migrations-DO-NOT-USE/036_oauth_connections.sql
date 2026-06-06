-- OAuth Connections table for Spine v2
-- OAuth authentication tokens and refresh logic

CREATE TABLE v2.oauth_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES v2.integrations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  client_id text NOT NULL,
  client_secret text,
  access_token text NOT NULL,
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz,
  scope text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (access_token IS NOT NULL),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Indexes
CREATE INDEX idx_oauth_connections_integration_id ON v2.oauth_connections(integration_id);
CREATE INDEX idx_oauth_connections_user_id ON v2.oauth_connections(user_id);
CREATE INDEX idx_oauth_connections_client_id ON v2.oauth_connections(client_id);
CREATE INDEX idx_oauth_connections_active ON v2.oauth_connections(is_active);
CREATE INDEX idx_oauth_connections_expires_at ON v2.oauth_connections(expires_at);
CREATE INDEX idx_oauth_connections_last_used ON v2.oauth_connections(last_used_at);
CREATE INDEX idx_oauth_connections_account ON v2.oauth_connections(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_oauth_connections_metadata_gin ON v2.oauth_connections USING gin(metadata);

-- OAuth Scopes table
CREATE TABLE v2.oauth_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES v2.integrations(id) ON DELETE CASCADE,
  scope_name text NOT NULL,
  scope_description text,
  is_required boolean NOT NULL DEFAULT false,
  is_granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  granted_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(integration_id, scope_name)
);

-- Indexes for oauth_scopes
CREATE INDEX idx_oauth_scopes_integration_id ON v2.oauth_scopes(integration_id);
CREATE INDEX idx_oauth_scopes_scope_name ON v2.oauth_scopes(scope_name);
CREATE INDEX idx_oauth_scopes_granted ON v2.oauth_scopes(is_granted);
CREATE INDEX idx_oauth_scopes_account ON v2.oauth_scopes(account_id);

-- Function to create OAuth connection
CREATE OR REPLACE FUNCTION v2.create_oauth_connection(
  integration_id uuid,
  user_id uuid DEFAULT NULL,
  client_id text,
  client_secret text DEFAULT NULL,
  access_token text,
  refresh_token text DEFAULT NULL,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz DEFAULT NULL,
  scope text DEFAULT NULL,
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
  WHERE id = create_oauth_connection.integration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;
  
  -- Create OAuth connection
  INSERT INTO v2.oauth_connections (
    integration_id, user_id, client_id, client_secret,
    access_token, refresh_token, token_type, expires_at,
    scope, metadata, account_id
  )
  VALUES (
    integration_id, user_id, client_id, client_secret,
    access_token, refresh_token, token_type, expires_at,
    scope, metadata, integration_record.account_id
  )
  RETURNING id INTO connection_id;
  
  -- Update integration status
  UPDATE v2.integrations
  SET 
    is_configured = true,
    sync_status = 'success',
    updated_at = now()
  WHERE id = integration_id;
  
  RETURN connection_id;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh OAuth token
CREATE OR REPLACE FUNCTION v2.refresh_oauth_token(
  connection_id uuid
)
RETURNS TABLE (
  success boolean,
  new_access_token text,
  new_expires_at timestamptz,
  error_message text
) AS $$
DECLARE
  connection_record RECORD;
  integration_record RECORD;
  new_access_token text;
  new_refresh_token text;
  new_expires_at timestamptz;
  refresh_success boolean;
  refresh_error text;
BEGIN
  -- Get connection and integration
  SELECT c.*, i.* INTO connection_record, integration_record
  FROM v2.oauth_connections c
  JOIN v2.integrations i ON c.integration_id = i.id
  WHERE c.id = refresh_oauth_token.connection_id
  AND c.is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz, 'Connection not found or inactive'::text;
    RETURN;
  END IF;
  
  -- Check if refresh token is available
  IF connection_record.refresh_token IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz, 'No refresh token available'::text;
    RETURN;
  END IF;
  
  refresh_success := false;
  new_access_token := NULL;
  new_refresh_token := NULL;
  new_expires_at := NULL;
  refresh_error := NULL;
  
  BEGIN
    -- Simulate token refresh (placeholder)
    -- In production, this would make an actual OAuth token refresh request
    new_access_token := 'refreshed_access_token_' || gen_random_uuid()::text;
    new_refresh_token := connection_record.refresh_token; -- Keep same refresh token
    new_expires_at := now() + '1 hour'::interval;
    refresh_success := true;
    
  EXCEPTION
    WHEN OTHERS THEN
      refresh_success := false;
      refresh_error := SQLERRM;
  END;
  
  -- Update connection if successful
  IF refresh_success THEN
    UPDATE v2.oauth_connections
    SET 
      access_token = new_access_token,
      refresh_token = new_refresh_token,
      expires_at = new_expires_at,
      updated_at = now()
    WHERE id = connection_id;
  ELSE
    -- Deactivate connection on refresh failure
    UPDATE v2.oauth_connections
    SET 
      is_active = false,
      updated_at = now()
    WHERE id = connection_id;
  END IF;
  
  RETURN QUERY SELECT 
    refresh_success as success,
    new_access_token,
    new_expires_at,
    refresh_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to validate OAuth token
CREATE OR REPLACE FUNCTION v2.validate_oauth_token(
  connection_id uuid
)
RETURNS TABLE (
  is_valid boolean,
  expires_in_seconds integer,
  needs_refresh boolean,
  error_message text
) AS $$
DECLARE
  connection_record RECORD;
  token_valid boolean;
  expires_in integer;
  needs_refresh boolean;
  validation_error text;
BEGIN
  -- Get connection
  SELECT * INTO connection_record
  FROM v2.oauth_connections
  WHERE id = validate_oauth_token.connection_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::integer, true, 'Connection not found or inactive'::text;
    RETURN;
  END IF;
  
  token_valid := true;
  expires_in := NULL;
  needs_refresh := false;
  validation_error := NULL;
  
  -- Check token expiration
  IF connection_record.expires_at IS NOT NULL THEN
    expires_in := EXTRACT(EPOCH FROM (connection_record.expires_at - now()))::integer;
    
    IF expires_in <= 0 THEN
      token_valid := false;
      needs_refresh := true;
      validation_error := 'Token expired';
    ELSIF expires_in < 300 THEN -- Less than 5 minutes
      needs_refresh := true;
    END IF;
  END IF;
  
  -- Update last used timestamp
  UPDATE v2.oauth_connections
  SET 
    last_used_at = now(),
    updated_at = now()
  WHERE id = connection_id;
  
  RETURN QUERY SELECT 
    token_valid as is_valid,
    expires_in,
    needs_refresh,
    validation_error as error_message;
END;
$$ LANGUAGE plpgsql;

-- Function to get OAuth connection
CREATE OR REPLACE FUNCTION v2_get_oauth_connection(
  connection_id uuid
)
RETURNS TABLE (
  id uuid,
  integration_id uuid,
  user_id uuid,
  client_id text,
  token_type text,
  scope text,
  is_active boolean,
  expires_at timestamptz,
  last_used_at timestamptz,
  is_valid boolean,
  needs_refresh boolean
) AS $$
DECLARE
  connection_record RECORD;
  validation_result RECORD;
BEGIN
  -- Get connection
  SELECT * INTO connection_record
  FROM v2.oauth_connections
  WHERE id = v2_get_oauth_connection.connection_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Validate token
  SELECT * INTO validation_result
  FROM v2.validate_oauth_token(connection_id);
  
  RETURN QUERY SELECT 
    c.id,
    c.integration_id,
    c.user_id,
    c.client_id,
    c.token_type,
    c.scope,
    c.is_active,
    c.expires_at,
    c.last_used_at,
    validation_result.is_valid,
    validation_result.needs_refresh
  FROM v2.oauth_connections c
  WHERE c.id = connection_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create OAuth scope
CREATE OR REPLACE FUNCTION v2.create_oauth_scope(
  integration_id uuid,
  scope_name text,
  scope_description text DEFAULT NULL,
  is_required boolean DEFAULT false
)
RETURNS uuid AS $$
DECLARE
  scope_id uuid;
  integration_record RECORD;
BEGIN
  -- Get integration
  SELECT * INTO integration_record
  FROM v2.integrations
  WHERE id = create_oauth_scope.integration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Integration not found';
  END IF;
  
  -- Create scope
  INSERT INTO v2.oauth_scopes (
    integration_id, scope_name, scope_description, is_required, account_id
  )
  VALUES (
    integration_id, scope_name, scope_description, is_required, integration_record.account_id
  )
  RETURNING id INTO scope_id;
  
  RETURN scope_id;
END;
$$ LANGUAGE plpgsql;

-- Function to grant OAuth scope
CREATE OR REPLACE FUNCTION v2.grant_oauth_scope(
  scope_id uuid,
  granted_by uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.oauth_scopes
  SET 
    is_granted = true,
    granted_at = now(),
    granted_by = granted_by,
    updated_at = now()
  WHERE id = scope_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke OAuth scope
CREATE OR REPLACE FUNCTION v2.revoke_oauth_scope(
  scope_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.oauth_scopes
  SET 
    is_granted = false,
    granted_at = NULL,
    granted_by = NULL,
    updated_at = now()
  WHERE id = scope_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get OAuth scopes for integration
CREATE OR REPLACE FUNCTION v2.get_oauth_scopes(
  integration_id uuid
)
RETURNS TABLE (
  id uuid,
  scope_name text,
  scope_description text,
  is_required boolean,
  is_granted boolean,
  granted_at timestamptz,
  granted_by uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    os.id,
    os.scope_name,
    os.scope_description,
    os.is_required,
    os.is_granted,
    os.granted_at,
    os.granted_by
  FROM v2.oauth_scopes os
  WHERE os.integration_id = get_oauth_scopes.integration_id
  ORDER BY os.is_required DESC, os.scope_name;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired OAuth connections
CREATE OR REPLACE FUNCTION v2.cleanup_expired_oauth_connections(
  days_expired integer DEFAULT 30
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deactivated_count integer;
BEGIN
  cutoff_date := now() - (days_expired || ' days')::interval;
  
  UPDATE v2.oauth_connections
  SET 
    is_active = false,
    updated_at = now()
  WHERE is_active = true
  AND expires_at IS NOT NULL
  AND expires_at < cutoff_date;
  
  GET DIAGNOSTICS deactivated_count = ROW_COUNT;
  RETURN deactivated_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.oauth_connections IS 'OAuth authentication tokens and refresh logic';
COMMENT ON TABLE v2.oauth_scopes IS 'OAuth permission scopes';
COMMENT ON FUNCTION v2.create_oauth_connection(uuid, uuid, text, text, text, text, text, timestamptz, text, jsonb) IS 'Create OAuth connection';
COMMENT ON FUNCTION v2.refresh_oauth_token(uuid) IS 'Refresh OAuth token';
COMMENT ON FUNCTION v2.validate_oauth_token(uuid) IS 'Validate OAuth token';
COMMENT ON FUNCTION v2_get_oauth_connection(uuid) IS 'Get OAuth connection with validation';
COMMENT ON FUNCTION v2.create_oauth_scope(uuid, text, text, boolean) IS 'Create OAuth scope';
COMMENT ON FUNCTION v2.grant_oauth_scope(uuid, uuid) IS 'Grant OAuth scope';
COMMENT ON FUNCTION v2.revoke_oauth_scope(uuid) IS 'Revoke OAuth scope';
COMMENT ON FUNCTION v2.get_oauth_scopes(uuid) IS 'Get OAuth scopes for integration';
COMMENT ON FUNCTION v2.cleanup_expired_oauth_connections(integer) IS 'Cleanup expired OAuth connections';
