-- Migration 053: Create Schedules and Actions Tables
-- Part of Unified Principal Architecture
-- Explicit cron configuration with machine principal identity

-- ============================================
-- CREATE ACTIONS TABLE
-- ============================================
-- Reusable action definitions for scheduled and triggered execution

CREATE TABLE IF NOT EXISTS v2.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  -- Action identification
  name text NOT NULL,
  description text,
  slug text NOT NULL,  -- URL-friendly identifier
  
  -- Handler configuration
  handler text NOT NULL,  -- 'send_email', 'archive_items', 'notify_watchers', etc.
  handler_module text DEFAULT 'functions',  -- 'functions', 'integrations', 'custom'
  config jsonb DEFAULT '{}',  -- Handler-specific configuration
  
  -- Input/output schema (for validation)
  input_schema jsonb DEFAULT '{}',   -- Expected input parameters
  output_schema jsonb DEFAULT '{}',  -- Expected output shape
  
  -- Machine principal (who executes this action)
  default_machine_principal_id uuid REFERENCES v2.api_keys(id),
  required_scopes text[] DEFAULT '{}',  -- Scopes needed to execute
  
  -- State
  is_active boolean DEFAULT true,
  timeout_seconds integer DEFAULT 300,  -- Max execution time
  retry_count integer DEFAULT 3,      -- Auto-retry on failure
  
  -- Metadata
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_actions_account_id ON v2.actions(account_id);
CREATE INDEX idx_actions_slug ON v2.actions(slug);
CREATE INDEX idx_actions_handler ON v2.actions(handler);
CREATE INDEX idx_actions_is_active ON v2.actions(is_active);
CREATE INDEX idx_actions_default_machine ON v2.actions(default_machine_principal_id);
CREATE INDEX idx_actions_required_scopes ON v2.actions USING gin(required_scopes);

-- Unique constraint on slug per account
CREATE UNIQUE INDEX idx_actions_account_slug ON v2.actions(account_id, slug);

-- ============================================
-- CREATE SCHEDULES TABLE
-- ============================================
-- Explicit cron configuration linking to actions and machine principals

CREATE TABLE IF NOT EXISTS v2.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  -- What to run
  action_id uuid NOT NULL REFERENCES v2.actions(id) ON DELETE CASCADE,
  
  -- Execution configuration
  config jsonb DEFAULT '{}',  -- Override action config for this schedule
  
  -- Who runs it (machine principal)
  machine_principal_id uuid NOT NULL REFERENCES v2.api_keys(id),
  delegated_scopes text[] NOT NULL DEFAULT '{}',  -- Snapshot of scopes at creation
  
  -- Schedule timing
  cron_expression text NOT NULL,  -- Standard cron: "*/30 * * * *"
  timezone text DEFAULT 'UTC',
  next_run_at timestamptz,
  last_run_at timestamptz,
  
  -- Execution limits
  max_runtime_seconds integer DEFAULT 300,
  max_retries integer DEFAULT 3,
  
  -- State
  is_active boolean DEFAULT true,
  is_paused boolean DEFAULT false,  -- Manual pause (distinct from is_active)
  pause_reason text,  -- Why paused (e.g., "Creator deactivated")
  
  -- Execution tracking
  failure_count integer DEFAULT 0,
  success_count integer DEFAULT 0,
  last_error text,
  last_error_at timestamptz,
  
  -- Metadata
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for scheduler queries
CREATE INDEX idx_schedules_next_run ON v2.schedules(next_run_at) 
  WHERE is_active = true AND is_paused = false;
CREATE INDEX idx_schedules_account_id ON v2.schedules(account_id);
CREATE INDEX idx_schedules_action_id ON v2.schedules(action_id);
CREATE INDEX idx_schedules_machine_principal ON v2.schedules(machine_principal_id);
CREATE INDEX idx_schedules_is_active ON v2.schedules(is_active);
CREATE INDEX idx_schedules_is_paused ON v2.schedules(is_paused);
CREATE INDEX idx_schedules_created_by ON v2.schedules(created_by);

-- ============================================
-- CREATE SCHEDULE_EXECUTIONS TABLE (for audit trail)
-- ============================================

CREATE TABLE IF NOT EXISTS v2.schedule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES v2.schedules(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  -- Execution details
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'timeout', 'cancelled')),
  
  -- Principal that executed
  machine_principal_id uuid NOT NULL REFERENCES v2.api_keys(id),
  
  -- Input/output
  input_params jsonb DEFAULT '{}',
  output_result jsonb,
  
  -- Error tracking
  error_message text,
  error_stack text,
  
  -- Performance
  duration_ms integer,
  
  -- Audit
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_schedule_executions_schedule_id ON v2.schedule_executions(schedule_id);
CREATE INDEX idx_schedule_executions_account_id ON v2.schedule_executions(account_id);
CREATE INDEX idx_schedule_executions_status ON v2.schedule_executions(status);
CREATE INDEX idx_schedule_executions_started_at ON v2.schedule_executions(started_at);

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE v2.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2.schedule_executions ENABLE ROW LEVEL SECURITY;

-- Actions RLS
CREATE POLICY actions_account_isolation ON v2.actions
  FOR ALL
  USING (account_id IN (SELECT v2.get_accessible_accounts(auth.uid())));

-- Schedules RLS
CREATE POLICY schedules_account_isolation ON v2.schedules
  FOR ALL
  USING (account_id IN (SELECT v2.get_accessible_accounts(auth.uid())));

-- Schedule executions RLS
CREATE POLICY schedule_executions_account_isolation ON v2.schedule_executions
  FOR ALL
  USING (account_id IN (SELECT v2.get_accessible_accounts(auth.uid())));

-- ============================================
-- CREATE HELPER FUNCTIONS
-- ============================================

-- Calculate next run time from cron expression
CREATE OR REPLACE FUNCTION v2.calculate_next_run(
  p_cron_expression text,
  p_timezone text DEFAULT 'UTC',
  p_from_time timestamptz DEFAULT now()
)
RETURNS timestamptz AS $$
DECLARE
  result timestamptz;
BEGIN
  -- Use pg_cron extension syntax or fallback to simple intervals
  -- For now, use a simple parser for common patterns
  -- Full cron parsing would require pg_cron or pg_schedule extension
  
  -- Handle common patterns
  CASE p_cron_expression
    WHEN '* * * * *' THEN result := p_from_time + interval '1 minute';
    WHEN '*/5 * * * *' THEN result := p_from_time + interval '5 minutes';
    WHEN '*/10 * * * *' THEN result := p_from_time + interval '10 minutes';
    WHEN '*/15 * * * *' THEN result := p_from_time + interval '15 minutes';
    WHEN '*/30 * * * *' THEN result := p_from_time + interval '30 minutes';
    WHEN '0 * * * *' THEN result := date_trunc('hour', p_from_time) + interval '1 hour';
    WHEN '0 */2 * * *' THEN result := date_trunc('hour', p_from_time) + interval '2 hours';
    WHEN '0 */6 * * *' THEN result := date_trunc('hour', p_from_time) + interval '6 hours';
    WHEN '0 */12 * * *' THEN result := date_trunc('hour', p_from_time) + interval '12 hours';
    WHEN '0 0 * * *' THEN result := date_trunc('day', p_from_time) + interval '1 day';
    WHEN '0 0 * * 0' THEN result := date_trunc('week', p_from_time) + interval '1 week';
    WHEN '0 0 1 * *' THEN result := date_trunc('month', p_from_time) + interval '1 month';
    ELSE
      -- Default to 1 hour if unrecognized
      result := p_from_time + interval '1 hour';
  END CASE;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Get schedules due for execution
CREATE OR REPLACE FUNCTION v2.get_due_schedules(p_now timestamptz DEFAULT now())
RETURNS TABLE (
  schedule_id uuid,
  account_id uuid,
  action_id uuid,
  machine_principal_id uuid,
  config jsonb,
  delegated_scopes text[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.account_id,
    s.action_id,
    s.machine_principal_id,
    s.config,
    s.delegated_scopes
  FROM v2.schedules s
  WHERE s.is_active = true
    AND s.is_paused = false
    AND (s.next_run_at IS NULL OR s.next_run_at <= p_now);
END;
$$ LANGUAGE plpgsql;

-- Update schedule after execution
CREATE OR REPLACE FUNCTION v2.update_schedule_after_run(
  p_schedule_id uuid,
  p_success boolean,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  schedule_record RECORD;
BEGIN
  SELECT * INTO schedule_record
  FROM v2.schedules
  WHERE id = p_schedule_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  IF p_success THEN
    UPDATE v2.schedules
    SET 
      last_run_at = now(),
      next_run_at = v2.calculate_next_run(cron_expression, timezone, now()),
      success_count = success_count + 1,
      failure_count = 0,
      last_error = NULL,
      last_error_at = NULL,
      updated_at = now()
    WHERE id = p_schedule_id;
  ELSE
    UPDATE v2.schedules
    SET 
      last_run_at = now(),
      failure_count = failure_count + 1,
      last_error = p_error_message,
      last_error_at = now(),
      -- Auto-pause if too many failures
      is_paused = CASE WHEN failure_count >= max_retries THEN true ELSE is_paused END,
      pause_reason = CASE WHEN failure_count >= max_retries THEN 'Max retries exceeded' ELSE pause_reason END,
      updated_at = now()
    WHERE id = p_schedule_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Validate schedule can run (creator still active)
CREATE OR REPLACE FUNCTION v2.validate_schedule_creator(p_schedule_id uuid)
RETURNS TABLE (
  is_valid boolean,
  error_message text
) AS $$
DECLARE
  schedule_record RECORD;
  creator_record RECORD;
BEGIN
  SELECT * INTO schedule_record
  FROM v2.schedules
  WHERE id = p_schedule_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Schedule not found'::text;
    RETURN;
  END IF;
  
  -- Check if creator is still active
  SELECT is_active INTO creator_record
  FROM v2.people
  WHERE id = schedule_record.created_by;
  
  IF creator_record IS NULL OR NOT creator_record.is_active THEN
    -- Auto-pause the schedule
    UPDATE v2.schedules
    SET is_paused = true, pause_reason = 'Creator deactivated', updated_at = now()
    WHERE id = p_schedule_id;
    
    RETURN QUERY SELECT false, 'Schedule creator deactivated; schedule paused'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, NULL::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA: DEFAULT ACTIONS
-- ============================================

-- Get the system cron machine principal ID
DO $$
DECLARE
  v_cron_machine_id uuid;
  v_trigger_machine_id uuid;
  v_root_account_id uuid;
  v_system_admin_id uuid;
BEGIN
  -- Get system machine principals
  SELECT id INTO v_cron_machine_id
  FROM v2.api_keys
  WHERE name = 'System Cron Runner' AND is_internal = true
  LIMIT 1;
  
  SELECT id INTO v_trigger_machine_id
  FROM v2.api_keys
  WHERE name = 'System Trigger Runner' AND is_internal = true
  LIMIT 1;
  
  -- Get root account
  SELECT id INTO v_root_account_id
  FROM v2.accounts
  WHERE parent_id IS NULL AND account_type = 'tenant'
  LIMIT 1;
  
  -- Get system admin
  SELECT id INTO v_system_admin_id
  FROM v2.people
  WHERE email = 'kpettit851@gmail.com'
  LIMIT 1;
  
  -- Create default actions
  IF v_root_account_id IS NOT NULL AND v_system_admin_id IS NOT NULL THEN
    -- Send Email action
    INSERT INTO v2.actions (
      account_id, name, description, slug, handler, handler_module, config,
      default_machine_principal_id, required_scopes, created_by
    ) VALUES (
      v_root_account_id,
      'Send Email',
      'Send email notification to recipients',
      'send_email',
      'send_email',
      'functions',
      '{"template_engine": "handlebars", "default_from": "system@spine.dev"}',
      v_trigger_machine_id,
      ARRAY['email:send'],
      v_system_admin_id
    )
    ON CONFLICT (account_id, slug) DO NOTHING;
    
    -- Archive Old Items action
    INSERT INTO v2.actions (
      account_id, name, description, slug, handler, handler_module, config,
      default_machine_principal_id, required_scopes, created_by
    ) VALUES (
      v_root_account_id,
      'Archive Old Items',
      'Archive items older than specified age',
      'archive_old_items',
      'archive_items',
      'functions',
      '{"default_age_days": 90, "archive_type": "soft"}',
      v_cron_machine_id,
      ARRAY['items:read', 'items:write'],
      v_system_admin_id
    )
    ON CONFLICT (account_id, slug) DO NOTHING;
    
    -- Generate Report action
    INSERT INTO v2.actions (
      account_id, name, description, slug, handler, handler_module, config,
      default_machine_principal_id, required_scopes, created_by
    ) VALUES (
      v_root_account_id,
      'Generate Report',
      'Generate and deliver scheduled reports',
      'generate_report',
      'generate_report',
      'functions',
      '{"output_format": "pdf", "delivery": "email"}',
      v_cron_machine_id,
      ARRAY['items:read', 'people:read', 'email:send'],
      v_system_admin_id
    )
    ON CONFLICT (account_id, slug) DO NOTHING;
    
    -- Notify Watchers action
    INSERT INTO v2.actions (
      account_id, name, description, slug, handler, handler_module, config,
      default_machine_principal_id, required_scopes, created_by
    ) VALUES (
      v_root_account_id,
      'Notify Watchers',
      'Send notifications to item watchers',
      'notify_watchers',
      'notify_watchers',
      'functions',
      '{"notification_type": "email", "include_changes": true}',
      v_trigger_machine_id,
      ARRAY['items:read', 'people:read', 'notifications:send'],
      v_system_admin_id
    )
    ON CONFLICT (account_id, slug) DO NOTHING;
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE v2.actions IS 'Reusable action definitions for scheduled and triggered execution';
COMMENT ON TABLE v2.schedules IS 'Explicit cron-like schedule configuration with machine principal identity';
COMMENT ON TABLE v2.schedule_executions IS 'Audit log of schedule executions with full provenance';

COMMENT ON FUNCTION v2.calculate_next_run(text, text, timestamptz) IS 'Calculate next execution time from cron expression';
COMMENT ON FUNCTION v2.get_due_schedules(timestamptz) IS 'Get all schedules due for execution';
COMMENT ON FUNCTION v2.update_schedule_after_run(uuid, boolean, text) IS 'Update schedule state after execution (success or failure)';
COMMENT ON FUNCTION v2.validate_schedule_creator(uuid) IS 'Validate schedule can run (checks creator is still active)';
