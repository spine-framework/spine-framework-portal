-- Accounts table and hierarchy for Spine v2
-- Accounts are the tenancy unit and support hierarchical structures

-- Create accounts table
CREATE TABLE v2.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES v2.accounts(id) ON DELETE SET NULL,
  type_id uuid REFERENCES v2.types(id) ON DELETE SET NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(slug),
  CHECK (parent_id IS NULL OR parent_id != id)
);

-- Create account_paths closure table for efficient hierarchy queries
CREATE TABLE v2.account_paths (
  ancestor_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  depth integer NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id),
  CHECK (ancestor_id != descendant_id),
  CHECK (depth >= 1),
  UNIQUE (ancestor_id, descendant_id, depth)
);

-- Indexes for performance
CREATE INDEX idx_accounts_parent_id ON v2.accounts(parent_id);
CREATE INDEX idx_accounts_type_id ON v2.accounts(type_id);
CREATE INDEX idx_accounts_slug ON v2.accounts(slug);
CREATE INDEX idx_accounts_active ON v2.accounts(is_active);

CREATE INDEX idx_account_paths_ancestor ON v2.account_paths(ancestor_id);
CREATE INDEX idx_account_paths_descendant ON v2.account_paths(descendant_id);
CREATE INDEX idx_account_paths_depth ON v2.account_paths(depth);

-- Function to maintain account_paths closure table
CREATE OR REPLACE FUNCTION v2.update_account_paths()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert new account path (self-reference not allowed)
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      -- Copy all paths from parent
      INSERT INTO v2.account_paths (ancestor_id, descendant_id, depth)
      SELECT ancestor_id, NEW.id, depth + 1
      FROM v2.account_paths
      WHERE descendant_id = NEW.parent_id;
      
      -- Add direct parent relationship
      INSERT INTO v2.account_paths (ancestor_id, descendant_id, depth)
      VALUES (NEW.parent_id, NEW.id, 1);
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle parent changes
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    -- Remove old paths
    DELETE FROM v2.account_paths WHERE descendant_id = NEW.id;
    
    -- Add new paths if new parent exists
    IF NEW.parent_id IS NOT NULL THEN
      INSERT INTO v2.account_paths (ancestor_id, descendant_id, depth)
      SELECT ancestor_id, NEW.id, depth + 1
      FROM v2.account_paths
      WHERE descendant_id = NEW.parent_id;
      
      INSERT INTO v2.account_paths (ancestor_id, descendant_id, depth)
      VALUES (NEW.parent_id, NEW.id, 1);
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle deletes
  IF TG_OP = 'DELETE' THEN
    DELETE FROM v2.account_paths WHERE descendant_id = OLD.id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to maintain closure table
CREATE TRIGGER account_paths_trigger
AFTER INSERT OR UPDATE OR DELETE ON v2.accounts
FOR EACH ROW EXECUTE FUNCTION v2.update_account_paths();

-- Function to get account descendants
CREATE OR REPLACE FUNCTION v2.get_account_descendants(account_id uuid, max_depth integer DEFAULT NULL)
RETURNS TABLE (id uuid, slug text, display_name text, depth integer) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    SELECT a.id, a.slug, a.display_name, 0 as depth
    FROM v2.accounts a
    WHERE a.id = account_id
    
    UNION ALL
    
    SELECT a.id, a.slug, a.display_name, ap.depth + 1
    FROM v2.accounts a
    JOIN v2.account_paths ap ON a.id = ap.descendant_id
    WHERE ap.ancestor_id = account_id
    AND (max_depth IS NULL OR ap.depth < max_depth)
  )
  SELECT d.id, d.slug, d.display_name, d.depth
  FROM descendants d
  WHERE d.id != account_id
  ORDER BY d.depth, d.display_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get account ancestors
CREATE OR REPLACE FUNCTION v2.get_account_ancestors(account_id uuid)
RETURNS TABLE (id uuid, slug text, display_name text, depth integer) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.slug, a.display_name, ap.depth
  FROM v2.accounts a
  JOIN v2.account_paths ap ON a.id = ap.ancestor_id
  WHERE ap.descendant_id = account_id
  ORDER BY ap.depth;
END;
$$ LANGUAGE plpgsql;

-- Function to check if account is descendant of another
CREATE OR REPLACE FUNCTION v2.is_account_descendant(ancestor_id uuid, descendant_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.account_paths
    WHERE ancestor_id = is_account_descendant.ancestor_id
    AND descendant_id = is_account_descendant.descendant_id
  );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.accounts IS 'Account records - the tenancy unit in Spine v2';
COMMENT ON TABLE v2.account_paths IS 'Closure table for account hierarchy traversal';
COMMENT ON FUNCTION v2.update_account_paths() IS 'Trigger function to maintain account_paths closure table';
