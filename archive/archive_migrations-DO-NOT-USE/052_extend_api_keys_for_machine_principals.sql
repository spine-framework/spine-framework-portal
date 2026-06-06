-- Migration 052: Extend api_keys for Machine Principals
-- Part of Unified Principal Architecture
-- Converts api_keys to machine_principals model

-- ============================================
-- ADD MACHINE PRINCIPAL COLUMNS
-- ============================================

-- Scopes array for explicit permission grants
ALTER TABLE v2.api_keys ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT '{}';

-- Machine type classification
ALTER TABLE v2.api_keys ADD COLUMN IF NOT EXISTS machine_type text DEFAULT 'integration' 
  CHECK (machine_type IN ('integration', 'service_account', 'internal'));

-- Flag for internal system use (cron, trigger, pipeline)
ALTER TABLE v2.api_keys ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT false;

-- ============================================
-- CREATE INDEXES
-- ============================================

-- GIN index for fast scope lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_scopes ON v2.api_keys USING gin(scopes);

-- Index for machine type queries
CREATE INDEX IF NOT EXISTS idx_api_keys_machine_type ON v2.api_keys(machine_type);

-- Index for internal/external filtering
CREATE INDEX IF NOT EXISTS idx_api_keys_is_internal ON v2.api_keys(is_internal);

-- ============================================
-- BACKFILL: CONVERT PERMISSIONS JSONB TO SCOPES ARRAY
-- ============================================

-- Convert existing permissions object keys to scopes array
UPDATE v2.api_keys 
SET scopes = ARRAY(SELECT jsonb_object_keys(permissions))
WHERE permissions != '{}' 
  AND (scopes IS NULL OR scopes = '{}');

-- Default scopes for keys without permissions
UPDATE v2.api_keys 
SET scopes = CASE key_type
  WHEN 'public' THEN ARRAY['items:read', 'people:read']
  WHEN 'private' THEN ARRAY['items:read', 'items:write', 'people:read']
  WHEN 'secret' THEN ARRAY['items:read', 'items:write', 'items:delete', 'people:read', 'people:write']
  WHEN 'webhook' THEN ARRAY['webhooks:receive']
  ELSE ARRAY['items:read']
END
WHERE scopes = '{}' OR scopes IS NULL;

-- ============================================
-- ENABLE RLS ON API_KEYS
-- ============================================

ALTER TABLE v2.api_keys ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS api_keys_account_isolation ON v2.api_keys;
DROP POLICY IF EXISTS api_keys_owner_access ON v2.api_keys;

-- RLS Policy: Account isolation with machine self-access
CREATE POLICY api_keys_account_isolation ON v2.api_keys
  FOR ALL
  USING (
    -- Human access: account must be in accessible hierarchy
    account_id IN (
      SELECT v2.get_accessible_accounts(auth.uid())
    )
    OR
    -- Machine self-access: machine principals can see their own record
    id = auth.uid()::uuid
  );

-- ============================================
-- CREATE FUNCTION: VALIDATE MACHINE PRINCIPAL
-- ============================================

CREATE OR REPLACE FUNCTION v2.validate_machine_principal(
  p_key_value text,
  p_required_scope text DEFAULT NULL
)
RETURNS TABLE (
  is_valid boolean,
  machine_id uuid,
  account_id uuid,
  scopes text[],
  machine_type text,
  is_internal boolean,
  created_by uuid,
  error_message text
) AS $$
DECLARE
  key_record RECORD;
BEGIN
  -- Get machine principal by key value
  SELECT * INTO key_record
  FROM v2.api_keys
  WHERE key_value = p_key_value
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT 
      false, 
      NULL::uuid, 
      NULL::uuid, 
      NULL::text[], 
      NULL::text, 
      NULL::boolean, 
      NULL::uuid, 
      'Invalid or inactive machine principal'::text;
    RETURN;
  END IF;
  
  -- Check required scope if specified
  IF p_required_scope IS NOT NULL THEN
    IF NOT (p_required_scope = ANY(key_record.scopes) OR '*:*' = ANY(key_record.scopes)) THEN
      RETURN QUERY SELECT 
        false, 
        NULL::uuid, 
        NULL::uuid, 
        NULL::text[], 
        NULL::text, 
        NULL::boolean, 
        NULL::uuid, 
        'Insufficient scope: ' || p_required_scope::text;
      RETURN;
    END IF;
  END IF;
  
  -- Update last used timestamp
  UPDATE v2.api_keys
  SET last_used_at = now(), usage_count = usage_count + 1
  WHERE id = key_record.id;
  
  RETURN QUERY SELECT 
    true,
    key_record.id,
    key_record.account_id,
    key_record.scopes,
    key_record.machine_type,
    key_record.is_internal,
    key_record.created_by,
    NULL::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE FUNCTION: CHECK MACHINE SCOPE
-- ============================================

CREATE OR REPLACE FUNCTION v2.machine_has_scope(
  p_machine_id uuid,
  p_scope text
)
RETURNS boolean AS $$
DECLARE
  machine_scopes text[];
BEGIN
  SELECT scopes INTO machine_scopes
  FROM v2.api_keys
  WHERE id = p_machine_id
    AND is_active = true;
  
  IF machine_scopes IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for exact match, wildcard resource, or wildcard all
  RETURN p_scope = ANY(machine_scopes)
    OR split_part(p_scope, ':', 1) || ':*' = ANY(machine_scopes)
    OR '*:*' = ANY(machine_scopes);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE HELPER FUNCTION: GET MACHINE PRINCIPAL BY ID
-- ============================================

CREATE OR REPLACE FUNCTION v2.get_machine_principal(p_machine_id uuid)
RETURNS TABLE (
  id uuid,
  account_id uuid,
  name text,
  scopes text[],
  machine_type text,
  is_internal boolean,
  is_active boolean,
  created_by uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ak.id,
    ak.account_id,
    ak.name,
    ak.scopes,
    ak.machine_type,
    ak.is_internal,
    ak.is_active,
    ak.created_by
  FROM v2.api_keys ak
  WHERE ak.id = p_machine_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA: DEFAULT INTERNAL MACHINE PRINCIPALS
-- ============================================

-- Create internal machine principal for system cron
INSERT INTO v2.api_keys (
  name, key_value, key_prefix, key_type, scopes, machine_type, is_internal, 
  is_active, account_id, created_by
)
SELECT 
  'System Cron Runner',
  'spine_internal_cron_' || encode(gen_random_bytes(16), 'hex'),
  'spine_internal_',
  'secret',
  ARRAY['items:read', 'items:write', 'items:delete', 'people:read', 'people:write', 'accounts:read', 'logs:write', 'schedules:read', 'schedules:write', 'actions:read', 'actions:write'],
  'internal',
  true,
  true,
  id,  -- Use the root tenant account
  (SELECT id FROM v2.people WHERE email = 'kpettit851@gmail.com' LIMIT 1)
FROM v2.accounts 
WHERE parent_id IS NULL 
  AND account_type = 'tenant'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Create internal machine principal for trigger execution
INSERT INTO v2.api_keys (
  name, key_value, key_prefix, key_type, scopes, machine_type, is_internal, 
  is_active, account_id, created_by
)
SELECT 
  'System Trigger Runner',
  'spine_internal_trigger_' || encode(gen_random_bytes(16), 'hex'),
  'spine_internal_',
  'secret',
  ARRAY['items:read', 'items:write', 'people:read', 'accounts:read', 'logs:write', 'triggers:read', 'actions:read', 'actions:write', 'notifications:send'],
  'internal',
  true,
  true,
  id,
  (SELECT id FROM v2.people WHERE email = 'kpettit851@gmail.com' LIMIT 1)
FROM v2.accounts 
WHERE parent_id IS NULL 
  AND account_type = 'tenant'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Create internal machine principal for pipeline execution
INSERT INTO v2.api_keys (
  name, key_value, key_prefix, key_type, scopes, machine_type, is_internal, 
  is_active, account_id, created_by
)
SELECT 
  'System Pipeline Runner',
  'spine_internal_pipeline_' || encode(gen_random_bytes(16), 'hex'),
  'spine_internal_',
  'secret',
  ARRAY['items:read', 'items:write', 'people:read', 'accounts:read', 'logs:write', 'pipelines:read', 'pipeline_executions:read', 'pipeline_executions:write', 'actions:read', 'actions:write'],
  'internal',
  true,
  true,
  id,
  (SELECT id FROM v2.people WHERE email = 'kpettit851@gmail.com' LIMIT 1)
FROM v2.accounts 
WHERE parent_id IS NULL 
  AND account_type = 'tenant'
LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN v2.api_keys.scopes IS 'Explicit permission grants for machine principals (e.g., items:read, people:write)';
COMMENT ON COLUMN v2.api_keys.machine_type IS 'Classification: integration (external), service_account (external service), internal (system cron/trigger/pipeline)';
COMMENT ON COLUMN v2.api_keys.is_internal IS 'True for system-internal machine principals that should not be exposed in UI';

COMMENT ON FUNCTION v2.validate_machine_principal(text, text) IS 'Validate a machine principal by API key and optional required scope';
COMMENT ON FUNCTION v2.machine_has_scope(uuid, text) IS 'Check if a machine principal has a specific scope (supports wildcards)';
COMMENT ON FUNCTION v2.get_machine_principal(uuid) IS 'Get machine principal details by ID';
