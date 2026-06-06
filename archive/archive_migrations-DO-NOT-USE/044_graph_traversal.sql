-- Graph Traversal system for Spine v2
-- Hierarchical relationship traversal and path finding

CREATE TABLE v2.graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  edge_type text NOT NULL,
  edge_data jsonb DEFAULT '{}',
  weight numeric DEFAULT 1.0 CHECK (weight >= 0),
  is_directed boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (source_type IS NOT NULL AND source_id IS NOT NULL),
  CHECK (target_type IS NOT NULL AND target_id IS NOT NULL),
  CHECK (edge_type IS NOT NULL),
  UNIQUE(source_type, source_id, target_type, target_id, edge_type)
);

-- Indexes
CREATE INDEX idx_graph_edges_source ON v2.graph_edges(source_type, source_id);
CREATE INDEX idx_graph_edges_target ON v2.graph_edges(target_type, target_id);
CREATE INDEX idx_graph_edges_type ON v2.graph_edges(edge_type);
CREATE INDEX idx_graph_edges_weight ON v2.graph_edges(weight);
CREATE INDEX idx_graph_edges_active ON v2.graph_edges(is_active);
CREATE INDEX idx_graph_edges_created_by ON v2.graph_edges(created_by);
CREATE INDEX idx_graph_edges_account ON v2.graph_edges(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_graph_edges_edge_data_gin ON v2.graph_edges USING gin(edge_data);
CREATE INDEX idx_graph_edges_metadata_gin ON v2.graph_edges USING gin(metadata);

-- Composite indexes for common queries
CREATE INDEX idx_graph_edges_composite ON v2.graph_edges(source_type, source_id, edge_type, is_active);
CREATE INDEX idx_graph_edges_reverse_composite ON v2.graph_edges(target_type, target_id, edge_type, is_active);

-- Graph Paths table for precomputed paths
CREATE TABLE v2.graph_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  path_type text NOT NULL,
  path_length integer NOT NULL CHECK (path_length >= 1),
  path_weight numeric NOT NULL DEFAULT 1.0 CHECK (path_weight >= 0),
  path_nodes jsonb NOT NULL DEFAULT '[]',
  path_edges jsonb NOT NULL DEFAULT '[]',
  algorithm text NOT NULL DEFAULT 'bfs',
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (path_length >= 1),
  CHECK (path_weight >= 0)
);

-- Indexes for graph_paths
CREATE INDEX idx_graph_paths_source ON v2.graph_paths(source_type, source_id);
CREATE INDEX idx_graph_paths_target ON v2.graph_paths(target_type, target_id);
CREATE INDEX idx_graph_paths_type ON v2.graph_paths(path_type);
CREATE INDEX idx_graph_paths_length ON v2.graph_paths(path_length);
CREATE INDEX idx_graph_paths_computed_at ON v2.graph_paths(computed_at);
CREATE INDEX idx_graph_paths_expires_at ON v2.graph_paths(expires_at);
CREATE INDEX idx_graph_paths_account ON v2.graph_paths(account_id);

-- Function to create graph edge
CREATE OR REPLACE FUNCTION v2.create_graph_edge(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  edge_type text,
  edge_data jsonb DEFAULT '{}',
  weight numeric DEFAULT 1.0,
  is_directed boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  edge_id uuid;
BEGIN
  -- Insert edge
  INSERT INTO v2.graph_edges (
    source_type, source_id, target_type, target_id, edge_type,
    edge_data, weight, is_directed, metadata, created_by, account_id
  )
  VALUES (
    source_type, source_id, target_type, target_id, edge_type,
    edge_data, weight, is_directed, metadata, created_by, account_id
  )
  RETURNING id INTO edge_id;
  
  RETURN edge_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update graph edge
CREATE OR REPLACE FUNCTION v2.update_graph_edge(
  edge_id uuid,
  edge_data jsonb DEFAULT NULL,
  weight numeric DEFAULT NULL,
  is_active boolean DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.graph_edges
  SET 
    edge_data = COALESCE(update_graph_edge.edge_data, edge_data),
    weight = COALESCE(update_graph_edge.weight, weight),
    is_active = COALESCE(update_graph_edge.is_active, is_active),
    metadata = COALESCE(update_graph_edge.metadata, metadata),
    updated_at = now()
  WHERE id = update_graph_edge.edge_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to delete graph edge
CREATE OR REPLACE FUNCTION v2.delete_graph_edge(
  edge_id uuid
)
RETURNS boolean AS $$
BEGIN
  DELETE FROM v2.graph_edges WHERE id = delete_graph_edge.edge_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to find neighbors
CREATE OR REPLACE FUNCTION v2.find_graph_neighbors(
  source_type text,
  source_id uuid,
  edge_types text[] DEFAULT NULL,
  max_depth integer DEFAULT 1,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  target_type text,
  target_id uuid,
  edge_type text,
  edge_data jsonb,
  weight numeric,
  depth integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE neighbors AS (
    -- Base case: direct neighbors
    SELECT 
      ge.target_type,
      ge.target_id,
      ge.edge_type,
      ge.edge_data,
      ge.weight,
      1 as depth
    FROM v2.graph_edges ge
    WHERE ge.source_type = find_graph_neighbors.source_type
    AND ge.source_id = find_graph_neighbors.source_id
    AND (include_inactive = true OR ge.is_active = true)
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
    
    UNION ALL
    
    -- Recursive case: neighbors of neighbors
    SELECT 
      ge.target_type,
      ge.target_id,
      ge.edge_type,
      ge.edge_data,
      ge.weight,
      n.depth + 1
    FROM v2.graph_edges ge
    JOIN neighbors n ON ge.source_type = n.target_type AND ge.source_id = n.target_id
    WHERE n.depth < find_graph_neighbors.max_depth
    AND (include_inactive = true OR ge.is_active = true)
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
  )
  SELECT * FROM neighbors
  ORDER BY depth, weight;
END;
$$ LANGUAGE plpgsql;

-- Function to find shortest path
CREATE OR REPLACE FUNCTION v2.find_shortest_path(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  edge_types text[] DEFAULT NULL,
  max_path_length integer DEFAULT 10
)
RETURNS TABLE (
  path_length integer,
  path_weight numeric,
  path_nodes jsonb,
  path_edges jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE paths AS (
    -- Base case: direct connections
    SELECT 
      1 as path_length,
      ge.weight as path_weight,
      jsonb_build_array(
        jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
        jsonb_build_object('type', ge.target_type, 'id', ge.target_id)
      ) as path_nodes,
      jsonb_build_array(
        jsonb_build_object(
          'edge_id', ge.id,
          'edge_type', ge.edge_type,
          'source', jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
          'target', jsonb_build_object('type', ge.target_type, 'id', ge.target_id),
          'weight', ge.weight
        )
      ) as path_edges
    FROM v2.graph_edges ge
    WHERE ge.source_type = find_shortest_path.source_type
    AND ge.source_id = find_shortest_path.source_id
    AND ge.is_active = true
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
    
    UNION ALL
    
    -- Recursive case: extend paths
    SELECT 
      p.path_length + 1,
      p.path_weight + ge.weight,
      p.path_nodes || jsonb_build_array(
        jsonb_build_object('type', ge.target_type, 'id', ge.target_id)
      ) as path_nodes,
      p.path_edges || jsonb_build_array(
        jsonb_build_object(
          'edge_id', ge.id,
          'edge_type', ge.edge_type,
          'source', jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
          'target', jsonb_build_object('type', ge.target_type, 'id', ge.target_id),
          'weight', ge.weight
        )
      ) as path_edges
    FROM v2.graph_edges ge
    JOIN paths p ON ge.source_type = (p.path_nodes->-1->>'type')::text
                     AND ge.source_id = (p.path_nodes->-1->>'id')::uuid
    WHERE p.path_length < find_shortest_path.max_path_length
    AND ge.is_active = true
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
    -- Avoid cycles
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.path_nodes) n
      WHERE n->>'type' = ge.target_type AND n->>'id' = ge.target_id::text
    )
  )
  SELECT 
    path_length,
    path_weight,
    path_nodes,
    path_edges
  FROM paths
  WHERE (path_nodes->-1->>'type') = find_shortest_path.target_type
  AND (path_nodes->-1->>'id') = find_shortest_path.target_id::text
  ORDER BY path_weight ASC, path_length ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to find all paths
CREATE OR REPLACE FUNCTION v2.find_all_paths(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  edge_types text[] DEFAULT NULL,
  max_path_length integer DEFAULT 10
)
RETURNS TABLE (
  path_length integer,
  path_weight numeric,
  path_nodes jsonb,
  path_edges jsonb
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE paths AS (
    -- Base case: direct connections
    SELECT 
      1 as path_length,
      ge.weight as path_weight,
      jsonb_build_array(
        jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
        jsonb_build_object('type', ge.target_type, 'id', ge.target_id)
      ) as path_nodes,
      jsonb_build_array(
        jsonb_build_object(
          'edge_id', ge.id,
          'edge_type', ge.edge_type,
          'source', jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
          'target', jsonb_build_object('type', ge.target_type, 'id', ge.target_id),
          'weight', ge.weight
        )
      ) as path_edges
    FROM v2.graph_edges ge
    WHERE ge.source_type = find_all_paths.source_type
    AND ge.source_id = find_all_paths.source_id
    AND ge.is_active = true
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
    
    UNION ALL
    
    -- Recursive case: extend paths
    SELECT 
      p.path_length + 1,
      p.path_weight + ge.weight,
      p.path_nodes || jsonb_build_array(
        jsonb_build_object('type', ge.target_type, 'id', ge.target_id)
      ) as path_nodes,
      p.path_edges || jsonb_build_array(
        jsonb_build_object(
          'edge_id', ge.id,
          'edge_type', ge.edge_type,
          'source', jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
          'target', jsonb_build_object('type', ge.target_type, 'id', ge.target_id),
          'weight', ge.weight
        )
      ) as path_edges
    FROM v2.graph_edges ge
    JOIN paths p ON ge.source_type = (p.path_nodes->-1->>'type')::text
                     AND ge.source_id = (p.path_nodes->-1->>'id')::uuid
    WHERE p.path_length < find_all_paths.max_path_length
    AND ge.is_active = true
    AND (edge_types IS NULL OR ge.edge_type = ANY(edge_types))
    -- Avoid cycles
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.path_nodes) n
      WHERE n->>'type' = ge.target_type AND n->>'id' = ge.target_id::text
    )
  )
  SELECT 
    path_length,
    path_weight,
    path_nodes,
    path_edges
  FROM paths
  WHERE (path_nodes->-1->>'type') = find_all_paths.target_type
  AND (path_nodes->-1->>'id') = find_all_paths.target_id::text
  ORDER BY path_weight ASC, path_length ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to compute graph statistics
CREATE OR REPLACE FUNCTION v2.get_graph_statistics(
  account_id uuid DEFAULT NULL,
  edge_types text[] DEFAULT NULL
)
RETURNS TABLE (
  metric_name text,
  metric_value numeric,
  metric_details jsonb
) AS $$
BEGIN
  -- Total nodes
  RETURN QUERY SELECT 
    'total_nodes' as metric_name,
    COUNT(DISTINCT source_type || '|' || source_id)::numeric as metric_value,
    jsonb_build_object('node_types', jsonb_object_agg(source_type, type_count)) as metric_details
  FROM (
    SELECT source_type, COUNT(*) as type_count
    FROM v2.graph_edges
    WHERE (account_id IS NULL OR account_id = get_graph_statistics.account_id)
    AND (edge_types IS NULL OR edge_type = ANY(edge_types))
    AND is_active = true
    GROUP BY source_type
  ) node_types;
  
  -- Total edges
  RETURN QUERY SELECT 
    'total_edges' as metric_name,
    COUNT(*)::numeric as metric_value,
    jsonb_build_object('edge_types', jsonb_object_agg(edge_type, type_count)) as metric_details
  FROM (
    SELECT edge_type, COUNT(*) as type_count
    FROM v2.graph_edges
    WHERE (account_id IS NULL OR account_id = get_graph_statistics.account_id)
    AND (edge_types IS NULL OR edge_type = ANY(edge_types))
    AND is_active = true
    GROUP BY edge_type
  ) edge_types;
  
  -- Average degree
  RETURN QUERY SELECT 
    'average_degree' as metric_name,
    AVG(degree_counts.node_degree)::numeric as metric_value,
    jsonb_build_object('max_degree', MAX(degree_counts.node_degree), 'min_degree', MIN(degree_counts.node_degree)) as metric_details
  FROM (
    SELECT 
      source_type || '|' || source_id as node_id,
      COUNT(*) as node_degree
    FROM v2.graph_edges
    WHERE (account_id IS NULL OR account_id = get_graph_statistics.account_id)
    AND (edge_types IS NULL OR edge_type = ANY(edge_types))
    AND is_active = true
    GROUP BY source_type, source_id
  ) degree_counts;
  
  -- Connected components
  RETURN QUERY SELECT 
    'connected_components' as metric_name,
    COUNT(DISTINCT component_id)::numeric as metric_value,
    jsonb_build_object('algorithm', 'union_find') as metric_details
  FROM (
    -- Simplified connected components detection
    SELECT 
      MIN(source_type || '|' || source_id) as component_id
    FROM v2.graph_edges
    WHERE (account_id IS NULL OR account_id = get_graph_statistics.account_id)
    AND (edge_types IS NULL OR edge_type = ANY(edge_types))
    AND is_active = true
    GROUP BY source_type, source_id
  ) components;
END;
$$ LANGUAGE plpgsql;

-- Function to cache computed paths
CREATE OR REPLACE FUNCTION v2.cache_graph_path(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  path_type text,
  path_length integer,
  path_weight numeric,
  path_nodes jsonb,
  path_edges jsonb,
  algorithm text DEFAULT 'bfs',
  expires_in_hours integer DEFAULT 24,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  path_id uuid;
BEGIN
  INSERT INTO v2.graph_paths (
    source_type, source_id, target_type, target_id, path_type,
    path_length, path_weight, path_nodes, path_edges, algorithm,
    expires_at, account_id
  )
  VALUES (
    source_type, source_id, target_type, target_id, path_type,
    path_length, path_weight, path_nodes, path_edges, algorithm,
    now() + (expires_in_hours || ' hours')::interval, account_id
  )
  RETURNING id INTO path_id;
  
  RETURN path_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get cached path
CREATE OR REPLACE FUNCTION v2.get_cached_graph_path(
  source_type text,
  source_id uuid,
  target_type text,
  target_id uuid,
  path_type text DEFAULT 'shortest'
)
RETURNS TABLE (
  path_length integer,
  path_weight numeric,
  path_nodes jsonb,
  path_edges jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gp.path_length,
    gp.path_weight,
    gp.path_nodes,
    gp.path_edges
  FROM v2.graph_paths gp
  WHERE gp.source_type = get_cached_graph_path.source_type
  AND gp.source_id = get_cached_graph_path.source_id
  AND gp.target_type = get_cached_graph_path.target_type
  AND gp.target_id = get_cached_graph_path.target_id
  AND gp.path_type = get_cached_graph_path.path_type
  AND (gp.expires_at IS NULL OR gp.expires_at > now())
  ORDER BY gp.path_weight ASC, gp.path_length ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired paths
CREATE OR REPLACE FUNCTION v2.cleanup_expired_graph_paths()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM v2.graph_paths
  WHERE expires_at IS NOT NULL AND expires_at <= now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to validate graph integrity
CREATE OR REPLACE FUNCTION v2.validate_graph_integrity(
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  validation_type text,
  is_valid boolean,
  issue_count bigint,
  issues jsonb
) AS $$
BEGIN
  -- Check for orphaned edges (edges pointing to non-existent nodes)
  RETURN QUERY SELECT 
    'orphaned_edges' as validation_type,
    (COUNT(*) = 0) as is_valid,
    COUNT(*) as issue_count,
    jsonb_agg(
      jsonb_build_object(
        'edge_id', ge.id,
        'source', jsonb_build_object('type', ge.source_type, 'id', ge.source_id),
        'target', jsonb_build_object('type', ge.target_type, 'id', ge.target_id)
      )
    ) as issues
  FROM v2.graph_edges ge
  WHERE (account_id IS NULL OR ge.account_id = validate_graph_integrity.account_id)
  AND ge.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM v2.graph_edges ge2
    WHERE ge2.source_type = ge.target_type
    AND ge2.source_id = ge.target_id
    AND (account_id IS NULL OR ge2.account_id = validate_graph_integrity.account_id)
    AND ge2.is_active = true
  );
  
  -- Check for self-loops
  RETURN QUERY SELECT 
    'self_loops' as validation_type,
    (COUNT(*) = 0) as is_valid,
    COUNT(*) as issue_count,
    jsonb_agg(
      jsonb_build_object('edge_id', ge.id, 'node', jsonb_build_object('type', ge.source_type, 'id', ge.source_id))
    ) as issues
  FROM v2.graph_edges ge
  WHERE (account_id IS NULL OR ge.account_id = validate_graph_integrity.account_id)
  AND ge.is_active = true
  AND ge.source_type = ge.target_type
  AND ge.source_id = ge.target_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.graph_edges IS 'Graph edges for relationship traversal';
COMMENT ON TABLE v2.graph_paths IS 'Precomputed graph paths for performance';
COMMENT ON FUNCTION v2.create_graph_edge(text, uuid, text, uuid, text, jsonb, numeric, boolean, jsonb, uuid, uuid) IS 'Create graph edge';
COMMENT ON FUNCTION v2.find_graph_neighbors(text, uuid, text[], integer, boolean) IS 'Find graph neighbors';
COMMENT ON FUNCTION v2.find_shortest_path(text, uuid, text, uuid, text[], integer) IS 'Find shortest path';
COMMENT ON FUNCTION v2.find_all_paths(text, uuid, text, uuid, text[], integer) IS 'Find all paths';
COMMENT ON FUNCTION v2.get_graph_statistics(uuid, text[]) IS 'Get graph statistics';
COMMENT ON FUNCTION v2.cache_graph_path(text, uuid, text, uuid, text, integer, numeric, jsonb, jsonb, text, integer, uuid) IS 'Cache computed path';
COMMENT ON FUNCTION v2.get_cached_graph_path(text, uuid, text, uuid, text) IS 'Get cached path';
COMMENT ON FUNCTION v2.cleanup_expired_graph_paths() IS 'Cleanup expired paths';
COMMENT ON FUNCTION v2.validate_graph_integrity(uuid) IS 'Validate graph integrity';
