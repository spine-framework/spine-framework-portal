-- Migration 048: Add account hierarchy function
-- Replace account_paths closure table with simple recursive function

-- Function to get account hierarchy recursively
CREATE OR REPLACE FUNCTION v2.get_account_hierarchy(parent_account_id uuid)
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  level integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE account_tree AS (
    -- Base case: direct children
    SELECT 
      a.id,
      a.slug,
      a.display_name,
      1 as level
    FROM v2.accounts a
    WHERE a.parent_id = parent_account_id
    AND a.is_active = true
    
    UNION ALL
    
    -- Recursive case: children of children
    SELECT 
      a.id,
      a.slug,
      a.display_name,
      at.level + 1
    FROM v2.accounts a
    INNER JOIN account_tree at ON a.parent_id = at.id
    WHERE a.is_active = true
  )
  SELECT 
    id,
    slug,
    display_name,
    level
  FROM account_tree
  ORDER BY level, display_name;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION v2.get_account_hierarchy(uuid) IS 'Get all child accounts in hierarchy for a given parent account';

-- Mark account_paths as deprecated (we'll keep it for now for reference)
COMMENT ON TABLE v2.account_paths IS 'DEPRECATED - Use get_account_hierarchy() function instead. Simpler recursive approach.';
