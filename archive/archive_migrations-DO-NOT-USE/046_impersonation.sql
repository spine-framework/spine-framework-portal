-- Impersonation system for Spine v2
-- Secure user impersonation with audit trail

CREATE TABLE v2.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  impersonator_account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  target_account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  reason text,
  context jsonb DEFAULT '{}',
  permissions jsonb DEFAULT '[]',
  restrictions jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL,
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  access_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (impersonator_id IS NOT NULL),
  CHECK (target_user_id IS NOT NULL),
  CHECK (impersonator_id != target_user_id),
  CHECK (session_token IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_impersonation_sessions_impersonator_id ON v2.impersonation_sessions(impersonator_id);
CREATE INDEX idx_impersonation_sessions_target_user_id ON v2.impersonation_sessions(target_user_id);
CREATE INDEX idx_impersonation_sessions_session_token ON v2.impersonation_sessions(session_token);
CREATE INDEX idx_impersonation_sessions_status ON v2.impersonation_sessions(status);
CREATE INDEX idx_impersonation_sessions_expires_at ON v2.impersonation_sessions(expires_at);
CREATE INDEX idx_impersonation_sessions_last_accessed ON v2.impersonation_sessions(last_accessed_at);

-- GIN indexes for JSONB
CREATE INDEX idx_impersonation_sessions_context_gin ON v2.impersonation_sessions USING gin(context);
CREATE INDEX idx_impersonation_sessions_permissions_gin ON v2.impersonation_sessions USING gin(permissions);
CREATE INDEX idx_impersonation_sessions_restrictions_gin ON v2.impersonation_sessions USING gin(restrictions);

-- Impersonation Logs table
CREATE TABLE v2.impersonation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES v2.impersonation_sessions(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('created', 'accessed', 'revoked', 'expired', 'action_performed')),
  request_method text,
  request_path text,
  request_headers jsonb DEFAULT '{}',
  request_body jsonb DEFAULT '{}',
  response_status integer,
  response_body jsonb DEFAULT '{}',
  ip_address inet,
  user_agent text,
  duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE
);

-- Indexes for impersonation_logs
CREATE INDEX idx_impersonation_logs_session_id ON v2.impersonation_logs(session_id);
CREATE INDEX idx_impersonation_logs_action_type ON v2.impersonation_logs(action_type);
CREATE INDEX idx_impersonation_logs_created_at ON v2.impersonation_logs(created_at);
CREATE INDEX idx_impersonation_logs_ip_address ON v2.impersonation_logs(ip_address);
CREATE INDEX idx_impersonation_logs_account ON v2.impersonation_logs(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_impersonation_logs_request_headers_gin ON v2.impersonation_logs USING gin(request_headers);
CREATE INDEX idx_impersonation_logs_request_body_gin ON v2.impersonation_logs USING gin(request_body);

-- Impersonation Policies table
CREATE TABLE v2.impersonation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  policy_type text NOT NULL CHECK (policy_type IN ('allow', 'deny', 'restrict')),
  conditions jsonb DEFAULT '{}',
  permissions jsonb DEFAULT '[]',
  restrictions jsonb DEFAULT '{}',
  time_restrictions jsonb DEFAULT '{}',
  ip_restrictions jsonb DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (name IS NOT NULL),
  CHECK (policy_type IS NOT NULL)
);

-- Indexes for impersonation_policies
CREATE INDEX idx_impersonation_policies_name ON v2.impersonation_policies(name);
CREATE INDEX idx_impersonation_policies_type ON v2.impersonation_policies(policy_type);
CREATE INDEX idx_impersonation_policies_active ON v2.impersonation_policies(is_active);
CREATE INDEX idx_impersonation_policies_priority ON v2.impersonation_policies(priority);
CREATE INDEX idx_impersonation_policies_created_by ON v2.impersonation_policies(created_by);
CREATE INDEX idx_impersonation_policies_account ON v2.impersonation_policies(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_impersonation_policies_conditions_gin ON v2.impersonation_policies USING gin(conditions);
CREATE INDEX idx_impersonation_policies_permissions_gin ON v2.impersonation_policies USING gin(permissions);
CREATE INDEX idx_impersonation_policies_restrictions_gin ON v2.impersonation_policies USING gin(restrictions);

-- Function to create impersonation session
CREATE OR REPLACE FUNCTION v2.create_impersonation_session(
  impersonator_id uuid,
  target_user_id uuid,
  impersonator_account_id uuid,
  target_account_id uuid,
  reason text DEFAULT NULL,
  context jsonb DEFAULT '{}',
  permissions jsonb DEFAULT '[]',
  restrictions jsonb DEFAULT '{}',
  expires_in_hours integer DEFAULT 8
)
RETURNS uuid AS $$
DECLARE
  session_id uuid;
  session_token text;
  expires_at timestamptz;
BEGIN
  -- Generate unique session token
  session_token := 'imp_' || encode(gen_random_bytes(32), 'hex');
  expires_at := now() + (expires_in_hours || ' hours')::interval;
  
  -- Check if impersonator has permission to impersonate target
  IF NOT EXISTS (
    SELECT 1 FROM v2.impersonation_policies ip
    WHERE ip.is_active = true
    AND ip.account_id = impersonator_account_id
    AND ip.policy_type = 'allow'
    AND (
      -- Check if policy applies to impersonator
      ip.conditions ? 'impersonator_id' AND ip.conditions->>'impersonator_id' = impersonator_id::text
      OR ip.conditions ? 'impersonator_role'
      OR ip.conditions ? 'impersonator_permissions'
    )
    AND (
      -- Check if policy allows target
      NOT ip.conditions ? 'target_user_id'
      OR ip.conditions->>'target_user_id' = target_user_id::text
    )
    ORDER BY ip.priority ASC
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Impersonation not allowed by policy';
  END IF;
  
  -- Create session
  INSERT INTO v2.impersonation_sessions (
    impersonator_id, target_user_id, impersonator_account_id, target_account_id,
    session_token, reason, context, permissions, restrictions,
    expires_at, account_id
  )
  VALUES (
    impersonator_id, target_user_id, impersonator_account_id, target_account_id,
    session_token, reason, context, permissions, restrictions,
    expires_at, impersonator_account_id
  )
  RETURNING id INTO session_id;
  
  -- Log session creation
  INSERT INTO v2.impersonation_logs (
    session_id, action_type, ip_address, user_agent,
    success, account_id
  )
  VALUES (
    session_id, 'created', inet_client_addr(), current_setting('request.headers')::jsonb->>'user-agent',
    true, impersonator_account_id
  );
  
  RETURN session_id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate impersonation session
CREATE OR REPLACE FUNCTION v2.validate_impersonation_session(
  session_token text,
  ip_address inet DEFAULT NULL,
  user_agent text DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  impersonator_id uuid,
  target_user_id uuid,
  is_valid boolean,
  reason text,
  expires_at timestamptz
) AS $$
DECLARE
  session_record RECORD;
  is_valid boolean := true;
  validation_reason text := 'Valid';
BEGIN
  -- Get session
  SELECT * INTO session_record
  FROM v2.impersonation_sessions
  WHERE session_token = v2_validate_impersonation_session.session_token;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      NULL::uuid, NULL::uuid, NULL::uuid, false as is_valid,
      'Session not found' as reason, NULL::timestamptz;
    RETURN;
  END IF;
  
  -- Check if session is active
  IF session_record.status != 'active' THEN
    is_valid := false;
    validation_reason := 'Session is ' || session_record.status;
  END IF;
  
  -- Check if session has expired
  IF session_record.expires_at <= now() THEN
    is_valid := false;
    validation_reason := 'Session expired';
    
    -- Mark as expired
    UPDATE v2.impersonation_sessions
    SET status = 'expired', updated_at = now()
    WHERE id = session_record.id;
  END IF;
  
  -- Check IP restrictions
  IF is_valid AND session_record.restrictions ? 'ip_addresses' THEN
    IF NOT (session_record.restrictions->'ip_addresses' @> jsonb_build_array(ip_address::text)) THEN
      is_valid := false;
      validation_reason := 'IP address not allowed';
    END IF;
  END IF;
  
  -- Log access attempt
  INSERT INTO v2.impersonation_logs (
    session_id, action_type, ip_address, user_agent,
    success, error_message, account_id
  )
  VALUES (
    session_record.id, 'accessed', ip_address, user_agent,
    is_valid, CASE WHEN is_valid THEN NULL ELSE validation_reason END,
    session_record.impersonator_account_id
  );
  
  -- Update last accessed if valid
  IF is_valid THEN
    UPDATE v2.impersonation_sessions
    SET last_accessed_at = now(), access_count = access_count + 1
    WHERE id = session_record.id;
  END IF;
  
  RETURN QUERY SELECT 
    session_record.id as session_id,
    session_record.impersonator_id,
    session_record.target_user_id,
    is_valid as is_valid,
    validation_reason as reason,
    session_record.expires_at;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke impersonation session
CREATE OR REPLACE FUNCTION v2.revoke_impersonation_session(
  session_id uuid,
  reason text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  session_record RECORD;
BEGIN
  -- Get session
  SELECT * INTO session_record
  FROM v2.impersonation_sessions
  WHERE id = revoke_impersonation_session.session_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Mark as revoked
  UPDATE v2.impersonation_sessions
  SET status = 'revoked', updated_at = now()
  WHERE id = revoke_impersonation_session.session_id;
  
  -- Log revocation
  INSERT INTO v2.impersonation_logs (
    session_id, action_type, ip_address, user_agent,
    success, account_id
  )
  VALUES (
    session_id, 'revoked', inet_client_addr(), current_setting('request.headers')::jsonb->>'user-agent',
    true, session_record.impersonator_account_id
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to log impersonation action
CREATE OR REPLACE FUNCTION v2.log_impersonation_action(
  session_id uuid,
  request_method text DEFAULT NULL,
  request_path text DEFAULT NULL,
  request_headers jsonb DEFAULT '{}',
  request_body jsonb DEFAULT '{}',
  response_status integer DEFAULT NULL,
  response_body jsonb DEFAULT '{}',
  duration_ms integer DEFAULT NULL,
  success boolean DEFAULT true,
  error_message text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  session_record RECORD;
  log_id uuid;
BEGIN
  -- Get session
  SELECT * INTO session_record
  FROM v2.impersonation_sessions
  WHERE id = log_impersonation_action.session_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  
  -- Log action
  INSERT INTO v2.impersonation_logs (
    session_id, action_type, request_method, request_path,
    request_headers, request_body, response_status, response_body,
    duration_ms, success, error_message, ip_address, user_agent,
    account_id
  )
  VALUES (
    session_id, 'action_performed', request_method, request_path,
    request_headers, request_body, response_status, response_body,
    duration_ms, success, error_message, inet_client_addr(),
    current_setting('request.headers')::jsonb->>'user-agent',
    session_record.impersonator_account_id
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get impersonation statistics
CREATE OR REPLACE FUNCTION v2.get_impersonation_statistics(
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  metric_name text,
  metric_value numeric,
  metric_details jsonb
) AS $$
BEGIN
  -- Active sessions
  RETURN QUERY SELECT 
    'active_sessions' as metric_name,
    COUNT(*)::numeric as metric_value,
    jsonb_build_object('as_of', now()) as metric_details
  FROM v2.impersonation_sessions
  WHERE (account_id IS NULL OR impersonator_account_id = get_impersonation_statistics.account_id)
  AND status = 'active'
  AND expires_at > now();
  
  -- Total sessions today
  RETURN QUERY SELECT 
    'sessions_today' as metric_name,
    COUNT(*)::numeric as metric_value,
    jsonb_build_object('date', current_date) as metric_details
  FROM v2.impersonation_sessions
  WHERE (account_id IS NULL OR impersonator_account_id = get_impersonation_statistics.account_id)
  AND created_at >= current_date;
  
  -- Average session duration
  RETURN QUERY SELECT 
    'avg_session_duration_hours' as metric_name,
    AVG(EXTRACT(EPOCH FROM (last_accessed_at - created_at)) / 3600)::numeric as metric_value,
    jsonb_build_object('unit', 'hours') as metric_details
  FROM v2.impersonation_sessions
  WHERE (account_id IS NULL OR impersonator_account_id = get_impersonation_statistics.account_id)
  AND status IN ('active', 'expired')
  AND last_accessed_at > created_at;
  
  -- Actions per session
  RETURN QUERY SELECT 
    'avg_actions_per_session' as metric_name,
    AVG(action_counts.action_count)::numeric as metric_value,
    jsonb_build_object('unit', 'actions') as metric_details
  FROM (
    SELECT 
      session_id,
      COUNT(*) as action_count
    FROM v2.impersonation_logs
    WHERE action_type = 'action_performed'
    AND (account_id IS NULL OR account_id = get_impersonation_statistics.account_id)
    AND (date_from IS NULL OR created_at >= date_from)
    AND (date_to IS NULL OR created_at <= date_to)
    GROUP BY session_id
  ) action_counts;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION v2.cleanup_expired_impersonation_sessions()
RETURNS integer AS $$
DECLARE
  expired_count integer;
BEGIN
  -- Mark expired sessions
  UPDATE v2.impersonation_sessions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
  AND expires_at <= now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Log expiration
  INSERT INTO v2.impersonation_logs (session_id, action_type, success, account_id)
  SELECT id, 'expired', true, impersonator_account_id
  FROM v2.impersonation_sessions
  WHERE status = 'expired'
  AND updated_at = now();
  
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to create impersonation policy
CREATE OR REPLACE FUNCTION v2.create_impersonation_policy(
  name text,
  description text DEFAULT NULL,
  policy_type text,
  conditions jsonb DEFAULT '{}',
  permissions jsonb DEFAULT '[]',
  restrictions jsonb DEFAULT '{}',
  time_restrictions jsonb DEFAULT '{}',
  ip_restrictions jsonb DEFAULT '[]',
  priority integer DEFAULT 100,
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  policy_id uuid;
BEGIN
  -- Validate policy type
  IF policy_type NOT IN ('allow', 'deny', 'restrict') THEN
    RAISE EXCEPTION 'Invalid policy type';
  END IF;
  
  -- Insert policy
  INSERT INTO v2.impersonation_policies (
    name, description, policy_type, conditions, permissions,
    restrictions, time_restrictions, ip_restrictions, priority,
    created_by, account_id
  )
  VALUES (
    name, description, policy_type, conditions, permissions,
    restrictions, time_restrictions, ip_restrictions, priority,
    created_by, account_id
  )
  RETURNING id INTO policy_id;
  
  RETURN policy_id;
END;
$$ LANGUAGE plpgsql;

-- Function to evaluate impersonation policies
CREATE OR REPLACE FUNCTION v2.evaluate_impersonation_policies(
  impersonator_id uuid,
  target_user_id uuid,
  impersonator_account_id uuid,
  context jsonb DEFAULT '{}'
)
RETURNS TABLE (
  policy_id uuid,
  policy_name text,
  policy_type text,
  is_allowed boolean,
  reason text
) AS $$
DECLARE
  policy_record RECORD;
  is_allowed boolean;
  policy_reason text;
BEGIN
  -- Get policies in priority order
  FOR policy_record IN 
    SELECT * FROM v2.impersonation_policies
    WHERE is_active = true
    AND account_id = evaluate_impersonation_policies.impersonator_account_id
    ORDER BY priority ASC
  LOOP
    is_allowed := true;
    policy_reason := 'Policy allows';
    
    -- Check conditions
    IF policy_record.conditions ? 'impersonator_id' THEN
      IF policy_record.conditions->>'impersonator_id' != impersonator_id::text THEN
        is_allowed := false;
        policy_reason := 'Impersonator ID does not match';
      END IF;
    END IF;
    
    IF policy_record.conditions ? 'target_user_id' THEN
      IF policy_record.conditions->>'target_user_id' != target_user_id::text THEN
        is_allowed := false;
        policy_reason := 'Target user ID does not match';
      END IF;
    END IF;
    
    -- Check time restrictions
    IF policy_record.time_restrictions ? 'business_hours_only' THEN
      IF policy_record.time_restrictions->>'business_hours_only' = 'true' THEN
        IF EXTRACT(HOUR FROM now()) < 9 OR EXTRACT(HOUR FROM now()) > 17 THEN
          is_allowed := false;
          policy_reason := 'Outside business hours';
        END IF;
      END IF;
    END IF;
    
    -- Return result based on policy type
    IF policy_record.policy_type = 'allow' AND is_allowed THEN
      RETURN QUERY SELECT 
        policy_record.id, policy_record.name, policy_record.policy_type,
        true as is_allowed, policy_reason as reason;
      RETURN;
    ELSIF policy_record.policy_type = 'deny' AND NOT is_allowed THEN
      RETURN QUERY SELECT 
        policy_record.id, policy_record.name, policy_record.policy_type,
        false as is_allowed, policy_reason as reason;
      RETURN;
    ELSIF policy_record.policy_type = 'restrict' THEN
      RETURN QUERY SELECT 
        policy_record.id, policy_record.name, policy_record.policy_type,
        is_allowed as is_allowed, policy_reason as reason;
    END IF;
  END LOOP;
  
  -- Default deny if no policies matched
  RETURN QUERY SELECT 
    NULL::uuid, 'default' as policy_name, 'deny' as policy_type,
    false as is_allowed, 'No matching policy found' as reason;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.impersonation_sessions IS 'Impersonation session tracking';
COMMENT ON TABLE v2.impersonation_logs IS 'Impersonation activity logs';
COMMENT ON TABLE v2.impersonation_policies IS 'Impersonation access policies';
COMMENT ON FUNCTION v2.create_impersonation_session(uuid, uuid, uuid, uuid, text, jsonb, jsonb, jsonb, integer) IS 'Create impersonation session';
COMMENT ON FUNCTION v2.validate_impersonation_session(text, inet, text) IS 'Validate impersonation session';
COMMENT ON FUNCTION v2.revoke_impersonation_session(uuid, text) IS 'Revoke impersonation session';
COMMENT ON FUNCTION v2.log_impersonation_action(uuid, text, text, jsonb, jsonb, integer, jsonb, integer, boolean, text) IS 'Log impersonation action';
COMMENT ON FUNCTION v2.get_impersonation_statistics(uuid, timestamptz, timestamptz) IS 'Get impersonation statistics';
COMMENT ON FUNCTION v2.cleanup_expired_impersonation_sessions() IS 'Cleanup expired sessions';
COMMENT ON FUNCTION v2.create_impersonation_policy(text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, integer, uuid, uuid) IS 'Create impersonation policy';
COMMENT ON FUNCTION v2.evaluate_impersonation_policies(uuid, uuid, uuid, jsonb) IS 'Evaluate impersonation policies';
