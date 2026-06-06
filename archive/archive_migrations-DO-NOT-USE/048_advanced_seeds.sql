-- Seed data and functions for Advanced Features in Spine v2
-- Default configurations and helper functions

-- Graph Traversal seed data
INSERT INTO v2.graph_edges (
  source_type, source_id, target_type, target_id, edge_type,
  edge_data, weight, is_directed, account_id
)
VALUES
-- Account hierarchy edges
('account', 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2', 'account', '00000000-0000-0000-0000-000000000001', 'owner_of', 
 jsonb_build_object('relationship', 'tenant_owner'), 1.0, true, '00000000-0000-0000-0000-000000000001'),

-- Person to account relationships
('person', 'cab578c2-c295-476a-a8c5-dca3445aa4ac', 'account', 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2', 'member_of',
 jsonb_build_object('role', 'admin'), 1.0, true, 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2'),

-- Item relationships (examples)
('item', '00000000-0000-0000-0000-000000000001', 'item', '00000000-0000-0000-0000-000000000002', 'parent_of',
 jsonb_build_object('relationship', 'hierarchy'), 1.0, true, 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2'),

-- App to account relationships
('app', '00000000-0000-0000-0000-000000000001', 'account', 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2', 'installed_in',
 jsonb_build_object('version', '1.0.0'), 1.0, true, 'cd74879c-3bfa-4dce-9bbd-67b31eaa23e2');

-- Introspection seed data
INSERT INTO v2.schema_metadata (
  schema_name, object_type, object_name, display_name, description,
  object_definition, field_definitions, relationships,
  permissions, tags, account_id
)
VALUES
-- Core tables
('spine_v2', 'table', 'accounts', 'Accounts', 'Multi-tenant account management',
 jsonb_build_object('table_name', 'accounts', 'schema', 'v2'),
 jsonb_build_array(
   jsonb_build_object('name', 'id', 'type', 'uuid', 'nullable', false),
   jsonb_build_object('name', 'name', 'type', 'text', 'nullable', false),
   jsonb_build_object('name', 'account_type', 'type', 'text', 'nullable', false),
   jsonb_build_object('name', 'owner_account_id', 'type', 'uuid', 'nullable', true)
 ),
 jsonb_build_array(
   jsonb_build_object('target_type', 'people', 'relationship', 'has_members'),
   jsonb_build_object('target_type', 'apps', 'relationship', 'hosts_apps')
 ),
 jsonb_build_object('read', 'authenticated', 'write', 'admin'),
 jsonb_build_array('core', 'identity', 'multi-tenant'),
 '00000000-0000-0000-0000-000000000001'),

('spine_v2', 'table', 'people', 'People', 'User profiles and identity',
 jsonb_build_object('table_name', 'people', 'schema', 'v2'),
 jsonb_build_array(
   jsonb_build_object('name', 'id', 'type', 'uuid', 'nullable', false),
   jsonb_build_object('name', 'full_name', 'type', 'text', 'nullable', false),
   jsonb_build_object('name', 'email', 'type', 'text', 'nullable', false),
   jsonb_build_object('name', 'account_id', 'type', 'uuid', 'nullable', false)
 ),
 jsonb_build_array(
   jsonb_build_object('target_type', 'accounts', 'relationship', 'belongs_to'),
   jsonb_build_object('target_type', 'users', 'relationship', 'has_user_account')
 ),
 jsonb_build_object('read', 'authenticated', 'write', 'admin'),
 jsonb_build_array('core', 'identity', 'user'),
 '00000000-0000-0000-0000-000000000001'),

('spine_v2', 'table', 'items', 'Items', 'Generic data items with type registry',
 jsonb_build_object('table_name', 'items', 'schema', 'v2'),
 jsonb_build_array(
   jsonb_build_object('name', 'id', 'type', 'uuid', 'nullable', false),
   jsonb_build_object('name', 'item_type_id', 'type', 'uuid', 'nullable', false),
   jsonb_build_object('name', 'data', 'type', 'jsonb', 'nullable', false),
   jsonb_build_object('name', 'account_id', 'type', 'uuid', 'nullable', false)
 ),
 jsonb_build_array(
   jsonb_build_object('target_type', 'item_types', 'relationship', 'has_type'),
   jsonb_build_object('target_type', 'threads', 'relationship', 'has_discussions')
 ),
 jsonb_build_object('read', 'authenticated', 'write', 'authenticated'),
 jsonb_build_array('core', 'data', 'generic'),
 '00000000-0000-0000-0000-000000000001');

-- API endpoints documentation
INSERT INTO v2.api_endpoints (
  path, method, handler_function, display_name, description,
  parameters, request_schema, response_schema,
  authentication_required, required_permissions, rate_limit,
  is_public, version, tags, examples, account_id
)
VALUES
-- Authentication endpoints
('/auth/login', 'POST', 'auth.handler', 'Login', 'Authenticate user and get access token',
 jsonb_build_array(
   jsonb_build_object('name', 'email', 'type', 'string', 'required', true),
   jsonb_build_object('name', 'password', 'type', 'string', 'required', true)
 ),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'email', jsonb_build_object('type', 'string', 'format', 'email'),
     'password', jsonb_build_object('type', 'string', 'minLength', 8)
   ),
   'required', jsonb_build_array('email', 'password')
 ),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'access_token', jsonb_build_object('type', 'string'),
     'refresh_token', jsonb_build_object('type', 'string'),
     'user', jsonb_build_object('$ref', '#/components/schemas/User')
   )
 ),
 true, jsonb_build_array(), 100, true, 'v1',
 jsonb_build_array('authentication', 'security'),
 jsonb_build_array(
   jsonb_build_object('request', jsonb_build_object('email', 'user@example.com', 'password', 'secret123')),
   jsonb_build_object('response', jsonb_build_object('access_token', 'eyJ...', 'user', jsonb_build_object('id', 'uuid', 'email', 'user@example.com')))
 ),
 '00000000-0000-0000-0000-000000000001'),

('/auth/refresh', 'POST', 'auth.handler', 'Refresh Token', 'Refresh access token using refresh token',
 jsonb_build_array(
   jsonb_build_object('name', 'refresh_token', 'type', 'string', 'required', true)
 ),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'refresh_token', jsonb_build_object('type', 'string')
   ),
   'required', jsonb_build_array('refresh_token')
 ),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'access_token', jsonb_build_object('type', 'string'),
     'refresh_token', jsonb_build_object('type', 'string')
   )
 ),
 true, jsonb_build_array(), 100, true, 'v1',
 jsonb_build_array('authentication', 'security'),
 jsonb_build_array(
   jsonb_build_object('request', jsonb_build_object('refresh_token', 'eyJ...')),
   jsonb_build_object('response', jsonb_build_object('access_token', 'eyJ...', 'refresh_token', 'eyJ...'))
 ),
 '00000000-0000-0000-0000-000000000001'),

-- User endpoints
('/users/me', 'GET', 'users.handler', 'Get Current User', 'Get current authenticated user profile',
 jsonb_build_array(),
 jsonb_build_object('type', 'object'),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'id', jsonb_build_object('type', 'string', 'format', 'uuid'),
     'full_name', jsonb_build_object('type', 'string'),
     'email', jsonb_build_object('type', 'string', 'format', 'email'),
     'account', jsonb_build_object('$ref', '#/components/schemas/Account')
   )
 ),
 true, jsonb_build_array(), 1000, false, 'v1',
 jsonb_build_array('users', 'profile'),
 jsonb_build_array(
   jsonb_build_object('response', jsonb_build_object('id', 'uuid', 'full_name', 'John Doe', 'email', 'john@example.com'))
 ),
 '00000000-0000-0000-0000-000000000001'),

('/users', 'GET', 'users.handler', 'List Users', 'List users in current account',
 jsonb_build_array(
   jsonb_build_object('name', 'limit', 'type', 'integer', 'default', 100),
   jsonb_build_object('name', 'offset', 'type', 'integer', 'default', 0)
 ),
 jsonb_build_object('type', 'object'),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'users', jsonb_build_object('type', 'array', 'items', jsonb_build_object('$ref', '#/components/schemas/User')),
     'total', jsonb_build_object('type', 'integer')
   )
 ),
 true, jsonb_build_array('users.read'), 500, false, 'v1',
 jsonb_build_array('users', 'admin'),
 jsonb_build_array(
   jsonb_build_object('request', jsonb_build_object('limit', 10)),
   jsonb_build_object('response', jsonb_build_object('users', jsonb_build_array(jsonb_build_object('id', 'uuid', 'full_name', 'John Doe')), 'total', 1))
 ),
 '00000000-0000-0000-0000-000000000001'),

-- Item endpoints
('/items', 'GET', 'items.handler', 'List Items', 'List items with optional filtering',
 jsonb_build_array(
   jsonb_build_object('name', 'item_type', 'type', 'string'),
   jsonb_build_object('name', 'limit', 'type', 'integer', 'default', 100),
   jsonb_build_object('name', 'offset', 'type', 'integer', 'default', 0)
 ),
 jsonb_build_object('type', 'object'),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'items', jsonb_build_object('type', 'array', 'items', jsonb_build_object('$ref', '#/components/schemas/Item')),
     'total', jsonb_build_object('type', 'integer')
   )
 ),
 true, jsonb_build_array('items.read'), 1000, false, 'v1',
 jsonb_build_array('items', 'data'),
 jsonb_build_array(
   jsonb_build_object('request', jsonb_build_object('item_type', 'task')),
   jsonb_build_object('response', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('id', 'uuid', 'data', jsonb_build_object('title', 'Sample Task'))), 'total', 1))
 ),
 '00000000-0000-0000-0000-000000000001'),

('/items', 'POST', 'items.handler', 'Create Item', 'Create new item',
 jsonb_build_array(),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'item_type_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
     'data', jsonb_build_object('type', 'object')
   ),
   'required', jsonb_build_array('item_type_id', 'data')
 ),
 jsonb_build_object(
   'type', 'object',
   'properties', jsonb_build_object(
     'id', jsonb_build_object('type', 'string', 'format', 'uuid'),
     'item_type_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
     'data', jsonb_build_object('type', 'object'),
     'created_at', jsonb_build_object('type', 'string', 'format', 'date-time')
   )
 ),
 true, jsonb_build_array('items.write'), 100, false, 'v1',
 jsonb_build_array('items', 'data'),
 jsonb_build_array(
   jsonb_build_object('request', jsonb_build_object('item_type_id', 'uuid', 'data', jsonb_build_object('title', 'New Task', 'priority', 'high'))),
   jsonb_build_object('response', jsonb_build_object('id', 'uuid', 'item_type_id', 'uuid', 'data', jsonb_build_object('title', 'New Task', 'priority', 'high')))
 ),
 '00000000-0000-0000-0000-000000000001');

-- Impersonation policies
INSERT INTO v2.impersonation_policies (
  name, description, policy_type, conditions, permissions, restrictions,
  time_restrictions, ip_restrictions, priority, account_id
)
VALUES
-- Admin impersonation policy
('admin_impersonation', 'Allow admins to impersonate any user', 'allow',
 jsonb_build_object(
   'impersonator_role', 'admin',
   'target_account_same', true
 ),
 jsonb_build_array('read', 'write', 'admin'),
 jsonb_build_object(
   'duration_hours', 8,
   'require_reason', true
 ),
 jsonb_build_object('business_hours_only', true),
 jsonb_build_array('192.168.1.0/24'),
 10,
 '00000000-0000-0000-0000-000000000001'),

-- Self-service impersonation policy
('self_service_impersonation', 'Allow users to impersonate themselves for testing', 'allow',
 jsonb_build_object(
   'impersonator_role', 'member',
   'target_same_user', true
 ),
 jsonb_build_array('read'),
 jsonb_build_object(
   'duration_hours', 1,
   'require_reason', false
 ),
 jsonb_build_object(),
 jsonb_build_array(),
 100,
 '00000000-0000-0000-0000-000000000001'),

-- Deny policy for sensitive accounts
('sensitive_accounts_deny', 'Deny impersonation of sensitive accounts', 'deny',
 jsonb_build_object(
   'target_account_type', 'tenant',
   'target_role', 'owner'
 ),
 jsonb_build_array(),
 jsonb_build_object(),
 jsonb_build_object(),
 jsonb_build_array(),
 1,
 '00000000-0000-0000-0000-000000000001');

-- Provisioning templates
INSERT INTO v2.provisioning_templates (
  name, description, template_type, config, default_values,
  validation_rules, approval_required, auto_activate, account_id
)
VALUES
-- User provisioning template
('standard_user', 'Standard user account with email authentication', 'user',
 jsonb_build_object(
   'auth_provider', 'email',
   'default_role', 'member',
   'send_welcome_email', true
 ),
 jsonb_build_object(
   'account_type', 'organization',
   'create_account', false
 ),
 jsonb_build_object(
   'required_fields', jsonb_build_array('email', 'full_name'),
   'email_format', 'email'
 ),
 false, true,
 '00000000-0000-0000-0000-000000000001'),

-- Organization account template
('organization_account', 'New organization account with admin user', 'account',
 jsonb_build_object(
   'account_type', 'organization',
   'create_admin_user', true,
   'default_apps', jsonb_build_array('core', 'dashboard')
 ),
 jsonb_build_object(
   'admin_role', 'admin',
   'send_setup_email', true
 ),
 jsonb_build_object(
   'required_fields', jsonb_build_array('name', 'admin_email', 'admin_name'),
   'unique_name', true
 ),
 true, true,
 '00000000-0000-0000-0000-000000000001'),

-- Custom app template
('custom_app', 'Custom application with basic configuration', 'app',
 jsonb_build_object(
   'app_type', 'custom',
   'default_version', '1.0.0',
   'enable_features', jsonb_build_array('items', 'threads', 'automations')
 ),
 jsonb_build_object(
   'is_active', true,
   'public', false
 ),
 jsonb_build_object(
   'required_fields', jsonb_build_array('slug', 'name'),
   'slug_format', 'slug'
 ),
 false, true,
 '00000000-0000-0000-0000-000000000001'),

-- Integration template
('api_integration', 'API integration with key authentication', 'integration',
 jsonb_build_object(
   'integration_type', 'api',
   'auth_type', 'api_key',
   'auto_sync', false
 ),
 jsonb_build_object(
   'is_active', false,
   'test_connection', true
 ),
 jsonb_build_object(
   'required_fields', jsonb_build_array('name', 'provider', 'base_url'),
   'url_format', 'url'
 ),
 false, false,
 '00000000-0000-0000-0000-000000000001');

-- Helper functions for advanced features

-- Function to get system overview
CREATE OR REPLACE FUNCTION v2_get_system_overview()
RETURNS TABLE (
  component_name text,
  component_type text,
  status text,
  metrics jsonb
) AS $$
BEGIN
  -- Graph traversal status
  RETURN QUERY SELECT 
    'graph_traversal' as component_name,
    'infrastructure' as component_type,
    'active' as status,
    jsonb_build_object(
      'total_edges', (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true),
      'total_nodes', (SELECT COUNT(DISTINCT source_type || '|' || source_id) FROM v2.graph_edges WHERE is_active = true),
      'cached_paths', (SELECT COUNT(*) FROM v2.graph_paths WHERE expires_at > now())
    ) as metrics;
  
  -- Introspection status
  RETURN QUERY SELECT 
    'introspection' as component_name,
    'infrastructure' as component_type,
    'active' as status,
    jsonb_build_object(
      'documented_objects', (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true),
      'api_endpoints', (SELECT COUNT(*) FROM v2.api_endpoints WHERE is_public = true),
      'last_sync', (SELECT MAX(updated_at) FROM v2.schema_metadata)
    ) as metrics;
  
  -- Impersonation status
  RETURN QUERY SELECT 
    'impersonation' as component_name,
    'security' as component_type,
    'active' as status,
    jsonb_build_object(
      'active_sessions', (SELECT COUNT(*) FROM v2.impersonation_sessions WHERE status = 'active'),
      'policies', (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true),
      'recent_activity', (SELECT COUNT(*) FROM v2.impersonation_logs WHERE created_at >= now() - '24 hours'::interval)
    ) as metrics;
  
  -- Provisioning status
  RETURN QUERY SELECT 
    'provisioning' as component_name,
    'automation' as component_type,
    'active' as status,
    jsonb_build_object(
      'active_templates', (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true),
      'pending_requests', (SELECT COUNT(*) FROM v2.provisioning_requests WHERE status = 'pending'),
      'success_rate', (
        SELECT CASE 
          WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) * 100)
          ELSE 0
        END
        FROM v2.provisioning_requests
        WHERE created_at >= now() - '7 days'::interval
      )
    ) as metrics;
END;
$$ LANGUAGE plpgsql;

-- Function to validate advanced features
CREATE OR REPLACE FUNCTION v2_validate_advanced_features()
RETURNS TABLE (
  feature_name text,
  validation_status text,
  issues jsonb,
  recommendations jsonb
) AS $$
BEGIN
  -- Graph traversal validation
  RETURN QUERY SELECT 
    'graph_traversal' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true) > 0 THEN 'healthy'
      ELSE 'warning'
    END as validation_status,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'no_edges', 'message', 'No active graph edges found')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as issues,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'add_edges', 'message', 'Add graph edges to enable traversal')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as recommendations
  FROM (SELECT 1) dummy;
  
  -- Introspection validation
  RETURN QUERY SELECT 
    'introspection' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true) > 0 THEN 'healthy'
      ELSE 'warning'
    END as validation_status,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.api_endpoints WHERE is_public = true) = 0 THEN
          jsonb_build_object('type', 'no_endpoints', 'message', 'No public API endpoints documented')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as issues,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.api_endpoints WHERE is_public = true) = 0 THEN
          jsonb_build_object('type', 'document_endpoints', 'message', 'Document API endpoints for better discoverability')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as recommendations
  FROM (SELECT 1) dummy;
  
  -- Impersonation validation
  RETURN QUERY SELECT 
    'impersonation' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) > 0 THEN 'healthy'
      ELSE 'warning'
    END as validation_status,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'no_policies', 'message', 'No active impersonation policies found')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as issues,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'create_policies', 'message', 'Create impersonation policies for security')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as recommendations
  FROM (SELECT 1) dummy;
  
  -- Provisioning validation
  RETURN QUERY SELECT 
    'provisioning' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) > 0 THEN 'healthy'
      ELSE 'warning'
    END as validation_status,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'no_templates', 'message', 'No active provisioning templates found')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as issues,
    jsonb_build_array(
      CASE 
        WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) = 0 THEN
          jsonb_build_object('type', 'create_templates', 'message', 'Create provisioning templates for automation')
        ELSE NULL
      END
    ) FILTER (WHERE elements IS NOT NULL) as recommendations
  FROM (SELECT 1) dummy;
END;
$$ LANGUAGE plpgsql;

-- Function to get advanced features health
CREATE OR REPLACE FUNCTION v2_get_advanced_features_health()
RETURNS TABLE (
  feature_name text,
  health_score numeric,
  status text,
  last_check timestamptz,
  details jsonb
) AS $$
DECLARE
  health_score numeric;
BEGIN
  -- Calculate overall health scores
  RETURN QUERY SELECT 
    'graph_traversal' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true) > 0 THEN 100
      ELSE 50
    END as health_score,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true) > 0 THEN 'healthy'
      ELSE 'warning'
    END as status,
    now() as last_check,
    jsonb_build_object(
      'active_edges', (SELECT COUNT(*) FROM v2.graph_edges WHERE is_active = true),
      'cached_paths', (SELECT COUNT(*) FROM v2.graph_paths WHERE expires_at > now()),
      'last_path_cleanup', (SELECT MAX(created_at) FROM v2.graph_paths WHERE expires_at <= now())
    ) as details;
  
  RETURN QUERY SELECT 
    'introspection' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true) > 10 THEN 100
      WHEN (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true) > 0 THEN 75
      ELSE 50
    END as health_score,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true) > 10 THEN 'healthy'
      WHEN (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true) > 0 THEN 'warning'
      ELSE 'critical'
    END as status,
    now() as last_check,
    jsonb_build_object(
      'documented_objects', (SELECT COUNT(*) FROM v2.schema_metadata WHERE is_public = true),
      'api_endpoints', (SELECT COUNT(*) FROM v2.api_endpoints WHERE is_public = true),
      'last_sync', (SELECT MAX(updated_at) FROM v2.schema_metadata)
    ) as details;
  
  RETURN QUERY SELECT 
    'impersonation' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) > 0 AND
           (SELECT COUNT(*) FROM v2.impersonation_sessions WHERE status = 'active') < 10 THEN 100
      WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) > 0 THEN 75
      ELSE 50
    END as health_score,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) > 0 AND
           (SELECT COUNT(*) FROM v2.impersonation_sessions WHERE status = 'active') < 10 THEN 'healthy'
      WHEN (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true) > 0 THEN 'warning'
      ELSE 'critical'
    END as status,
    now() as last_check,
    jsonb_build_object(
      'active_sessions', (SELECT COUNT(*) FROM v2.impersonation_sessions WHERE status = 'active'),
      'policies', (SELECT COUNT(*) FROM v2.impersonation_policies WHERE is_active = true),
      'recent_activity', (SELECT COUNT(*) FROM v2.impersonation_logs WHERE created_at >= now() - '24 hours'::interval)
    ) as details;
  
  RETURN QUERY SELECT 
    'provisioning' as feature_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) > 0 AND
           (SELECT COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0) * 100 FROM v2.provisioning_requests WHERE created_at >= now() - '7 days'::interval) > 90 THEN 100
      WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) > 0 THEN 75
      ELSE 50
    END as health_score,
    CASE 
      WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) > 0 AND
           (SELECT COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0) * 100 FROM v2.provisioning_requests WHERE created_at >= now() - '7 days'::interval) > 90 THEN 'healthy'
      WHEN (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true) > 0 THEN 'warning'
      ELSE 'critical'
    END as status,
    now() as last_check,
    jsonb_build_object(
      'active_templates', (SELECT COUNT(*) FROM v2.provisioning_templates WHERE is_active = true),
      'pending_requests', (SELECT COUNT(*) FROM v2.provisioning_requests WHERE status = 'pending'),
      'success_rate_7d', (
        SELECT COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0) * 100
        FROM v2.provisioning_requests
        WHERE created_at >= now() - '7 days'::interval
      )
    ) as details;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.graph_edges IS 'Graph edges for relationship traversal';
COMMENT ON TABLE v2.graph_paths IS 'Precomputed graph paths for performance';
COMMENT ON TABLE v2.schema_metadata IS 'Schema metadata for introspection';
COMMENT ON TABLE v2.api_endpoints IS 'API endpoint documentation';
COMMENT ON TABLE v2.impersonation_sessions IS 'Impersonation session tracking';
COMMENT ON TABLE v2.impersonation_logs IS 'Impersonation activity logs';
COMMENT ON TABLE v2.impersonation_policies IS 'Impersonation access policies';
COMMENT ON TABLE v2.provisioning_templates IS 'Provisioning templates for automated resource creation';
COMMENT ON TABLE v2.provisioning_requests IS 'Provisioning request tracking';
COMMENT ON TABLE v2.provisioning_logs IS 'Provisioning step execution logs';
COMMENT ON FUNCTION v2_get_system_overview() IS 'Get system overview';
COMMENT ON FUNCTION v2_validate_advanced_features() IS 'Validate advanced features';
COMMENT ON FUNCTION v2_get_advanced_features_health() IS 'Get advanced features health';
