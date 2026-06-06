-- Items table for Spine v2
-- Core primitive for all data entities

CREATE TABLE v2.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL, -- null for system items
  item_type text NOT NULL,
  title text NOT NULL,
  description text,
  data jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR item_type IN ('account', 'person', 'app')), -- System items don't need app_id
  CHECK (is_active = (status = 'active'))
);

-- Indexes
CREATE INDEX idx_items_app_id ON v2.items(app_id);
CREATE INDEX idx_items_type ON v2.items(item_type);
CREATE INDEX idx_items_account ON v2.items(account_id);
CREATE INDEX idx_items_created_by ON v2.items(created_by);
CREATE INDEX idx_items_status ON v2.items(status);
CREATE INDEX idx_items_active ON v2.items(is_active);
CREATE INDEX idx_items_created_at ON v2.items(created_at);
CREATE INDEX idx_items_updated_at ON v2.items(updated_at);

-- GIN indexes for JSONB
CREATE INDEX idx_items_data_gin ON v2.items USING gin(data);
CREATE INDEX idx_items_metadata_gin ON v2.items USING gin(metadata);

-- Composite indexes for common queries
CREATE INDEX idx_items_account_type_active ON v2.items(account_id, item_type) WHERE is_active = true;
CREATE INDEX idx_items_app_account ON v2.items(app_id, account_id) WHERE is_active = true;

-- Function to get items by type
CREATE OR REPLACE FUNCTION v2.get_items_by_type(
  item_type text,
  account_id uuid,
  app_id uuid DEFAULT NULL,
  include_inactive boolean DEFAULT false,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  item_type text,
  title text,
  description text,
  data jsonb,
  metadata jsonb,
  status text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.app_id,
    i.item_type,
    i.title,
    i.description,
    i.data,
    i.metadata,
    i.status,
    i.is_active,
    i.created_by,
    i.created_at,
    i.updated_at
  FROM v2.items i
  WHERE i.item_type = get_items_by_type.item_type
  AND i.account_id = get_items_by_type.account_id
  AND (app_id IS NULL OR i.app_id = get_items_by_type.app_id)
  AND (include_inactive OR i.is_active = true)
  ORDER BY i.created_at DESC
  LIMIT get_items_by_type.limit
  OFFSET get_items_by_type.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to search items
CREATE OR REPLACE FUNCTION v2.search_items(
  account_id uuid,
  query text,
  item_types text[] DEFAULT NULL,
  app_id uuid DEFAULT NULL,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  item_type text,
  title text,
  description text,
  data jsonb,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.item_type,
    i.title,
    i.description,
    i.data,
    ts_rank(to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(i.description, '')), plainto_tsquery('english', query)) as rank
  FROM v2.items i
  WHERE i.account_id = search_items.account_id
  AND i.is_active = true
  AND (app_id IS NULL OR i.app_id = search_items.app_id)
  AND (item_types IS NULL OR i.item_type = ANY(search_items.item_types))
  AND to_tsvector('english', COALESCE(i.title, '') || ' ' || COALESCE(i.description, '')) @@ plainto_tsquery('english', query)
  ORDER BY rank DESC, i.created_at DESC
  LIMIT search_items.limit
  OFFSET search_items.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get item with type schema
CREATE OR REPLACE FUNCTION v2.get_item_with_schema(item_id uuid)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  item_type text,
  title text,
  description text,
  data jsonb,
  metadata jsonb,
  status text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  type_schema jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.*,
    t.schema as type_schema
  FROM v2.items i
  LEFT JOIN v2.types t ON i.item_type = t.kind AND t.slug = i.item_type
  WHERE i.id = get_item_with_schema.item_id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate item data against type schema
CREATE OR REPLACE FUNCTION v2.validate_item_data(
  item_type text,
  data jsonb,
  app_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  type_schema jsonb;
BEGIN
  -- Get type schema
  SELECT schema INTO type_schema
  FROM v2.get_type_schema(item_type, item_type, app_id);
  
  -- Basic validation - check if data is valid JSON
  IF data IS NULL OR jsonb_typeof(data) != 'object' THEN
    RETURN false;
  END IF;
  
  -- TODO: Add comprehensive schema validation based on type_schema
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete item
CREATE OR REPLACE FUNCTION v2.soft_delete_item(item_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.items
  SET 
    is_active = false,
    status = 'deleted',
    updated_at = now()
  WHERE id = soft_delete_item.item_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to archive item
CREATE OR REPLACE FUNCTION v2.archive_item(item_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.items
  SET 
    status = 'archived',
    updated_at = now()
  WHERE id = archive_item.item_id
  AND is_active = true
  AND status = 'active';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.items IS 'Core primitive for all data entities in Spine v2';
COMMENT ON FUNCTION v2.get_items_by_type(text, uuid, uuid, boolean, integer, integer) IS 'Get items by type with pagination';
COMMENT ON FUNCTION v2.search_items(uuid, text, text[], uuid, integer, integer) IS 'Full-text search across items';
COMMENT ON FUNCTION v2.get_item_with_schema(uuid) IS 'Get item with its type schema';
COMMENT ON FUNCTION v2.validate_item_data(text, jsonb, uuid) IS 'Validate item data against type schema';
COMMENT ON FUNCTION v2.soft_delete_item(uuid) IS 'Soft delete item (mark as inactive)';
COMMENT ON FUNCTION v2.archive_item(uuid) IS 'Archive item (change status to archived)';
