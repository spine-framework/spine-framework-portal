-- Migration 058: Add RLS to Automation and Infrastructure Tables
-- Part of Unified Principal Architecture
-- Enables Row-Level Security on apps, pipelines, triggers, timers, integrations, logs

-- ============================================
-- APPS TABLE RLS
-- ============================================

ALTER TABLE v2.apps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apps_access ON v2.apps;

CREATE POLICY apps_access ON v2.apps
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- APPS_ACCOUNTS TABLE RLS
-- ============================================

ALTER TABLE v2.apps_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apps_accounts_access ON v2.apps_accounts;

CREATE POLICY apps_accounts_access ON v2.apps_accounts
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- APPS_INTEGRATIONS TABLE RLS
-- ============================================

ALTER TABLE v2.apps_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apps_integrations_access ON v2.apps_integrations;

CREATE POLICY apps_integrations_access ON v2.apps_integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM v2.apps_accounts aa
      WHERE aa.app_id = v2.apps_integrations.app_id
        AND aa.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM v2.apps_accounts aa
      WHERE aa.app_id = v2.apps_integrations.app_id
        AND aa.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
  );

-- ============================================
-- PIPELINES TABLE RLS
-- ============================================

ALTER TABLE v2.pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipelines_access ON v2.pipelines;

CREATE POLICY pipelines_access ON v2.pipelines
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- PIPELINE_EXECUTIONS TABLE RLS
-- ============================================

ALTER TABLE v2.pipeline_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pipeline_executions_access ON v2.pipeline_executions;

CREATE POLICY pipeline_executions_access ON v2.pipeline_executions
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- TRIGGERS TABLE RLS
-- ============================================

ALTER TABLE v2.triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triggers_access ON v2.triggers;

CREATE POLICY triggers_access ON v2.triggers
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- TRIGGER_EXECUTIONS TABLE RLS
-- ============================================

ALTER TABLE v2.trigger_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trigger_executions_access ON v2.trigger_executions;

CREATE POLICY trigger_executions_access ON v2.trigger_executions
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- TIMERS TABLE RLS
-- ============================================

ALTER TABLE v2.timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timers_access ON v2.timers;

CREATE POLICY timers_access ON v2.timers
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- INTEGRATIONS TABLE RLS
-- ============================================

ALTER TABLE v2.integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integrations_access ON v2.integrations;

-- Integrations are account-scoped
CREATE POLICY integrations_access ON v2.integrations
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- OAUTH_CONNECTIONS TABLE RLS
-- ============================================

ALTER TABLE v2.oauth_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_connections_access ON v2.oauth_connections;

CREATE POLICY oauth_connections_access ON v2.oauth_connections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM v2.integrations i
      WHERE i.id = v2.oauth_connections.integration_id
        AND i.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM v2.integrations i
      WHERE i.id = v2.oauth_connections.integration_id
        AND i.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
  );

-- ============================================
-- PENDING_ACTIONS TABLE RLS
-- ============================================

ALTER TABLE v2.pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_actions_access ON v2.pending_actions;

CREATE POLICY pending_actions_access ON v2.pending_actions
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- OUTBOX TABLE RLS
-- ============================================

ALTER TABLE v2.outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_access ON v2.outbox;

CREATE POLICY outbox_access ON v2.outbox
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- WEBHOOKS TABLE RLS
-- ============================================

ALTER TABLE v2.webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhooks_access ON v2.webhooks;

CREATE POLICY webhooks_access ON v2.webhooks
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- LOGS TABLE RLS
-- ============================================

ALTER TABLE v2.logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS logs_access ON v2.logs;

-- Logs are visible in accessible accounts, but create requires account_id match
CREATE POLICY logs_access ON v2.logs
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- API_KEYS TABLE RLS (already added in migration 052, but ensure indexes)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_api_keys_account_id_lookup ON v2.api_keys(account_id, is_active);

-- ============================================
-- SCHEDULES TABLE RLS (already added in migration 053, but ensure indexes)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_schedules_account_lookup ON v2.schedules(account_id, is_active, is_paused);

-- ============================================
-- ACTIONS TABLE RLS (already added in migration 053, but ensure indexes)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_actions_account_lookup ON v2.actions(account_id, is_active);

-- ============================================
-- CREATE INDEXES FOR RLS PERFORMANCE
-- ============================================

-- Automation tables
CREATE INDEX IF NOT EXISTS idx_pipelines_account_id ON v2.pipelines(account_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_executions_account_id ON v2.pipeline_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_triggers_account_id ON v2.triggers(account_id);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_account_id ON v2.trigger_executions(account_id);
CREATE INDEX IF NOT EXISTS idx_timers_account_id ON v2.timers(account_id);

-- Integration tables
CREATE INDEX IF NOT EXISTS idx_integrations_account_id ON v2.integrations(account_id);
CREATE INDEX IF NOT EXISTS idx_oauth_connections_integration_id ON v2.oauth_connections(integration_id);

-- Workflow tables
CREATE INDEX IF NOT EXISTS idx_pending_actions_account_id ON v2.pending_actions(account_id);
CREATE INDEX IF NOT EXISTS idx_outbox_account_id ON v2.outbox(account_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_account_id ON v2.webhooks(account_id);

-- Log tables
CREATE INDEX IF NOT EXISTS idx_logs_account_id ON v2.logs(account_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY apps_access ON v2.apps IS 'RLS: Allow access to apps in accessible accounts';
COMMENT ON POLICY pipelines_access ON v2.pipelines IS 'RLS: Allow access to pipelines in accessible accounts';
COMMENT ON POLICY triggers_access ON v2.triggers IS 'RLS: Allow access to triggers in accessible accounts';
COMMENT ON POLICY integrations_access ON v2.integrations IS 'RLS: Allow access to integrations in accessible accounts';
COMMENT ON POLICY logs_access ON v2.logs IS 'RLS: Allow access to logs in accessible accounts';
