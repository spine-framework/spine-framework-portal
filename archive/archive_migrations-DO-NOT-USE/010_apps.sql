-- Apps table for Spine v2
-- App definitions with provenance tracking

CREATE TABLE v2.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  version text NOT NULL DEFAULT '1.0.0',
  app_type text NOT NULL DEFAULT 'custom' CHECK (app_type IN ('system', 'pack', 'custom')),
  source text NOT NULL DEFAULT 'custom' CHECK (source IN ('marketplace', 'custom', 'pack')),
  external_app_id text, -- For marketplace apps
  external_version text, -- For marketplace apps
  owner_account_id uuid REFERENCES v2.accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  config jsonb DEFAULT '{}',
  nav_items jsonb DEFAULT '[]',
  min_role text DEFAULT 'member',
  integration_deps jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(slug),
  CHECK (app_type = 'system' OR owner_account_id IS NOT NULL),
  CHECK (source = 'marketplace' OR (external_app_id IS NULL AND external_version IS NULL))
);

-- Indexes
CREATE INDEX idx_apps_slug ON v2.apps(slug);
CREATE INDEX idx_apps_type ON v2.apps(app_type);
CREATE INDEX idx_apps_source ON v2.apps(source);
CREATE INDEX idx_apps_owner ON v2.apps(owner_account_id);
CREATE INDEX idx_apps_active ON v2.apps(is_active);
CREATE INDEX idx_apps_system ON v2.apps(is_system);
CREATE INDEX idx_apps_external ON v2.apps(external_app_id) WHERE external_app_id IS NOT NULL;

-- Function to get app schema
CREATE OR REPLACE FUNCTION v2.get_app_schema(app_slug text)
RETURNS jsonb AS $$
DECLARE
  app_schema jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'slug', slug,
    'name', name,
    'description', description,
    'icon', icon,
    'color', color,
    'version', version,
    'app_type', app_type,
    'source', source,
    'config', config,
    'nav_items', nav_items,
    'min_role', min_role,
    'integration_deps', integration_deps,
    'metadata', metadata
  ) INTO app_schema
  FROM v2.apps
  WHERE slug = get_app_schema.app_slug
  AND is_active = true;
  
  RETURN COALESCE(app_schema, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Function to get apps for account
CREATE OR REPLACE FUNCTION v2.get_account_apps(
  account_id uuid,
  include_system boolean DEFAULT true,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  icon text,
  color text,
  version text,
  app_type text,
  source text,
  owner_account_id uuid,
  is_active boolean,
  is_system boolean,
  min_role text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.slug,
    a.name,
    a.description,
    a.icon,
    a.color,
    a.version,
    a.app_type,
    a.source,
    a.owner_account_id,
    a.is_active,
    a.is_system,
    a.min_role,
    a.created_at
  FROM v2.apps a
  WHERE 
    (include_system OR a.is_system = false)
    AND (include_inactive OR a.is_active = true)
    AND (a.is_system OR a.owner_account_id = get_account_apps.account_id)
  ORDER BY 
    a.is_system DESC,
    a.app_type,
    a.name;
END;
$$ LANGUAGE plpgsql;

-- Function to check if app is available to account
CREATE OR REPLACE FUNCTION v2.is_app_available(app_slug text, account_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.apps
    WHERE slug = is_app_available.app_slug
    AND is_active = true
    AND (is_system = true OR owner_account_id = is_app_available.account_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update app version
CREATE OR REPLACE FUNCTION v2.update_app_version(app_id uuid, new_version text)
RETURNS void AS $$
BEGIN
  UPDATE v2.apps
  SET 
    version = new_version,
    updated_at = now()
  WHERE id = update_app_version.app_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.apps IS 'App definitions with provenance and configuration';
COMMENT ON FUNCTION v2.get_app_schema(text) IS 'Get full app schema by slug';
COMMENT ON FUNCTION v2.get_account_apps(uuid, boolean, boolean) IS 'Get all apps available to an account';
COMMENT ON FUNCTION v2.is_app_available(text, uuid) IS 'Check if app is available to account';
COMMENT ON FUNCTION v2.update_app_version(uuid, text) IS 'Update app version';
