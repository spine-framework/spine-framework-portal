-- Apps-Integrations connector for Spine v2
-- Links apps to integration instances

CREATE TABLE v2.apps_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES v2.apps(id) ON DELETE CASCADE,
  integration_instance_id uuid NOT NULL REFERENCES v2.integration_instances(id) ON DELETE CASCADE,
  config jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(app_id, integration_instance_id)
);

-- Indexes
CREATE INDEX idx_apps_integrations_app ON v2.apps_integrations(app_id);
CREATE INDEX idx_apps_integrations_instance ON v2.apps_integrations(integration_instance_id);

-- Function to add integration to app
CREATE OR REPLACE FUNCTION v2.add_integration_to_app(
  app_id uuid,
  integration_instance_id uuid,
  config jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  link_id uuid;
BEGIN
  -- Check if integration instance exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM v2.integration_instances
    WHERE id = add_integration_to_app.integration_instance_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Integration instance not found or inactive';
  END IF;
  
  -- Insert link
  INSERT INTO v2.apps_integrations (app_id, integration_instance_id, config)
  VALUES (app_id, integration_instance_id, config)
  ON CONFLICT (app_id, integration_instance_id)
  DO UPDATE SET
    config = EXCLUDED.config,
    updated_at = now()
  RETURNING id INTO link_id;
  
  RETURN link_id;
END;
$$ LANGUAGE plpgsql;

-- Function to remove integration from app
CREATE OR REPLACE FUNCTION v2.remove_integration_from_app(
  app_id uuid,
  integration_instance_id uuid
)
RETURNS boolean AS $$
BEGIN
  DELETE FROM v2.apps_integrations
  WHERE app_id = remove_integration_from_app.app_id
  AND integration_instance_id = remove_integration_from_app.integration_instance_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get app's integrations
CREATE OR REPLACE FUNCTION v2.get_app_integrations(app_id uuid)
RETURNS TABLE (
  integration_instance_id uuid,
  integration_slug text,
  integration_name text,
  config jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.id as integration_instance_id,
    i.slug as integration_slug,
    i.name as integration_name,
    ai.config,
    ai.created_at
  FROM v2.apps_integrations ai
  JOIN v2.integration_instances ii ON ai.integration_instance_id = ii.id
  JOIN v2.integrations i ON ii.integration_id = i.id
  WHERE ai.app_id = get_app_integrations.app_id
  AND ii.is_active = true
  AND i.is_active = true
  ORDER BY i.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get integration's apps
CREATE OR REPLACE FUNCTION v2.get_integration_apps(integration_instance_id uuid)
RETURNS TABLE (
  app_id uuid,
  app_slug text,
  app_name text,
  config jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as app_id,
    a.slug as app_slug,
    a.name as app_name,
    ai.config,
    ai.created_at
  FROM v2.apps_integrations ai
  JOIN v2.apps a ON ai.app_id = a.id
  WHERE ai.integration_instance_id = get_integration_apps.integration_instance_id
  AND a.is_active = true
  ORDER BY a.name;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.apps_integrations IS 'Connector table linking apps to integration instances';
COMMENT ON FUNCTION v2.add_integration_to_app(uuid, uuid, jsonb) IS 'Add integration to app';
COMMENT ON FUNCTION v2.remove_integration_from_app(uuid, uuid) IS 'Remove integration from app';
COMMENT ON FUNCTION v2.get_app_integrations(uuid) IS 'Get all integrations for app';
COMMENT ON FUNCTION v2.get_integration_apps(uuid) IS 'Get all apps using integration';
