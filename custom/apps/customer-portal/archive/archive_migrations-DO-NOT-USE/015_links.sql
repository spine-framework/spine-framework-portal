-- Links table for Spine v2
-- Polymorphic relationships between items

CREATE TABLE v2.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  link_type text NOT NULL,
  direction text NOT NULL DEFAULT 'bidirectional' CHECK (direction IN ('forward', 'backward', 'bidirectional')),
  weight real DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent self-links
  CHECK (source_type != target_type OR source_id != target_id),
  -- Ensure valid weight
  CHECK (weight >= 0 AND weight <= 1)
);

-- Indexes
CREATE INDEX idx_links_source ON v2.links(source_type, source_id);
CREATE INDEX idx_links_target ON v2.links(target_type, target_id);
CREATE INDEX idx_links_type ON v2.links(link_type);
CREATE INDEX idx_links_direction ON v2.links(direction);
CREATE INDEX idx_links_account ON v2.links(account_id);
CREATE INDEX idx_links_created_by ON v2.links(created_by);
CREATE INDEX idx_links_created_at ON v2.links(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_links_source_type ON v2.links(source_type, source_id, link_type);
CREATE INDEX idx_links_target_type ON v2.links(target_type, target_id, link_type);
CREATE INDEX idx_links_account_type ON v2.links(account_id, link_type);

-- Function to create link
CREATE OR REPLACE FUNCTION v2.create_link(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  link_type text,
  direction text DEFAULT 'bidirectional',
  weight real DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  link_id uuid;
BEGIN
  -- Validate source and target exist
  IF direction = 'forward' THEN
    -- Only check source exists
    IF NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = create_link.source_id 
      AND item_type = create_link.source_type
      AND account_id = create_link.account_id
    ) THEN
      RAISE EXCEPTION 'Source item not found';
    END IF;
  ELSIF direction = 'backward' THEN
    -- Only check target exists
    IF NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = create_link.target_id 
      AND item_type = create_link.target_type
      AND account_id = create_link.account_id
    ) THEN
      RAISE EXCEPTION 'Target item not found';
    END IF;
  ELSE
    -- Check both exist for bidirectional
    IF NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = create_link.source_id 
      AND item_type = create_link.source_type
      AND account_id = create_link.account_id
    ) OR NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = create_link.target_id 
      AND item_type = create_link.target_type
      AND account_id = create_link.account_id
    ) THEN
      RAISE EXCEPTION 'Source or target item not found';
    END IF;
  END IF;
  
  -- Insert link
  INSERT INTO v2.links (
    source_type, source_id, target_type, target_id, 
    link_type, direction, weight, metadata, created_by, account_id
  )
  VALUES (
    source_type, source_id, target_type, target_id,
    link_type, direction, weight, metadata, created_by, account_id
  )
  ON CONFLICT (source_type, source_id, target_type, target_id, link_type)
  DO UPDATE SET
    direction = EXCLUDED.direction,
    weight = EXCLUDED.weight,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO link_id;
  
  RETURN link_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get outgoing links
CREATE OR REPLACE FUNCTION v2.get_outgoing_links(
  source_type text,
  source_id uuid,
  link_type text DEFAULT NULL,
  account_id uuid
)
RETURNS TABLE (
  id uuid,
  target_type text,
  target_id uuid,
  link_type text,
  direction text,
  weight real,
  metadata jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.target_type,
    l.target_id,
    l.link_type,
    l.direction,
    l.weight,
    l.metadata,
    l.created_at
  FROM v2.links l
  WHERE l.source_type = get_outgoing_links.source_type
  AND l.source_id = get_outgoing_links.source_id
  AND l.account_id = get_outgoing_links.account_id
  AND (link_type IS NULL OR l.link_type = get_outgoing_links.link_type)
  ORDER BY l.weight DESC, l.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get incoming links
CREATE OR REPLACE FUNCTION v2.get_incoming_links(
  target_type text,
  target_id uuid,
  link_type text DEFAULT NULL,
  account_id uuid
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_id uuid,
  link_type text,
  direction text,
  weight real,
  metadata jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.source_type,
    l.source_id,
    l.link_type,
    l.direction,
    l.weight,
    l.metadata,
    l.created_at
  FROM v2.links l
  WHERE l.target_type = get_incoming_links.target_type
  AND l.target_id = get_incoming_links.target_id
  AND l.account_id = get_incoming_links.account_id
  AND (link_type IS NULL OR l.link_type = get_incoming_links.link_type)
  ORDER BY l.weight DESC, l.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get related items (both incoming and outgoing)
CREATE OR REPLACE FUNCTION v2.get_related_items(
  item_type text,
  item_id uuid,
  link_type text DEFAULT NULL,
  account_id uuid
)
RETURNS TABLE (
  related_type text,
  related_id uuid,
  link_id uuid,
  link_type text,
  direction text,
  weight real,
  relationship text -- 'source' or 'target'
) AS $$
BEGIN
  RETURN QUERY
  -- Outgoing links (item is source)
  SELECT 
    l.target_type as related_type,
    l.target_id as related_id,
    l.id as link_id,
    l.link_type,
    l.direction,
    l.weight,
    'target' as relationship
  FROM v2.links l
  WHERE l.source_type = get_related_items.item_type
  AND l.source_id = get_related_items.item_id
  AND l.account_id = get_related_items.account_id
  AND (link_type IS NULL OR l.link_type = get_related_items.link_type)
  
  UNION ALL
  
  -- Incoming links (item is target)
  SELECT 
    l.source_type as related_type,
    l.source_id as related_id,
    l.id as link_id,
    l.link_type,
    l.direction,
    l.weight,
    'source' as relationship
  FROM v2.links l
  WHERE l.target_type = get_related_items.item_type
  AND l.target_id = get_related_items.item_id
  AND l.account_id = get_related_items.account_id
  AND (link_type IS NULL OR l.link_type = get_related_items.link_type)
  
  ORDER BY weight DESC, related_type, relationship;
END;
$$ LANGUAGE plpgsql;

-- Function to delete link
CREATE OR REPLACE FUNCTION v2.delete_link(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  link_type text,
  account_id uuid
)
RETURNS boolean AS $$
BEGIN
  DELETE FROM v2.links
  WHERE source_type = delete_link.source_type
  AND source_id = delete_link.source_id
  AND target_type = delete_link.target_type
  AND target_id = delete_link.target_id
  AND link_type = delete_link.link_type
  AND account_id = delete_link.account_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to check if link exists
CREATE OR REPLACE FUNCTION v2.link_exists(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  link_type text,
  account_id uuid
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.links
    WHERE source_type = link_exists.source_type
    AND source_id = link_exists.source_id
    AND target_type = link_exists.target_type
    AND target_id = link_exists.target_id
    AND link_type = link_exists.link_type
    AND account_id = link_exists.account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.links IS 'Polymorphic relationships between items';
COMMENT ON FUNCTION v2.create_link(text, uuid, text, uuid, text, text, real, jsonb, uuid, uuid) IS 'Create a link between items';
COMMENT ON FUNCTION v2.get_outgoing_links(text, uuid, text, uuid) IS 'Get outgoing links from an item';
COMMENT ON FUNCTION v2.get_incoming_links(text, uuid, text, uuid) IS 'Get incoming links to an item';
COMMENT ON FUNCTION v2.get_related_items(text, uuid, text, uuid) IS 'Get all related items (both incoming and outgoing)';
COMMENT ON FUNCTION v2.delete_link(text, uuid, text, uuid, text, uuid) IS 'Delete a link between items';
COMMENT ON FUNCTION v2.link_exists(text, uuid, text, uuid, text, uuid) IS 'Check if a link exists';
