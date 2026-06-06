-- Attachments table for Spine v2
-- Polymorphic file attachments to entities

CREATE TABLE v2.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_path text NOT NULL,
  storage_provider text NOT NULL DEFAULT 'supabase' CHECK (storage_provider IN ('supabase', 's3', 'gcs', 'azure')),
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (size_bytes >= 0)
);

-- Indexes
CREATE INDEX idx_attachments_target ON v2.attachments(target_type, target_id);
CREATE INDEX idx_attachments_uploaded_by ON v2.attachments(uploaded_by);
CREATE INDEX idx_attachments_account ON v2.attachments(account_id);
CREATE INDEX idx_attachments_filename ON v2.attachments(filename);
CREATE INDEX idx_attachments_content_type ON v2.attachments(content_type);
CREATE INDEX idx_attachments_created_at ON v2.attachments(created_at);

-- Composite indexes
CREATE INDEX idx_attachments_target_account ON v2.attachments(target_type, target_id, account_id);

-- Function to create attachment record
CREATE OR REPLACE FUNCTION v2.create_attachment(
  target_type text,
  target_id uuid,
  filename text,
  content_type text,
  size_bytes integer,
  storage_path text,
  storage_provider text DEFAULT 'supabase',
  metadata jsonb DEFAULT '{}',
  uploaded_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  attachment_id uuid;
BEGIN
  -- Validate target exists (basic check)
  IF target_type = 'item' THEN
    IF NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = target_id 
      AND account_id = account_id
    ) THEN
      RAISE EXCEPTION 'Target item not found';
    END IF;
  END IF;
  
  -- Insert attachment record
  INSERT INTO v2.attachments (
    target_type, target_id, filename, content_type, size_bytes,
    storage_path, storage_provider, metadata, uploaded_by, account_id
  )
  VALUES (
    target_type, target_id, filename, content_type, size_bytes,
    storage_path, storage_provider, metadata, uploaded_by, account_id
  )
  RETURNING id INTO attachment_id;
  
  RETURN attachment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get attachments for target
CREATE OR REPLACE FUNCTION v2.get_attachments(
  target_type text,
  target_id uuid,
  account_id uuid,
  content_type text DEFAULT NULL,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  filename text,
  content_type text,
  size_bytes integer,
  storage_path text,
  storage_provider text,
  metadata jsonb,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.filename,
    a.content_type,
    a.size_bytes,
    a.storage_path,
    a.storage_provider,
    a.metadata,
    a.uploaded_by,
    p.full_name as uploaded_by_name,
    a.created_at
  FROM v2.attachments a
  LEFT JOIN v2.people p ON a.uploaded_by = p.id
  WHERE a.target_type = get_attachments.target_type
  AND a.target_id = get_attachments.target_id
  AND a.account_id = get_attachments.account_id
  AND (content_type IS NULL OR a.content_type = get_attachments.content_type)
  ORDER BY a.created_at DESC
  LIMIT get_attachments.limit
  OFFSET get_attachments.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get attachment details
CREATE OR REPLACE FUNCTION v2.get_attachment(attachment_id uuid)
RETURNS TABLE (
  id uuid,
  target_type text,
  target_id uuid,
  filename text,
  content_type text,
  size_bytes integer,
  storage_path text,
  storage_provider text,
  metadata jsonb,
  uploaded_by uuid,
  uploaded_by_name text,
  account_id uuid,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.target_type,
    a.target_id,
    a.filename,
    a.content_type,
    a.size_bytes,
    a.storage_path,
    a.storage_provider,
    a.metadata,
    a.uploaded_by,
    p.full_name as uploaded_by_name,
    a.account_id,
    a.created_at
  FROM v2.attachments a
  LEFT JOIN v2.people p ON a.uploaded_by = p.id
  WHERE a.id = get_attachment.attachment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to delete attachment
CREATE OR REPLACE FUNCTION v2.delete_attachment(attachment_id uuid)
RETURNS boolean AS $$
BEGIN
  DELETE FROM v2.attachments
  WHERE id = delete_attachment.attachment_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to update attachment metadata
CREATE OR REPLACE FUNCTION v2.update_attachment_metadata(
  attachment_id uuid,
  metadata jsonb
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.attachments
  SET 
    metadata = metadata,
    updated_at = now()
  WHERE id = update_attachment_metadata.attachment_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get attachment stats by type
CREATE OR REPLACE FUNCTION v2.get_attachment_stats(
  account_id uuid,
  target_type text DEFAULT NULL
)
RETURNS TABLE (
  content_type text,
  count bigint,
  total_size_bytes bigint,
  avg_size_bytes numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    content_type,
    COUNT(*) as count,
    SUM(size_bytes) as total_size_bytes,
    AVG(size_bytes) as avg_size_bytes
  FROM v2.attachments
  WHERE account_id = get_attachment_stats.account_id
  AND (target_type IS NULL OR target_type = get_attachment_stats.target_type)
  GROUP BY content_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check attachment exists
CREATE OR REPLACE FUNCTION v2.attachment_exists(attachment_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.attachments
    WHERE id = attachment_exists.attachment_id
  );
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.attachments IS 'Polymorphic file attachments to entities';
COMMENT ON FUNCTION v2.create_attachment(text, uuid, text, text, integer, text, text, jsonb, uuid, uuid) IS 'Create attachment record';
COMMENT ON FUNCTION v2.get_attachments(text, uuid, uuid, text, integer, integer) IS 'Get attachments for target';
COMMENT ON FUNCTION v2.get_attachment(uuid) IS 'Get attachment details';
COMMENT ON FUNCTION v2.delete_attachment(uuid) IS 'Delete attachment record';
COMMENT ON FUNCTION v2.update_attachment_metadata(uuid, jsonb) IS 'Update attachment metadata';
COMMENT ON FUNCTION v2.get_attachment_stats(uuid, text) IS 'Get attachment statistics by content type';
COMMENT ON FUNCTION v2.attachment_exists(uuid) IS 'Check if attachment exists';
