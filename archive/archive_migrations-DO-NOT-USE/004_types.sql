-- Types table for Spine v2
-- Types define the schema, permissions, and behavior for entities

-- Create types table
CREATE TABLE v2.types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL, -- null for system types
  kind text NOT NULL CHECK (kind IN ('item', 'account', 'person', 'thread', 'message')),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  schema jsonb NOT NULL DEFAULT '{}',
  ownership text NOT NULL DEFAULT 'tenant' CHECK (ownership IN ('pack', 'tenant')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(app_id, kind, slug),
  CHECK (app_id IS NOT NULL OR ownership = 'pack') -- System types must be pack-owned
);

-- Indexes
CREATE INDEX idx_types_app_id ON v2.types(app_id);
CREATE INDEX idx_types_kind ON v2.types(kind);
CREATE INDEX idx_types_slug ON v2.types(slug);
CREATE INDEX idx_types_active ON v2.types(is_active);
CREATE INDEX idx_types_ownership ON v2.types(ownership);

-- Composite index for type lookup
CREATE INDEX idx_types_lookup ON v2.types(kind, slug, app_id) WHERE is_active = true;

-- Function to get type schema
CREATE OR REPLACE FUNCTION v2.get_type_schema(kind text, slug text, app_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  type_schema jsonb;
BEGIN
  SELECT schema INTO type_schema
  FROM v2.types
  WHERE kind = get_type_schema.kind
  AND slug = get_type_schema.slug
  AND (app_id = get_type_schema.app_id OR (app_id IS NULL AND app_id IS NULL))
  AND is_active = true
  ORDER BY app_id DESC NULLS LAST -- Prefer app-specific types over system types
  LIMIT 1;
  
  RETURN COALESCE(type_schema, '{}');
END;
$$ LANGUAGE plpgsql;

-- Function to validate type schema
CREATE OR REPLACE FUNCTION v2.validate_type_schema(schema jsonb)
RETURNS boolean AS $$
BEGIN
  -- Basic validation - check required fields
  IF NOT (schema ? 'fields') THEN
    RETURN false;
  END IF;
  
  -- TODO: Add more comprehensive schema validation
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.types IS 'Type definitions - schema, permissions, and behavior for entities';
COMMENT ON FUNCTION v2.get_type_schema(text, text, uuid) IS 'Get type schema with app-specific fallback to system';
COMMENT ON FUNCTION v2.validate_type_schema(jsonb) IS 'Validate type schema structure';
