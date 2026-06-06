-- Threads table for Spine v2
-- Conversation and discussion threads

CREATE TABLE v2.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  title text,
  description text,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('public', 'team', 'private')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'closed')),
  conversation_mode text NOT NULL DEFAULT 'human' CHECK (conversation_mode IN ('human', 'ai', 'hybrid')),
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR target_type IN ('account', 'person', 'app')) -- System threads don't need app_id
);

-- Indexes
CREATE INDEX idx_threads_app_id ON v2.threads(app_id);
CREATE INDEX idx_threads_target ON v2.threads(target_type, target_id);
CREATE INDEX idx_threads_visibility ON v2.threads(visibility);
CREATE INDEX idx_threads_status ON v2.threads(status);
CREATE INDEX idx_threads_mode ON v2.threads(conversation_mode);
CREATE INDEX idx_threads_created_by ON v2.threads(created_by);
CREATE INDEX idx_threads_account ON v2.threads(account_id);
CREATE INDEX idx_threads_created_at ON v2.threads(created_at);
CREATE INDEX idx_threads_updated_at ON v2.threads(updated_at);

-- Composite indexes for common queries
CREATE INDEX idx_threads_target_active ON v2.threads(target_type, target_id) WHERE status = 'active';
CREATE INDEX idx_threads_account_status ON v2.threads(account_id, status) WHERE status = 'active';

-- Function to get threads for target
CREATE OR REPLACE FUNCTION v2.get_target_threads(
  target_type text,
  target_id uuid,
  account_id uuid,
  visibility text DEFAULT NULL,
  include_inactive boolean DEFAULT false,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  app_id uuid,
  target_type text,
  target_id uuid,
  title text,
  description text,
  visibility text,
  status text,
  conversation_mode text,
  message_count bigint,
  last_message_at timestamptz,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.app_id,
    t.target_type,
    t.target_id,
    t.title,
    t.description,
    t.visibility,
    t.status,
    t.conversation_mode,
    COALESCE(mc.message_count, 0) as message_count,
    mc.last_message_at,
    t.created_by,
    p.full_name as created_by_name,
    t.created_at,
    t.updated_at
  FROM v2.threads t
  LEFT JOIN v2.people p ON t.created_by = p.id
  LEFT JOIN (
    SELECT 
      thread_id,
      COUNT(*) as message_count,
      MAX(created_at) as last_message_at
    FROM v2.messages
    WHERE is_active = true
    GROUP BY thread_id
  ) mc ON t.id = mc.thread_id
  WHERE t.target_type = get_target_threads.target_type
  AND t.target_id = get_target_threads.target_id
  AND t.account_id = get_target_threads.account_id
  AND (visibility IS NULL OR t.visibility = get_target_threads.visibility)
  AND (include_inactive OR t.status = 'active')
  ORDER BY COALESCE(mc.last_message_at, t.created_at) DESC
  LIMIT get_target_threads.limit
  OFFSET get_target_threads.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get person's threads
CREATE OR REPLACE FUNCTION v2.get_person_threads(
  person_id uuid,
  account_id uuid,
  include_inactive boolean DEFAULT false,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  visibility text,
  status text,
  conversation_mode text,
  message_count bigint,
  last_message_at timestamptz,
  participant_count bigint,
  created_at timestamptz,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.title,
    t.description,
    t.visibility,
    t.status,
    t.conversation_mode,
    COALESCE(mc.message_count, 0) as message_count,
    mc.last_message_at,
    COALESCE(pc.participant_count, 0) as participant_count,
    t.created_at,
    t.updated_at
  FROM v2.threads t
  JOIN v2.thread_participants tp ON t.id = tp.thread_id
  LEFT JOIN (
    SELECT 
      thread_id,
      COUNT(*) as message_count,
      MAX(created_at) as last_message_at
    FROM v2.messages
    WHERE is_active = true
    GROUP BY thread_id
  ) mc ON t.id = mc.thread_id
  LEFT JOIN (
    SELECT 
      thread_id,
      COUNT(*) as participant_count
    FROM v2.thread_participants
    WHERE is_active = true
    GROUP BY thread_id
  ) pc ON t.id = pc.thread_id
  WHERE tp.person_id = get_person_threads.person_id
  AND tp.is_active = true
  AND t.account_id = get_person_threads.account_id
  AND (include_inactive OR t.status = 'active')
  ORDER BY COALESCE(mc.last_message_at, t.created_at) DESC
  LIMIT get_person_threads.limit
  OFFSET get_person_threads.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to create thread
CREATE OR REPLACE FUNCTION v2.create_thread(
  target_type text,
  target_id uuid,
  title text,
  description text DEFAULT NULL,
  visibility text DEFAULT 'team',
  conversation_mode text DEFAULT 'human',
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  thread_id uuid;
BEGIN
  -- Validate target exists
  IF target_type = 'item' THEN
    IF NOT EXISTS (
      SELECT 1 FROM v2.items 
      WHERE id = target_id 
      AND account_id = account_id
      AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Target item not found or inactive';
    END IF;
  END IF;
  
  -- Insert thread
  INSERT INTO v2.threads (
    app_id, target_type, target_id, title, description,
    visibility, status, conversation_mode, metadata,
    created_by, account_id
  )
  VALUES (
    app_id, target_type, target_id, title, description,
    visibility, 'active', conversation_mode, metadata,
    created_by, account_id
  )
  RETURNING id INTO thread_id;
  
  -- Add creator as participant
  IF created_by IS NOT NULL THEN
    INSERT INTO v2.thread_participants (thread_id, person_id, role, account_id)
    VALUES (thread_id, created_by, 'owner', account_id);
  END IF;
  
  RETURN thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update thread status
CREATE OR REPLACE FUNCTION v2.update_thread_status(
  thread_id uuid,
  new_status text
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.threads
  SET 
    status = new_status,
    updated_at = now()
  WHERE id = update_thread_status.thread_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to check thread access
CREATE OR REPLACE FUNCTION v2.can_access_thread(
  thread_id uuid,
  person_id uuid
)
RETURNS boolean AS $$
DECLARE
  thread_visibility text;
  thread_account_id uuid;
  is_participant boolean;
BEGIN
  -- Get thread details
  SELECT visibility, account_id INTO thread_visibility, thread_account_id
  FROM v2.threads
  WHERE id = can_access_thread.thread_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Public threads are accessible to anyone in the account
  IF thread_visibility = 'public' THEN
    RETURN EXISTS (
      SELECT 1 FROM v2.people_accounts
      WHERE person_id = can_access_thread.person_id
      AND account_id = thread_account_id
      AND is_active = true
    );
  END IF;
  
  -- Check if person is a participant
  SELECT EXISTS (
    SELECT 1 FROM v2.thread_participants
    WHERE thread_id = can_access_thread.thread_id
    AND person_id = can_access_thread.person_id
    AND is_active = true
  ) INTO is_participant;
  
  -- Team threads require participation
  IF thread_visibility = 'team' THEN
    RETURN is_participant;
  END IF;
  
  -- Private threads require participation
  IF thread_visibility = 'private' THEN
    RETURN is_participant;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.threads IS 'Conversation and discussion threads';
COMMENT ON FUNCTION v2.get_target_threads(text, uuid, uuid, text, boolean, integer, integer) IS 'Get threads for a target entity';
COMMENT ON FUNCTION v2.get_person_threads(uuid, uuid, boolean, integer, integer) IS 'Get threads a person participates in';
COMMENT ON FUNCTION v2.create_thread(text, uuid, text, text, text, text, jsonb, uuid, uuid, uuid) IS 'Create a new thread';
COMMENT ON FUNCTION v2.update_thread_status(uuid, text) IS 'Update thread status';
COMMENT ON FUNCTION v2.can_access_thread(uuid, uuid) IS 'Check if person can access thread';
