-- Link Types table for Spine v2
-- Defines available relationship types between items

CREATE TABLE v2.link_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL, -- null for system link types
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  config jsonb DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(app_id, slug),
  CHECK (app_id IS NOT NULL OR is_system = true) -- System link types must have null app_id
);

-- Indexes
CREATE INDEX idx_link_types_app_id ON v2.link_types(app_id);
CREATE INDEX idx_link_types_slug ON v2.link_types(slug);
CREATE INDEX idx_link_types_system ON v2.link_types(is_system);
CREATE INDEX idx_link_types_active ON v2.link_types(is_active);

-- Composite index for link type lookup
CREATE INDEX idx_link_types_lookup ON v2.link_types(app_id, slug) WHERE is_active = true;

-- Function to get link type schema
CREATE OR REPLACE FUNCTION v2.get_link_type_schema(slug text, app_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  type_schema jsonb;
BEGIN
  SELECT config INTO type_schema
  FROM v2.link_types
  WHERE slug = get_link_type_schema.slug
  AND (app_id = get_link_type_schema.app_id OR (app_id IS NULL AND app_id IS NULL))
  AND is_active = true
  ORDER BY app_id DESC NULLS LAST -- Prefer app-specific types over system types
  LIMIT 1;
  
  RETURN COALESCE(type_schema, '{}');
END;
$$ LANGUAGE plpgsql;

-- Function to validate link
CREATE OR REPLACE FUNCTION v2.validate_link(
  source_type text,
  target_type text,
  link_type_slug text,
  app_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  link_type_config jsonb;
  allowed_source_types text[];
  allowed_target_types text[];
BEGIN
  -- Get link type configuration
  SELECT config INTO link_type_config
  FROM v2.get_link_type_schema(link_type_slug, app_id);
  
  -- Check if link type allows these types
  IF link_type_config ? 'allowed_source_types' THEN
    allowed_source_types := (link_type_config->>'allowed_source_types')::text[];
    IF source_type != ALL(allowed_source_types) THEN
      RETURN false;
    END IF;
  END IF;
  
  IF link_type_config ? 'allowed_target_types' THEN
    allowed_target_types := (link_type_config->>'allowed_target_types')::text[];
    IF target_type != ALL(allowed_target_types) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to get available link types for item pair
CREATE OR REPLACE FUNCTION v2.get_available_link_types(
  source_type text,
  target_type text,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  icon text,
  color text,
  config jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lt.id,
    lt.slug,
    lt.name,
    lt.description,
    lt.icon,
    lt.color,
    lt.config
  FROM v2.link_types lt
  WHERE lt.is_active = true
  AND (app_id IS NULL OR lt.app_id = get_available_link_types.app_id)
  AND v2.validate_link(source_type, target_type, lt.slug, app_id)
  ORDER BY lt.name;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.link_types IS 'Defines available relationship types between items';
COMMENT ON FUNCTION v2.get_link_type_schema(text, uuid) IS 'Get link type configuration';
COMMENT ON FUNCTION v2.validate_link(text, text, text, uuid) IS 'Validate if link type allows relationship between item types';
COMMENT ON FUNCTION v2.get_available_link_types(text, text, uuid) IS 'Get available link types for item pair';
