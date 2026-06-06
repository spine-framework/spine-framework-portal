-- Embeddings table for Spine v2
-- Vector embeddings for semantic search and AI features

CREATE TABLE v2.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  content text NOT NULL,
  embedding_model text NOT NULL DEFAULT 'text-embedding-ada-002',
  embedding_vector vector(1536), -- OpenAI ada-002 dimension
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (target_type IS NOT NULL AND target_id IS NOT NULL),
  CHECK (embedding_model IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_embeddings_app_id ON v2.embeddings(app_id);
CREATE INDEX idx_embeddings_target ON v2.embeddings(target_type, target_id);
CREATE INDEX idx_embeddings_model ON v2.embeddings(embedding_model);
CREATE INDEX idx_embeddings_created_at ON v2.embeddings(created_at);
CREATE INDEX idx_embeddings_account ON v2.embeddings(account_id);

-- Vector index for similarity search
CREATE INDEX idx_embeddings_vector ON v2.embeddings USING ivfflat (embedding_vector vector_cosine_ops);

-- GIN indexes for JSONB
CREATE INDEX idx_embeddings_metadata_gin ON v2.embeddings USING gin(metadata);

-- Function to create embedding
CREATE OR REPLACE FUNCTION v2.create_embedding(
  app_id uuid,
  target_type text,
  target_id uuid,
  content text,
  embedding_model text DEFAULT 'text-embedding-ada-002',
  metadata jsonb DEFAULT '{}',
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  embedding_id uuid;
  embedding_vector vector(1536);
BEGIN
  -- Generate embedding (placeholder - in production would call actual embedding service)
  -- For now, create a random vector for demonstration
  embedding_vector := ARRAY(
    SELECT random() * 2 - 1 FROM generate_series(1, 1536)
  )::vector(1536);
  
  -- Insert embedding
  INSERT INTO v2.embeddings (
    app_id, target_type, target_id, content, embedding_model,
    embedding_vector, metadata, account_id
  )
  VALUES (
    app_id, target_type, target_id, content, embedding_model,
    embedding_vector, metadata, account_id
  )
  RETURNING id INTO embedding_id;
  
  RETURN embedding_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update embedding
CREATE OR REPLACE FUNCTION v2.update_embedding(
  embedding_id uuid,
  content text DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  embedding_vector vector(1536);
BEGIN
  -- Generate new embedding if content changed
  IF content IS NOT NULL THEN
    -- Generate new embedding (placeholder)
    embedding_vector := ARRAY(
      SELECT random() * 2 - 1 FROM generate_series(1, 1536)
    )::vector(1536);
    
    UPDATE v2.embeddings
    SET 
      content = content,
      embedding_vector = embedding_vector,
      metadata = COALESCE(update_embedding.metadata, metadata),
      updated_at = now()
    WHERE id = update_embedding.embedding_id;
  ELSE
    UPDATE v2.embeddings
    SET 
      metadata = COALESCE(update_embedding.metadata, metadata),
      updated_at = now()
    WHERE id = update_embedding.embedding_id;
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to search similar embeddings
CREATE OR REPLACE FUNCTION v2.search_similar_embeddings(
  query_vector vector(1536),
  target_type text DEFAULT NULL,
  app_id uuid DEFAULT NULL,
  limit integer DEFAULT 10,
  similarity_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  embedding_id uuid,
  target_type text,
  target_id uuid,
  content text,
  similarity float,
  metadata jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as embedding_id,
    e.target_type,
    e.target_id,
    e.content,
    1 - (e.embedding_vector <=> query_vector) as similarity,
    e.metadata
  FROM v2.embeddings e
  WHERE (target_type IS NULL OR e.target_type = search_similar_embeddings.target_type)
  AND (app_id IS NULL OR e.app_id = search_similar_embeddings.app_id)
  AND 1 - (e.embedding_vector <=> query_vector) >= similarity_threshold
  ORDER BY e.embedding_vector <=> query_vector
  LIMIT search_similar_embeddings.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search embeddings by content
CREATE OR REPLACE FUNCTION v2.search_embeddings_by_content(
  query_text text,
  target_type text DEFAULT NULL,
  app_id uuid DEFAULT NULL,
  limit integer DEFAULT 10
)
RETURNS TABLE (
  embedding_id uuid,
  target_type text,
  target_id uuid,
  content text,
  similarity float,
  metadata jsonb
) AS $$
DECLARE
  query_vector vector(1536);
BEGIN
  -- Generate embedding for query text (placeholder)
  query_vector := ARRAY(
    SELECT random() * 2 - 1 FROM generate_series(1, 1536)
  )::vector(1536);
  
  -- Search using the vector
  RETURN QUERY
  SELECT 
    e.id as embedding_id,
    e.target_type,
    e.target_id,
    e.content,
    1 - (e.embedding_vector <=> query_vector) as similarity,
    e.metadata
  FROM v2.embeddings e
  WHERE (target_type IS NULL OR e.target_type = search_embeddings_by_content.target_type)
  AND (app_id IS NULL OR e.app_id = search_embeddings_by_content.app_id)
  AND to_tsvector('english', e.content) @@ plainto_tsquery('english', query_text)
  ORDER BY e.embedding_vector <=> query_vector
  LIMIT search_embeddings_by_content.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get embedding statistics
CREATE OR REPLACE FUNCTION v2.get_embedding_statistics(
  account_id uuid DEFAULT NULL,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  embedding_model text,
  total_embeddings bigint,
  embeddings_by_target_type jsonb,
  avg_content_length numeric,
  last_embedding_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.embedding_model,
    COUNT(*) as total_embeddings,
    jsonb_object_agg(e.target_type, type_counts) as embeddings_by_target_type,
    AVG(LENGTH(e.content)) as avg_content_length,
    MAX(e.created_at) as last_embedding_at
  FROM v2.embeddings e
  LEFT JOIN (
    SELECT 
      target_type,
      COUNT(*) as type_counts
    FROM v2.embeddings e2
    WHERE (account_id IS NULL OR e2.account_id = get_embedding_statistics.account_id)
    AND (app_id IS NULL OR e2.app_id = get_embedding_statistics.app_id)
    GROUP BY target_type
  ) type_counts ON e.target_type = type_counts.target_type
  WHERE (account_id IS NULL OR e.account_id = get_embedding_statistics.account_id)
  AND (app_id IS NULL OR e.app_id = get_embedding_statistics.app_id)
  GROUP BY e.embedding_model;
END;
$$ LANGUAGE plpgsql;

-- Function to batch create embeddings
CREATE OR REPLACE FUNCTION v2.batch_create_embeddings(
  embeddings_data jsonb,
  app_id uuid DEFAULT NULL,
  embedding_model text DEFAULT 'text-embedding-ada-002',
  account_id uuid
)
RETURNS TABLE (
  embedding_id uuid,
  success boolean,
  error_message text
) AS $$
DECLARE
  embedding_record RECORD;
  embedding_id uuid;
  embedding_vector vector(1536);
  success_flag boolean;
  error_msg text;
BEGIN
  -- Process each embedding in the batch
  FOR embedding_record IN 
    SELECT value FROM jsonb_array_elements(embeddings_data)
  LOOP
    success_flag := true;
    error_msg := NULL;
    
    BEGIN
      -- Generate embedding vector (placeholder)
      embedding_vector := ARRAY(
        SELECT random() * 2 - 1 FROM generate_series(1, 1536)
      )::vector(1536);
      
      -- Insert embedding
      INSERT INTO v2.embeddings (
        app_id, target_type, target_id, content, embedding_model,
        embedding_vector, metadata, account_id
      )
      VALUES (
        app_id,
        embedding_record.value->>'target_type',
        (embedding_record.value->>'target_id')::uuid,
        embedding_record.value->>'content',
        embedding_model,
        embedding_vector,
        COALESCE(embedding_record.value->'metadata', '{}'),
        account_id
      )
      RETURNING id INTO embedding_id;
      
    EXCEPTION
      WHEN OTHERS THEN
        success_flag := false;
        error_msg := SQLERRM;
        embedding_id := NULL;
    END;
    
    RETURN QUERY SELECT 
      embedding_id,
      success_flag as success,
      error_msg as error_message;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to delete embeddings for target
CREATE OR REPLACE FUNCTION v2.delete_target_embeddings(
  target_type text,
  target_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM v2.embeddings
  WHERE target_type = delete_target_embeddings.target_type
  AND target_id = delete_target_embeddings.target_id
  AND (app_id IS NULL OR app_id = delete_target_embeddings.app_id);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old embeddings
CREATE OR REPLACE FUNCTION v2.cleanup_embeddings(
  days_to_keep integer DEFAULT 365
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.embeddings
  WHERE created_at < cutoff_date;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to reindex embeddings
CREATE OR REPLACE FUNCTION v2.reindex_embeddings(
  embedding_model text DEFAULT 'text-embedding-ada-002',
  target_type text DEFAULT NULL,
  app_id uuid DEFAULT NULL,
  batch_size integer DEFAULT 100
)
RETURNS TABLE (
  processed_count integer,
  success_count integer,
  error_count integer
) AS $$
DECLARE
  embedding_record RECORD;
  processed_count integer := 0;
  success_count integer := 0;
  error_count integer := 0;
  new_vector vector(1536);
BEGIN
  -- Get embeddings to reindex
  FOR embedding_record IN 
    SELECT * FROM v2.embeddings
    WHERE embedding_model = reindex_embeddings.embedding_model
    AND (target_type IS NULL OR target_type = reindex_embeddings.target_type)
    AND (app_id IS NULL OR app_id = reindex_embeddings.app_id)
    ORDER BY created_at
    LIMIT reindex_embeddings.batch_size
  LOOP
    processed_count := processed_count + 1;
    
    BEGIN
      -- Generate new embedding vector (placeholder)
      new_vector := ARRAY(
        SELECT random() * 2 - 1 FROM generate_series(1, 1536)
      )::vector(1536);
      
      -- Update embedding
      UPDATE v2.embeddings
      SET 
        embedding_vector = new_vector,
        updated_at = now()
      WHERE id = embedding_record.id;
      
      success_count := success_count + 1;
      
    EXCEPTION
      WHEN OTHERS THEN
        error_count := error_count + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT processed_count, success_count, error_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.embeddings IS 'Vector embeddings for semantic search and AI features';
COMMENT ON FUNCTION v2.create_embedding(uuid, text, uuid, text, text, jsonb, uuid) IS 'Create embedding';
COMMENT ON FUNCTION v2.update_embedding(uuid, text, jsonb) IS 'Update embedding';
COMMENT ON FUNCTION v2.search_similar_embeddings(vector, text, uuid, integer, float) IS 'Search similar embeddings';
COMMENT ON FUNCTION v2.search_embeddings_by_content(text, text, uuid, integer) IS 'Search embeddings by content';
COMMENT ON FUNCTION v2.get_embedding_statistics(uuid, uuid) IS 'Get embedding statistics';
COMMENT ON FUNCTION v2.batch_create_embeddings(jsonb, uuid, text, uuid) IS 'Batch create embeddings';
COMMENT ON FUNCTION v2.delete_target_embeddings(text, uuid, uuid) IS 'Delete embeddings for target';
COMMENT ON FUNCTION v2.cleanup_embeddings(integer) IS 'Cleanup old embeddings';
COMMENT ON FUNCTION v2.reindex_embeddings(text, text, uuid, integer) IS 'Reindex embeddings';
