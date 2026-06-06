-- Messages table for Spine v2
-- Individual messages within threads

CREATE TABLE v2.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES v2.threads(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  content text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'team', 'private')),
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  
  UNIQUE(thread_id, sequence),
  CHECK (sequence >= 1)
);

-- Indexes
CREATE INDEX idx_messages_thread_id ON v2.messages(thread_id);
CREATE INDEX idx_messages_sequence ON v2.messages(thread_id, sequence);
CREATE INDEX idx_messages_direction ON v2.messages(direction);
CREATE INDEX idx_messages_visibility ON v2.messages(visibility);
CREATE INDEX idx_messages_created_by ON v2.messages(created_by);
CREATE INDEX idx_messages_account ON v2.messages(account_id);
CREATE INDEX idx_messages_created_at ON v2.messages(created_at);
CREATE INDEX idx_messages_active ON v2.messages(is_active);

-- Composite indexes for common queries
CREATE INDEX idx_messages_thread_active ON v2.messages(thread_id, sequence) WHERE is_active = true;
CREATE INDEX idx_messages_thread_created ON v2.messages(thread_id, created_at) WHERE is_active = true;

-- Function to get thread messages
CREATE OR REPLACE FUNCTION v2.get_thread_messages(
  thread_id uuid,
  account_id uuid,
  visibility text DEFAULT NULL,
  limit integer DEFAULT 100,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  sequence integer,
  content text,
  direction text,
  visibility text,
  metadata jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.sequence,
    m.content,
    m.direction,
    m.visibility,
    m.metadata,
    m.created_by,
    p.full_name as created_by_name,
    m.created_at,
    m.updated_at
  FROM v2.messages m
  LEFT JOIN v2.people p ON m.created_by = p.id
  WHERE m.thread_id = get_thread_messages.thread_id
  AND m.account_id = get_thread_messages.account_id
  AND m.is_active = true
  AND (visibility IS NULL OR m.visibility = get_thread_messages.visibility)
  ORDER BY m.sequence ASC
  LIMIT get_thread_messages.limit
  OFFSET get_thread_messages.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to add message to thread
CREATE OR REPLACE FUNCTION v2.add_message(
  thread_id uuid,
  content text,
  direction text DEFAULT 'outbound',
  visibility text DEFAULT 'all',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  message_id uuid;
  next_sequence integer;
BEGIN
  -- Check thread access
  IF NOT v2.can_access_thread(thread_id, created_by) THEN
    RAISE EXCEPTION 'Access denied to thread';
  END IF;
  
  -- Get next sequence number
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO next_sequence
  FROM v2.messages
  WHERE thread_id = add_message.thread_id;
  
  -- Insert message
  INSERT INTO v2.messages (
    thread_id, sequence, content, direction, visibility,
    metadata, created_by, account_id, is_active
  )
  VALUES (
    thread_id, next_sequence, content, direction, visibility,
    metadata, created_by, account_id, true
  )
  RETURNING id INTO message_id;
  
  -- Update thread updated_at
  UPDATE v2.threads
  SET updated_at = now()
  WHERE id = add_message.thread_id;
  
  RETURN message_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update message
CREATE OR REPLACE FUNCTION v2.update_message(
  message_id uuid,
  content text,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.messages
  SET 
    content = COALESCE(update_message.content, content),
    metadata = COALESCE(update_message.metadata, metadata),
    updated_at = now()
  WHERE id = update_message.message_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to delete message (soft delete)
CREATE OR REPLACE FUNCTION v2.delete_message(message_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.messages
  SET 
    is_active = false,
    updated_at = now()
  WHERE id = delete_message.message_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get message statistics
CREATE OR REPLACE FUNCTION v2.get_message_statistics(
  thread_id uuid DEFAULT NULL,
  account_id uuid DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  thread_id uuid,
  message_count bigint,
  outbound_count bigint,
  inbound_count bigint,
  first_message_at timestamptz,
  last_message_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.thread_id,
    COUNT(*) as message_count,
    COUNT(*) FILTER (WHERE direction = 'outbound') as outbound_count,
    COUNT(*) FILTER (WHERE direction = 'inbound') as inbound_count,
    MIN(m.created_at) as first_message_at,
    MAX(m.created_at) as last_message_at
  FROM v2.messages m
  WHERE m.is_active = true
  AND (thread_id IS NULL OR m.thread_id = get_message_statistics.thread_id)
  AND (account_id IS NULL OR m.account_id = get_message_statistics.account_id)
  AND (date_from IS NULL OR m.created_at >= get_message_statistics.date_from)
  AND (date_to IS NULL OR m.created_at <= get_message_statistics.date_to)
  GROUP BY m.thread_id
  ORDER BY last_message_at DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Function to search messages
CREATE OR REPLACE FUNCTION v2.search_messages(
  account_id uuid,
  query text,
  thread_id uuid DEFAULT NULL,
  visibility text DEFAULT NULL,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  message_id uuid,
  thread_id uuid,
  thread_title text,
  sequence integer,
  content text,
  direction text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id as message_id,
    m.thread_id,
    t.title as thread_title,
    m.sequence,
    m.content,
    m.direction,
    m.created_by,
    p.full_name as created_by_name,
    m.created_at,
    ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', query)) as rank
  FROM v2.messages m
  JOIN v2.threads t ON m.thread_id = t.id
  LEFT JOIN v2.people p ON m.created_by = p.id
  WHERE m.account_id = search_messages.account_id
  AND m.is_active = true
  AND t.status = 'active'
  AND (thread_id IS NULL OR m.thread_id = search_messages.thread_id)
  AND (visibility IS NULL OR m.visibility = search_messages.visibility)
  AND to_tsvector('english', m.content) @@ plainto_tsquery('english', query)
  ORDER BY rank DESC, m.created_at DESC
  LIMIT search_messages.limit
  OFFSET search_messages.offset;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.messages IS 'Individual messages within threads';
COMMENT ON FUNCTION v2.get_thread_messages(uuid, uuid, text, integer, integer) IS 'Get messages for a thread';
COMMENT ON FUNCTION v2.add_message(uuid, text, text, text, jsonb, uuid, uuid) IS 'Add message to thread';
COMMENT ON FUNCTION v2.update_message(uuid, text, jsonb) IS 'Update message content';
COMMENT ON FUNCTION v2.delete_message(uuid) IS 'Soft delete message';
COMMENT ON FUNCTION v2.get_message_statistics(uuid, uuid, timestamptz, timestamptz) IS 'Get message statistics';
COMMENT ON FUNCTION v2.search_messages(uuid, text, uuid, text, integer, integer) IS 'Search messages by content';
