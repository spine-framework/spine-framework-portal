-- Seed data for polymorphic features in Spine v2
-- System link types and default configurations

-- Insert system link types
INSERT INTO v2.link_types (id, app_id, slug, name, description, icon, color, config, is_system, is_active)
VALUES 
  (
    gen_random_uuid(),
    NULL,
    'related',
    'Related',
    'General relationship between items',
    'link',
    'gray',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": true,
      "max_per_source": null,
      "max_per_target": null
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'parent',
    'Parent',
    'Parent-child relationship',
    'git-branch',
    'blue',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_target": 1,
      "max_per_source": null,
      "prevent_cycles": true
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'depends_on',
    'Depends On',
    'Dependency relationship',
    'arrow-right',
    'orange',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_source": null,
      "max_per_target": null,
      "prevent_cycles": true
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'blocks',
    'Blocks',
    'Blocking relationship',
    'x-circle',
    'red',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_source": null,
      "max_per_target": null
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'duplicate',
    'Duplicate',
    'Duplicate relationship',
    'copy',
    'purple',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": true,
      "max_per_source": null,
      "max_per_target": null
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'reference',
    'Reference',
    'Reference or citation',
    'external-link',
    'green',
    '{
      "allowed_source_types": ["*"],
      "allowed_target_types": ["*"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_source": null,
      "max_per_target": null
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'assigned',
    'Assigned',
    'Assignment relationship',
    'user',
    'indigo',
    '{
      "allowed_source_types": ["item"],
      "allowed_target_types": ["person"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_target": null,
      "max_per_source": 10
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'watching',
    'Watching',
    'Watching relationship',
    'eye',
    'yellow',
    '{
      "allowed_source_types": ["person"],
      "allowed_target_types": ["*"],
      "bidirectional": false,
      "direction": "forward",
      "max_per_source": null,
      "max_per_target": null
    }'::jsonb,
    true,
    true
  );

-- Create function to validate link constraints
CREATE OR REPLACE FUNCTION v2.validate_link_constraints(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  link_type_slug text,
  account_id uuid
)
RETURNS boolean AS $$
DECLARE
  link_type_config jsonb;
  max_per_source integer;
  max_per_target integer;
  prevent_cycles boolean;
  current_count integer;
BEGIN
  -- Get link type configuration
  SELECT config INTO link_type_config
  FROM v2.link_types
  WHERE slug = link_type_slug
  AND is_active = true
  AND (app_id IS NULL OR app_id IN (
    SELECT id FROM v2.apps WHERE owner_account_id = account_id AND is_active = true
  ))
  ORDER BY app_id DESC NULLS LAST
  LIMIT 1;
  
  IF link_type_config IS NULL THEN
    RAISE EXCEPTION 'Link type not found or not available';
  END IF;
  
  -- Check max per source
  IF link_type_config ? 'max_per_source' THEN
    max_per_source := (link_type_config->>'max_per_source')::integer;
    IF max_per_source IS NOT NULL THEN
      SELECT COUNT(*) INTO current_count
      FROM v2.links
      WHERE source_type = source_type
      AND source_id = source_id
      AND link_type = link_type_slug
      AND account_id = account_id;
      
      IF current_count >= max_per_source THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  -- Check max per target
  IF link_type_config ? 'max_per_target' THEN
    max_per_target := (link_type_config->>'max_per_target')::integer;
    IF max_per_target IS NOT NULL THEN
      SELECT COUNT(*) INTO current_count
      FROM v2.links
      WHERE target_type = target_type
      AND target_id = target_id
      AND link_type = link_type_slug
      AND account_id = account_id;
      
      IF current_count >= max_per_target THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  -- Check for cycles (basic implementation)
  IF link_type_config ? 'prevent_cycles' 
  AND (link_type_config->>'prevent_cycles')::boolean = true
  AND source_type = target_type THEN
    -- Simple cycle detection - check if target already links to source
    IF EXISTS (
      SELECT 1 FROM v2.links
      WHERE source_type = target_type
      AND source_id = target_id
      AND target_type = source_type
      AND target_id = source_id
      AND link_type = link_type_slug
      AND account_id = account_id
    ) THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to get link statistics
CREATE OR REPLACE FUNCTION v2.get_link_statistics(
  account_id uuid,
  link_type text DEFAULT NULL
)
RETURNS TABLE (
  link_type text,
  count bigint,
  unique_sources bigint,
  unique_targets bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    link_type,
    COUNT(*) as count,
    COUNT(DISTINCT source_id) as unique_sources,
    COUNT(DISTINCT target_id) as unique_targets
  FROM v2.links
  WHERE account_id = get_link_statistics.account_id
  AND (link_type IS NULL OR link_type = get_link_statistics.link_type)
  GROUP BY link_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup orphaned links
CREATE OR REPLACE FUNCTION v2.cleanup_orphaned_links()
RETURNS integer AS $$
DECLARE
  cleaned_count integer;
BEGIN
  -- Remove links where source item no longer exists
  DELETE FROM v2.links
  WHERE NOT EXISTS (
    SELECT 1 FROM v2.items i
    WHERE i.id = links.source_id
    AND i.item_type = links.source_type
    AND i.is_active = true
  );
  
  -- Remove links where target item no longer exists
  DELETE FROM v2.links
  WHERE NOT EXISTS (
    SELECT 1 FROM v2.items i
    WHERE i.id = links.target_id
    AND i.item_type = links.target_type
    AND i.is_active = true
  );
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;
