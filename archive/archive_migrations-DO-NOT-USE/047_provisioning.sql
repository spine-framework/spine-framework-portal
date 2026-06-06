-- User provisioning system for Spine v2
-- Automated user account creation and management

CREATE TABLE v2.provisioning_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  template_type text NOT NULL CHECK (template_type IN ('user', 'account', 'app', 'integration')),
  config jsonb NOT NULL DEFAULT '{}',
  default_values jsonb DEFAULT '{}',
  validation_rules jsonb DEFAULT '{}',
  approval_required boolean NOT NULL DEFAULT false,
  auto_activate boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (name IS NOT NULL),
  CHECK (template_type IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_provisioning_templates_name ON v2.provisioning_templates(name);
CREATE INDEX idx_provisioning_templates_type ON v2.provisioning_templates(template_type);
CREATE INDEX idx_provisioning_templates_active ON v2.provisioning_templates(is_active);
CREATE INDEX idx_provisioning_templates_approval_required ON v2.provisioning_templates(approval_required);
CREATE INDEX idx_provisioning_templates_created_by ON v2.provisioning_templates(created_by);
CREATE INDEX idx_provisioning_templates_account ON v2.provisioning_templates(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_provisioning_templates_config_gin ON v2.provisioning_templates USING gin(config);
CREATE INDEX idx_provisioning_templates_default_values_gin ON v2.provisioning_templates USING gin(default_values);
CREATE INDEX idx_provisioning_templates_validation_rules_gin ON v2.provisioning_templates USING gin(validation_rules);

-- Provisioning Requests table
CREATE TABLE v2.provisioning_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES v2.provisioning_templates(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('create', 'update', 'delete', 'activate', 'deactivate')),
  target_type text NOT NULL,
  target_id uuid DEFAULT NULL,
  request_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  requested_by uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  approved_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  result_data jsonb DEFAULT '{}',
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (template_id IS NOT NULL),
  CHECK (request_type IS NOT NULL),
  CHECK (target_type IS NOT NULL),
  CHECK (requested_by IS NOT NULL)
);

-- Indexes for provisioning_requests
CREATE INDEX idx_provisioning_requests_template_id ON v2.provisioning_requests(template_id);
CREATE INDEX idx_provisioning_requests_type ON v2.provisioning_requests(request_type);
CREATE INDEX idx_provisioning_requests_target ON v2.provisioning_requests(target_type, target_id);
CREATE INDEX idx_provisioning_requests_status ON v2.provisioning_requests(status);
CREATE INDEX idx_provisioning_requests_priority ON v2.provisioning_requests(priority);
CREATE INDEX idx_provisioning_requests_requested_by ON v2.provisioning_requests(requested_by);
CREATE INDEX idx_provisioning_requests_approved_by ON v2.provisioning_requests(approved_by);
CREATE INDEX idx_provisioning_requests_next_retry ON v2.provisioning_requests(next_retry_at);
CREATE INDEX idx_provisioning_requests_created_at ON v2.provisioning_requests(created_at);
CREATE INDEX idx_provisioning_requests_account ON v2.provisioning_requests(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_provisioning_requests_request_data_gin ON v2.provisioning_requests USING gin(request_data);
CREATE INDEX idx_provisioning_requests_result_data_gin ON v2.provisioning_requests USING gin(result_data);

-- Provisioning Logs table
CREATE TABLE v2.provisioning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES v2.provisioning_requests(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  step_type text NOT NULL CHECK (step_type IN ('validation', 'creation', 'configuration', 'notification', 'cleanup')),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  input_data jsonb DEFAULT '{}',
  output_data jsonb DEFAULT '{}',
  error_message text,
  duration_ms integer,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE
);

-- Indexes for provisioning_logs
CREATE INDEX idx_provisioning_logs_request_id ON v2.provisioning_logs(request_id);
CREATE INDEX idx_provisioning_logs_step_name ON v2.provisioning_logs(step_name);
CREATE INDEX idx_provisioning_logs_step_type ON v2.provisioning_logs(step_type);
CREATE INDEX idx_provisioning_logs_status ON v2.provisioning_logs(status);
CREATE INDEX idx_provisioning_logs_created_at ON v2.provisioning_logs(created_at);
CREATE INDEX idx_provisioning_logs_account ON v2.provisioning_logs(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_provisioning_logs_input_data_gin ON v2.provisioning_logs USING gin(input_data);
CREATE INDEX idx_provisioning_logs_output_data_gin ON v2.provisioning_logs USING gin(output_data);

-- Function to create provisioning template
CREATE OR REPLACE FUNCTION v2.create_provisioning_template(
  name text,
  description text DEFAULT NULL,
  template_type text,
  config jsonb DEFAULT '{}',
  default_values jsonb DEFAULT '{}',
  validation_rules jsonb DEFAULT '{}',
  approval_required boolean DEFAULT false,
  auto_activate boolean DEFAULT true,
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  template_id uuid;
BEGIN
  -- Validate template type
  IF template_type NOT IN ('user', 'account', 'app', 'integration') THEN
    RAISE EXCEPTION 'Invalid template type';
  END IF;
  
  -- Insert template
  INSERT INTO v2.provisioning_templates (
    name, description, template_type, config, default_values,
    validation_rules, approval_required, auto_activate,
    created_by, account_id
  )
  VALUES (
    name, description, template_type, config, default_values,
    validation_rules, approval_required, auto_activate,
    created_by, account_id
  )
  RETURNING id INTO template_id;
  
  RETURN template_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create provisioning request
CREATE OR REPLACE FUNCTION v2.create_provisioning_request(
  template_id uuid,
  request_type text,
  target_type text,
  target_id uuid DEFAULT NULL,
  request_data jsonb DEFAULT '{}',
  priority text DEFAULT 'normal',
  requested_by uuid,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  request_id uuid;
  template_record RECORD;
  auto_approve boolean := false;
BEGIN
  -- Get template
  SELECT * INTO template_record
  FROM v2.provisioning_templates
  WHERE id = create_provisioning_request.template_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or inactive';
  END IF;
  
  -- Auto-approve if template doesn't require approval
  auto_approve := NOT template_record.approval_required;
  
  -- Create request
  INSERT INTO v2.provisioning_requests (
    template_id, request_type, target_type, target_id, request_data,
    priority, requested_by, status, approved_by, approved_at,
    account_id
  )
  VALUES (
    template_id, request_type, target_type, target_id, request_data,
    priority, requested_by,
    CASE WHEN auto_approve THEN 'approved' ELSE 'pending' END,
    CASE WHEN auto_approve THEN requested_by ELSE NULL END,
    CASE WHEN auto_approve THEN now() ELSE NULL END,
    account_id
  )
  RETURNING id INTO request_id;
  
  -- Log request creation
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, account_id
  )
  VALUES (
    request_id, 'request_created', 'validation', 'completed',
    jsonb_build_object('auto_approved', auto_approve), account_id
  );
  
  -- Start processing if auto-approved
  IF auto_approve THEN
    PERFORM v2.start_provisioning_request(request_id);
  END IF;
  
  RETURN request_id;
END;
$$ LANGUAGE plpgsql;

-- Function to approve provisioning request
CREATE OR REPLACE FUNCTION v2.approve_provisioning_request(
  request_id uuid,
  approved_by uuid,
  notes text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  request_record RECORD;
BEGIN
  -- Get request
  SELECT * INTO request_record
  FROM v2.provisioning_requests
  WHERE id = approve_provisioning_request.request_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if request is pending
  IF request_record.status != 'pending' THEN
    RAISE EXCEPTION 'Request cannot be approved (current status: %)', request_record.status;
  END IF;
  
  -- Approve request
  UPDATE v2.provisioning_requests
  SET 
    status = 'approved',
    approved_by = approve_provisioning_request.approved_by,
    approved_at = now(),
    updated_at = now()
  WHERE id = approve_provisioning_request.request_id;
  
  -- Log approval
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'request_approved', 'validation', 'completed',
    jsonb_build_object('approved_by', approved_by),
    jsonb_build_object('notes', notes),
    request_record.account_id
  );
  
  -- Start processing
  PERFORM v2.start_provisioning_request(request_id);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to reject provisioning request
CREATE OR REPLACE FUNCTION v2.reject_provisioning_request(
  request_id uuid,
  rejected_by uuid,
  rejection_reason text
)
RETURNS boolean AS $$
DECLARE
  request_record RECORD;
BEGIN
  -- Get request
  SELECT * INTO request_record
  FROM v2.provisioning_requests
  WHERE id = reject_provisioning_request.request_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if request is pending
  IF request_record.status != 'pending' THEN
    RAISE EXCEPTION 'Request cannot be rejected (current status: %)', request_record.status;
  END IF;
  
  -- Reject request
  UPDATE v2.provisioning_requests
  SET 
    status = 'rejected',
    approved_by = reject_provisioning_request.rejected_by,
    approved_at = now(),
    rejection_reason = reject_provisioning_request.rejection_reason,
    updated_at = now()
  WHERE id = reject_provisioning_request.request_id;
  
  -- Log rejection
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'request_rejected', 'validation', 'completed',
    jsonb_build_object('rejected_by', rejected_by),
    jsonb_build_object('rejection_reason', rejection_reason),
    request_record.account_id
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to start provisioning request
CREATE OR REPLACE FUNCTION v2.start_provisioning_request(
  request_id uuid
)
RETURNS boolean AS $$
DECLARE
  request_record RECORD;
  template_record RECORD;
  start_time timestamptz;
BEGIN
  -- Get request and template
  SELECT r.*, t.* INTO request_record, template_record
  FROM v2.provisioning_requests r
  JOIN v2.provisioning_templates t ON r.template_id = t.id
  WHERE r.id = start_provisioning_request.request_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if request is approved
  IF request_record.status != 'approved' THEN
    RAISE EXCEPTION 'Request must be approved before processing';
  END IF;
  
  start_time := now();
  
  -- Update request status
  UPDATE v2.provisioning_requests
  SET 
    status = 'processing',
    started_at = start_time,
    updated_at = now()
  WHERE id = start_provisioning_request.request_id;
  
  -- Log processing start
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, account_id
  )
  VALUES (
    request_id, 'processing_started', 'creation', 'started',
    jsonb_build_object('template_type', template_record.template_type),
    request_record.account_id
  );
  
  -- Execute provisioning based on template type
  BEGIN
    CASE template_record.template_type
      WHEN 'user' THEN
        PERFORM v2.provision_user(request_id, template_record, request_record);
      WHEN 'account' THEN
        PERFORM v2.provision_account(request_id, template_record, request_record);
      WHEN 'app' THEN
        PERFORM v2.provision_app(request_id, template_record, request_record);
      WHEN 'integration' THEN
        PERFORM v2.provision_integration(request_id, template_record, request_record);
      ELSE
        RAISE EXCEPTION 'Unknown template type: %', template_record.template_type;
    END CASE;
    
    -- Mark as completed
    UPDATE v2.provisioning_requests
    SET 
      status = 'completed',
      completed_at = now(),
      duration_ms = EXTRACT(MILLISECONDS FROM (now() - start_time))::integer,
      updated_at = now()
    WHERE id = start_provisioning_request.request_id;
    
    -- Log completion
    INSERT INTO v2.provisioning_logs (
      request_id, step_name, step_type, status,
      output_data, duration_ms, account_id
    )
    VALUES (
      request_id, 'processing_completed', 'creation', 'completed',
      jsonb_build_object('success', true),
      EXTRACT(MILLISECONDS FROM (now() - start_time))::integer,
      request_record.account_id
    );
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Mark as failed
      UPDATE v2.provisioning_requests
      SET 
        status = 'failed',
        completed_at = now(),
        duration_ms = EXTRACT(MILLISECONDS FROM (now() - start_time))::integer,
        error_message = SQLERRM,
        updated_at = now()
      WHERE id = start_provisioning_request.request_id;
      
      -- Log failure
      INSERT INTO v2.provisioning_logs (
        request_id, step_name, step_type, status,
        error_message, duration_ms, account_id
      )
      VALUES (
        request_id, 'processing_failed', 'creation', 'failed',
        SQLERRM,
        EXTRACT(MILLISECONDS FROM (now() - start_time))::integer,
        request_record.account_id
      );
  END;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to provision user
CREATE OR REPLACE FUNCTION v2.provision_user(
  request_id uuid,
  template_record RECORD,
  request_record RECORD
)
RETURNS void AS $$
DECLARE
  user_data jsonb;
  user_id uuid;
  person_id uuid;
  account_id uuid;
BEGIN
  -- Merge template config with request data
  user_data := template_record.config || request_record.request_data;
  
  -- Apply default values
  user_data := user_data || template_record.default_values;
  
  -- Validate required fields
  IF NOT (user_data ? 'email') THEN
    RAISE EXCEPTION 'Email is required for user provisioning';
  END IF;
  
  -- Create account if specified
  IF user_data ? 'create_account' AND user_data->>'create_account' = 'true' THEN
    INSERT INTO v2.accounts (
      name, account_type, owner_account_id, metadata
    )
    VALUES (
      COALESCE(user_data->>'account_name', user_data->>'full_name' || ' Account'),
      COALESCE(user_data->>'account_type', 'organization'),
      request_record.account_id,
      jsonb_build_object('provisioned_by', request_id)
    )
    RETURNING id INTO account_id;
  ELSE
    account_id := request_record.account_id;
  END IF;
  
  -- Create person
  INSERT INTO v2.people (
    full_name, email, phone, metadata, account_id
  )
  VALUES (
    user_data->>'full_name',
    user_data->>'email',
    user_data->>'phone',
    jsonb_build_object('provisioned_by', request_id),
    account_id
  )
  RETURNING id INTO person_id;
  
  -- Create user account
  INSERT INTO v2.users (
    person_id, account_id, auth_provider, auth_provider_id,
    is_active, metadata
  )
  VALUES (
    person_id, account_id, 'email', user_data->>'email',
    template_record.auto_activate, jsonb_build_object('provisioned_by', request_id)
  )
  RETURNING id INTO user_id;
  
  -- Assign default role if specified
  IF user_data ? 'default_role' THEN
    INSERT INTO v2.people_roles (person_id, account_id, role_slug)
    VALUES (person_id, account_id, user_data->>'default_role')
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Store result
  UPDATE v2.provisioning_requests
  SET result_data = jsonb_build_object(
    'user_id', user_id,
    'person_id', person_id,
    'account_id', account_id
  )
  WHERE id = provision_user.request_id;
  
  -- Log user creation
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'user_created', 'creation', 'completed',
    user_data,
    jsonb_build_object('user_id', user_id, 'person_id', person_id),
    request_record.account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to provision account
CREATE OR REPLACE FUNCTION v2.provision_account(
  request_id uuid,
  template_record RECORD,
  request_record RECORD
)
RETURNS void AS $$
DECLARE
  account_data jsonb;
  account_id uuid;
BEGIN
  -- Merge template config with request data
  account_data := template_record.config || request_record.request_data;
  
  -- Apply default values
  account_data := account_data || template_record.default_values;
  
  -- Validate required fields
  IF NOT (account_data ? 'name') THEN
    RAISE EXCEPTION 'Account name is required for account provisioning';
  END IF;
  
  -- Create account
  INSERT INTO v2.accounts (
    name, account_type, owner_account_id, metadata
  )
  VALUES (
    account_data->>'name',
    COALESCE(account_data->>'account_type', 'organization'),
    request_record.account_id,
    jsonb_build_object('provisioned_by', request_id)
  )
  RETURNING id INTO account_id;
  
  -- Create default admin user if specified
  IF account_data ? 'create_admin_user' AND account_data->>'create_admin_user' = 'true' THEN
    DECLARE
      admin_person_id uuid;
      admin_user_id uuid;
    BEGIN
      -- Create admin person
      INSERT INTO v2.people (
        full_name, email, phone, metadata, account_id
      )
      VALUES (
        account_data->>'admin_name',
        account_data->>'admin_email',
        account_data->>'admin_phone',
        jsonb_build_object('provisioned_by', request_id, 'is_admin', true),
        account_id
      )
      RETURNING id INTO admin_person_id;
      
      -- Create admin user
      INSERT INTO v2.users (
        person_id, account_id, auth_provider, auth_provider_id,
        is_active, metadata
      )
      VALUES (
        admin_person_id, account_id, 'email', account_data->>'admin_email',
        true, jsonb_build_object('provisioned_by', request_id, 'is_admin', true)
      )
      RETURNING id INTO admin_user_id;
      
      -- Assign admin role
      INSERT INTO v2.people_roles (person_id, account_id, role_slug)
      VALUES (admin_person_id, account_id, 'admin')
      ON CONFLICT DO NOTHING;
    END;
  END IF;
  
  -- Store result
  UPDATE v2.provisioning_requests
  SET result_data = jsonb_build_object('account_id', account_id)
  WHERE id = provision_account.request_id;
  
  -- Log account creation
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'account_created', 'creation', 'completed',
    account_data,
    jsonb_build_object('account_id', account_id),
    request_record.account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to provision app
CREATE OR REPLACE FUNCTION v2.provision_app(
  request_id uuid,
  template_record RECORD,
  request_record RECORD
)
RETURNS void AS $$
DECLARE
  app_data jsonb;
  app_id uuid;
BEGIN
  -- Merge template config with request data
  app_data := template_record.config || request_record.request_data;
  
  -- Apply default values
  app_data := app_data || template_record.default_values;
  
  -- Validate required fields
  IF NOT (app_data ? 'slug') THEN
    RAISE EXCEPTION 'App slug is required for app provisioning';
  END IF;
  
  -- Create app
  INSERT INTO v2.apps (
    slug, name, description, app_type, version, config,
    is_active, metadata, account_id
  )
  VALUES (
    app_data->>'slug',
    app_data->>'name',
    app_data->>'description',
    COALESCE(app_data->>'app_type', 'custom'),
    COALESCE(app_data->>'version', '1.0.0'),
    app_data->'config',
    template_record.auto_activate,
    jsonb_build_object('provisioned_by', request_id),
    request_record.account_id
  )
  RETURNING id INTO app_id;
  
  -- Store result
  UPDATE v2.provisioning_requests
  SET result_data = jsonb_build_object('app_id', app_id)
  WHERE id = provision_app.request_id;
  
  -- Log app creation
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'app_created', 'creation', 'completed',
    app_data,
    jsonb_build_object('app_id', app_id),
    request_record.account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to provision integration
CREATE OR REPLACE FUNCTION v2.provision_integration(
  request_id uuid,
  template_record RECORD,
  request_record RECORD
)
RETURNS void AS $$
DECLARE
  integration_data jsonb;
  integration_id uuid;
BEGIN
  -- Merge template config with request data
  integration_data := template_record.config || request_record.request_data;
  
  -- Apply default values
  integration_data := integration_data || template_record.default_values;
  
  -- Validate required fields
  IF NOT (integration_data ? 'name') OR NOT (integration_data ? 'provider') THEN
    RAISE EXCEPTION 'Integration name and provider are required';
  END IF;
  
  -- Create integration
  INSERT INTO v2.integrations (
    name, description, provider, integration_type, config,
    credentials, is_active, metadata, account_id
  )
  VALUES (
    integration_data->>'name',
    integration_data->>'description',
    integration_data->>'provider',
    COALESCE(integration_data->>'integration_type', 'api'),
    integration_data->'config',
    integration_data->'credentials',
    template_record.auto_activate,
    jsonb_build_object('provisioned_by', request_id),
    request_record.account_id
  )
  RETURNING id INTO integration_id;
  
  -- Store result
  UPDATE v2.provisioning_requests
  SET result_data = jsonb_build_object('integration_id', integration_id)
  WHERE id = provision_integration.request_id;
  
  -- Log integration creation
  INSERT INTO v2.provisioning_logs (
    request_id, step_name, step_type, status,
    input_data, output_data, account_id
  )
  VALUES (
    request_id, 'integration_created', 'creation', 'completed',
    integration_data,
    jsonb_build_object('integration_id', integration_id),
    request_record.account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get provisioning statistics
CREATE OR REPLACE FUNCTION v2.get_provisioning_statistics(
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
  -- Total requests
  RETURN QUERY SELECT 
    'total_requests' as metric_name,
    COUNT(*)::numeric as metric_value,
    jsonb_build_object('period', 'all_time') as metric_details
  FROM v2.provisioning_requests
  WHERE (account_id IS NULL OR account_id = get_provisioning_statistics.account_id)
  AND (date_from IS NULL OR created_at >= date_from)
  AND (date_to IS NULL OR created_at <= date_to);
  
  -- Requests by status
  RETURN QUERY SELECT 
    'requests_by_status' as metric_name,
    COUNT(*)::numeric as metric_value,
    jsonb_build_object('status', status, 'period', 'all_time') as metric_details
  FROM v2.provisioning_requests
  WHERE (account_id IS NULL OR account_id = get_provisioning_statistics.account_id)
  AND (date_from IS NULL OR created_at >= date_from)
  AND (date_to IS NULL OR created_at <= date_to)
  GROUP BY status;
  
  -- Average processing time
  RETURN QUERY SELECT 
    'avg_processing_time_seconds' as metric_name,
    AVG(duration_ms / 1000.0)::numeric as metric_value,
    jsonb_build_object('unit', 'seconds', 'status', 'completed') as metric_details
  FROM v2.provisioning_requests
  WHERE (account_id IS NULL OR account_id = get_provisioning_statistics.account_id)
  AND status = 'completed'
  AND duration_ms IS NOT NULL
  AND (date_from IS NULL OR created_at >= date_from)
  AND (date_to IS NULL OR created_at <= date_to);
  
  -- Success rate
  RETURN QUERY SELECT 
    'success_rate' as metric_name,
    (COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) * 100) as metric_value,
    jsonb_build_object('unit', 'percentage') as metric_details
  FROM v2.provisioning_requests
  WHERE (account_id IS NULL OR account_id = get_provisioning_statistics.account_id)
  AND status IN ('completed', 'failed')
  AND (date_from IS NULL OR created_at >= date_from)
  AND (date_to IS NULL OR created_at <= date_to);
END;
$$ LANGUAGE plpgsql;

-- Function to retry failed requests
CREATE OR REPLACE FUNCTION v2.retry_failed_provisioning_requests()
RETURNS TABLE (
  retried_count integer,
  failed_count integer
) AS $$
DECLARE
  retried_count integer := 0;
  failed_count integer := 0;
  request_record RECORD;
BEGIN
  -- Get failed requests that can be retried
  FOR request_record IN 
    SELECT * FROM v2.provisioning_requests
    WHERE status = 'failed'
    AND retry_count < max_retries
    AND (next_retry_at IS NULL OR next_retry_at <= now())
  LOOP
    BEGIN
      -- Increment retry count and reset
      UPDATE v2.provisioning_requests
      SET 
        status = 'approved',
        retry_count = retry_count + 1,
        error_message = NULL,
        next_retry_at = NULL,
        updated_at = now()
      WHERE id = request_record.id;
      
      -- Retry processing
      PERFORM v2.start_provisioning_request(request_record.id);
      retried_count := retried_count + 1;
      
    EXCEPTION
      WHEN OTHERS THEN
        failed_count := failed_count + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT retried_count, failed_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old requests
CREATE OR REPLACE FUNCTION v2.cleanup_old_provisioning_requests(
  days_to_keep integer DEFAULT 90
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  -- Delete old completed/failed requests
  DELETE FROM v2.provisioning_requests
  WHERE status IN ('completed', 'failed', 'rejected')
  AND created_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.provisioning_templates IS 'Provisioning templates for automated resource creation';
COMMENT ON TABLE v2.provisioning_requests IS 'Provisioning request tracking';
COMMENT ON TABLE v2.provisioning_logs IS 'Provisioning step execution logs';
COMMENT ON FUNCTION v2.create_provisioning_template(text, text, text, jsonb, jsonb, jsonb, boolean, boolean, uuid, uuid) IS 'Create provisioning template';
COMMENT ON FUNCTION v2.create_provisioning_request(uuid, text, text, uuid, jsonb, text, uuid, uuid) IS 'Create provisioning request';
COMMENT ON FUNCTION v2.approve_provisioning_request(uuid, uuid, text) IS 'Approve provisioning request';
COMMENT ON FUNCTION v2.reject_provisioning_request(uuid, uuid, text) IS 'Reject provisioning request';
COMMENT ON FUNCTION v2.start_provisioning_request(uuid) IS 'Start provisioning request processing';
COMMENT ON FUNCTION v2.provision_user(uuid, record, record) IS 'Provision user account';
COMMENT ON FUNCTION v2.provision_account(uuid, record, record) IS 'Provision account';
COMMENT ON FUNCTION v2.provision_app(uuid, record, record) IS 'Provision app';
COMMENT ON FUNCTION v2.provision_integration(uuid, record, record) IS 'Provision integration';
COMMENT ON FUNCTION v2.get_provisioning_statistics(uuid, timestamptz, timestamptz) IS 'Get provisioning statistics';
COMMENT ON FUNCTION v2.retry_failed_provisioning_requests() IS 'Retry failed requests';
COMMENT ON FUNCTION v2.cleanup_old_provisioning_requests(integer) IS 'Cleanup old requests';
