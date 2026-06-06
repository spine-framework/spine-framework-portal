-- Roles table for Spine v2
-- App-scoped roles with JSON-based permissions

CREATE TABLE v2.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL, -- null for system roles
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(app_id, slug),
  CHECK (app_id IS NOT NULL OR is_system = true) -- System roles must have null app_id
);

-- Indexes
CREATE INDEX idx_roles_app_id ON v2.roles(app_id);
CREATE INDEX idx_roles_slug ON v2.roles(slug);
CREATE INDEX idx_roles_system ON v2.roles(is_system);
CREATE INDEX idx_roles_active ON v2.roles(is_active);

-- Composite index for role lookup
CREATE INDEX idx_roles_lookup ON v2.roles(app_id, slug) WHERE is_active = true;

-- Function to get role permissions
CREATE OR REPLACE FUNCTION v2.get_role_permissions(role_slug text, app_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  role_permissions jsonb;
BEGIN
  SELECT permissions INTO role_permissions
  FROM v2.roles
  WHERE slug = get_role_permissions.role_slug
  AND (app_id = get_role_permissions.app_id OR (app_id IS NULL AND app_id IS NULL))
  AND is_active = true
  ORDER BY app_id DESC NULLS LAST -- Prefer app-specific roles over system roles
  LIMIT 1;
  
  RETURN COALESCE(role_permissions, '{}');
END;
$$ LANGUAGE plpgsql;

-- Function to check if role has permission
CREATE OR REPLACE FUNCTION v2.role_has_permission(role_slug text, permission text, app_id uuid DEFAULT NULL)
RETURNS boolean AS $$
DECLARE
  permissions jsonb;
BEGIN
  -- Get role permissions
  SELECT permissions INTO permissions
  FROM v2.get_role_permissions(role_slug, app_id);
  
  -- Check permission (supports dot notation like "items.create")
  RETURN permissions ? permission;
END;
$$ LANGUAGE plpgsql;

-- Function to resolve permissions for a person in context
CREATE OR REPLACE FUNCTION v2.resolve_person_permissions(
  person_id uuid,
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (permission text, source text) AS $$
BEGIN
  RETURN QUERY
  WITH person_roles AS (
    SELECT DISTINCT r.slug, r.permissions, r.is_system
    FROM v2.people_roles pr
    JOIN v2.roles r ON pr.role_id = r.id
    WHERE pr.person_id = resolve_person_permissions.person_id
    AND pr.account_id = resolve_person_permissions.account_id
    AND r.is_active = true
  ),
  flattened_permissions AS (
    SELECT 
      jsonb_each_text(pr.permissions) AS perm,
      CASE 
        WHEN pr.is_system THEN 'system_role:' || pr.slug
        ELSE 'app_role:' || pr.slug
      END as source
    FROM person_roles pr
  )
  SELECT 
    fp.perm.key as permission,
    fp.source
  FROM flattened_permissions fp;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.roles IS 'Role definitions with app-scoped permissions';
COMMENT ON FUNCTION v2.get_role_permissions(text, uuid) IS 'Get role permissions with app-specific fallback';
COMMENT ON FUNCTION v2.role_has_permission(text, text, uuid) IS 'Check if role has specific permission';
COMMENT ON FUNCTION v2.resolve_person_permissions(uuid, uuid, uuid) IS 'Resolve all permissions for a person in context';
