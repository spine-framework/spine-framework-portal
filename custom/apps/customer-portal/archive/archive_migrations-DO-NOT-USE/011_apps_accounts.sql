-- Apps-Accounts connector for Spine v2
-- Links apps to accounts (installation/activation)

CREATE TABLE v2.apps_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES v2.apps(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'activated', 'deactivated', 'uninstalled')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  deactivated_at timestamptz,
  uninstalled_at timestamptz,
  config jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  
  UNIQUE(app_id, account_id),
  CHECK (status = 'installed' OR activated_at IS NOT NULL),
  CHECK (status != 'deactivated' OR deactivated_at IS NOT NULL),
  CHECK (status != 'uninstalled' OR uninstalled_at IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_apps_accounts_app ON v2.apps_accounts(app_id);
CREATE INDEX idx_apps_accounts_account ON v2.apps_accounts(account_id);
CREATE INDEX idx_apps_accounts_status ON v2.apps_accounts(status);
CREATE INDEX idx_apps_accounts_installed ON v2.apps_accounts(installed_at);

-- Composite indexes
CREATE INDEX idx_apps_accounts_active ON v2.apps_accounts(app_id, account_id) WHERE status = 'activated';
CREATE INDEX idx_apps_accounts_installed_active ON v2.apps_accounts(account_id, status) WHERE status IN ('installed', 'activated');

-- Function to install app for account
CREATE OR REPLACE FUNCTION v2.install_app_for_account(
  app_id uuid,
  account_id uuid,
  config jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  installation_id uuid;
BEGIN
  -- Check if app is available to account
  IF NOT EXISTS (
    SELECT 1 FROM v2.apps
    WHERE id = install_app_for_account.app_id
    AND is_active = true
    AND (is_system = true OR owner_account_id = install_app_for_account.account_id)
  ) THEN
    RAISE EXCEPTION 'App is not available to this account';
  END IF;
  
  -- Insert installation record
  INSERT INTO v2.apps_accounts (app_id, account_id, config)
  VALUES (app_id, account_id, config)
  ON CONFLICT (app_id, account_id) 
  DO UPDATE SET
    status = 'installed',
    config = EXCLUDED.config,
    installed_at = now(),
    activated_at = NULL,
    deactivated_at = NULL,
    uninstalled_at = NULL
  RETURNING id INTO installation_id;
  
  RETURN installation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to activate app for account
CREATE OR REPLACE FUNCTION v2.activate_app_for_account(
  app_id uuid,
  account_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.apps_accounts
  SET 
    status = 'activated',
    activated_at = now(),
    deactivated_at = NULL
  WHERE app_id = activate_app_for_account.app_id
  AND account_id = activate_app_for_account.account_id
  AND status IN ('installed', 'deactivated');
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to deactivate app for account
CREATE OR REPLACE FUNCTION v2.deactivate_app_for_account(
  app_id uuid,
  account_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.apps_accounts
  SET 
    status = 'deactivated',
    deactivated_at = now()
  WHERE app_id = deactivate_app_for_account.app_id
  AND account_id = deactivate_app_for_account.account_id
  AND status = 'activated';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to uninstall app from account
CREATE OR REPLACE FUNCTION v2.uninstall_app_from_account(
  app_id uuid,
  account_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.apps_accounts
  SET 
    status = 'uninstalled',
    uninstalled_at = now()
  WHERE app_id = uninstall_app_from_account.app_id
  AND account_id = uninstall_app_from_account.account_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get account's active apps
CREATE OR REPLACE FUNCTION v2.get_account_active_apps(account_id uuid)
RETURNS TABLE (
  app_id uuid,
  app_slug text,
  app_name text,
  app_icon text,
  app_color text,
  status text,
  activated_at timestamptz,
  config jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as app_id,
    a.slug as app_slug,
    a.name as app_name,
    a.icon as app_icon,
    a.color as app_color,
    aa.status,
    aa.activated_at,
    aa.config
  FROM v2.apps_accounts aa
  JOIN v2.apps a ON aa.app_id = a.id
  WHERE aa.account_id = get_account_active_apps.account_id
  AND aa.status = 'activated'
  AND a.is_active = true
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get app's accounts
CREATE OR REPLACE FUNCTION v2.get_app_accounts(app_id uuid)
RETURNS TABLE (
  account_id uuid,
  account_slug text,
  account_name text,
  status text,
  installed_at timestamptz,
  activated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    acc.id as account_id,
    acc.slug as account_slug,
    acc.display_name as account_name,
    aa.status,
    aa.installed_at,
    aa.activated_at
  FROM v2.apps_accounts aa
  JOIN v2.accounts acc ON aa.account_id = acc.id
  WHERE aa.app_id = get_app_accounts.app_id
  AND acc.is_active = true
  ORDER BY acc.display_name;
END;
$$ LANGUAGE plpgsql;

-- Function to check if app is active for account
CREATE OR REPLACE FUNCTION v2.is_app_active_for_account(app_id uuid, account_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.apps_accounts
    WHERE app_id = is_app_active_for_account.app_id
    AND account_id = is_app_active_for_account.account_id
    AND status = 'activated'
  );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.apps_accounts IS 'Connector table linking apps to accounts with installation lifecycle';
COMMENT ON FUNCTION v2.install_app_for_account(uuid, uuid, jsonb) IS 'Install app for account';
COMMENT ON FUNCTION v2.activate_app_for_account(uuid, uuid) IS 'Activate app for account';
COMMENT ON FUNCTION v2.deactivate_app_for_account(uuid, uuid) IS 'Deactivate app for account';
COMMENT ON FUNCTION v2.uninstall_app_from_account(uuid, uuid) IS 'Uninstall app from account';
COMMENT ON FUNCTION v2.get_account_active_apps(uuid) IS 'Get all active apps for account';
COMMENT ON FUNCTION v2.get_app_accounts(uuid) IS 'Get all accounts using app';
COMMENT ON FUNCTION v2.is_app_active_for_account(uuid, uuid) IS 'Check if app is active for account';
