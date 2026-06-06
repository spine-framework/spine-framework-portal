-- Thread Participants table for Spine v2
-- Manages who participates in threads

CREATE TABLE v2.thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES v2.threads(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member', 'guest')),
  notification_settings jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  UNIQUE(thread_id, person_id),
  CHECK (left_at IS NULL OR is_active = false)
);

-- Indexes
CREATE INDEX idx_thread_participants_thread ON v2.thread_participants(thread_id);
CREATE INDEX idx_thread_participants_person ON v2.thread_participants(person_id);
CREATE INDEX idx_thread_participants_role ON v2.thread_participants(role);
CREATE INDEX idx_thread_participants_active ON v2.thread_participants(is_active);
CREATE INDEX idx_thread_participants_joined ON v2.thread_participants(joined_at);
CREATE INDEX idx_thread_participants_account ON v2.thread_participants(account_id);

-- Composite indexes
CREATE INDEX idx_thread_participants_thread_active ON v2.thread_participants(thread_id) WHERE is_active = true;
CREATE INDEX idx_thread_participants_person_active ON v2.thread_participants(person_id) WHERE is_active = true;

-- Function to add participant to thread
CREATE OR REPLACE FUNCTION v2.add_thread_participant(
  thread_id uuid,
  person_id uuid,
  role text DEFAULT 'member',
  notification_settings jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  participant_id uuid;
BEGIN
  -- Check if person can access thread
  IF NOT v2.can_access_thread(thread_id, person_id) THEN
    RAISE EXCEPTION 'Person cannot access this thread';
  END IF;
  
  -- Insert or update participant
  INSERT INTO v2.thread_participants (
    thread_id, person_id, role, notification_settings,
    metadata, is_active, joined_at, account_id
  )
  VALUES (
    thread_id, person_id, role, notification_settings,
    metadata, true, now(), account_id
  )
  ON CONFLICT (thread_id, person_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    notification_settings = EXCLUDED.notification_settings,
    metadata = EXCLUDED.metadata,
    is_active = true,
    joined_at = now(),
    left_at = NULL
  RETURNING id INTO participant_id;
  
  RETURN participant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to remove participant from thread
CREATE OR REPLACE FUNCTION v2.remove_thread_participant(
  thread_id uuid,
  person_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.thread_participants
  SET 
    is_active = false,
    left_at = now()
  WHERE thread_id = remove_thread_participant.thread_id
  AND person_id = remove_thread_participant.person_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get thread participants
CREATE OR REPLACE FUNCTION v2.get_thread_participants(
  thread_id uuid,
  include_inactive boolean DEFAULT false,
  role_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  person_id uuid,
  person_name text,
  person_email text,
  role text,
  notification_settings jsonb,
  is_active boolean,
  joined_at timestamptz,
  left_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.id,
    tp.person_id,
    p.full_name as person_name,
    p.email as person_email,
    tp.role,
    tp.notification_settings,
    tp.is_active,
    tp.joined_at,
    tp.left_at
  FROM v2.thread_participants tp
  JOIN v2.people p ON tp.person_id = p.id
  WHERE tp.thread_id = get_thread_participants.thread_id
  AND (include_inactive OR tp.is_active = true)
  AND (role_filter IS NULL OR tp.role = get_thread_participants.role_filter)
  AND p.is_active = true
  ORDER BY 
    CASE tp.role 
      WHEN 'owner' THEN 1
      WHEN 'moderator' THEN 2
      WHEN 'member' THEN 3
      WHEN 'guest' THEN 4
    END,
    tp.joined_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to update participant role
CREATE OR REPLACE FUNCTION v2.update_participant_role(
  thread_id uuid,
  person_id uuid,
  new_role text
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.thread_participants
  SET role = new_role
  WHERE thread_id = update_participant_role.thread_id
  AND person_id = update_participant_role.person_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to update notification settings
CREATE OR REPLACE FUNCTION v2.update_participant_notifications(
  thread_id uuid,
  person_id uuid,
  notification_settings jsonb
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.thread_participants
  SET notification_settings = notification_settings
  WHERE thread_id = update_participant_notifications.thread_id
  AND person_id = update_participant_notifications.person_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to check if person is participant
CREATE OR REPLACE FUNCTION v2.is_thread_participant(
  thread_id uuid,
  person_id uuid,
  role_filter text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.thread_participants
    WHERE thread_id = is_thread_participant.thread_id
    AND person_id = is_thread_participant.person_id
    AND is_active = true
    AND (role_filter IS NULL OR role = is_thread_participant.role_filter)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get participant statistics
CREATE OR REPLACE FUNCTION v2.get_participant_statistics(
  thread_id uuid DEFAULT NULL,
  account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  thread_id uuid,
  total_participants bigint,
  active_participants bigint,
  owners bigint,
  moderators bigint,
  members bigint,
  guests bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.thread_id,
    COUNT(*) as total_participants,
    COUNT(*) FILTER (WHERE is_active = true) as active_participants,
    COUNT(*) FILTER (WHERE role = 'owner') as owners,
    COUNT(*) FILTER (WHERE role = 'moderator') as moderators,
    COUNT(*) FILTER (WHERE role = 'member') as members,
    COUNT(*) FILTER (WHERE role = 'guest') as guests
  FROM v2.thread_participants tp
  WHERE (thread_id IS NULL OR tp.thread_id = get_participant_statistics.thread_id)
  AND (account_id IS NULL OR tp.account_id = get_participant_statistics.account_id)
  GROUP BY tp.thread_id
  ORDER BY active_participants DESC;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.thread_participants IS 'Manages who participates in threads';
COMMENT ON FUNCTION v2.add_thread_participant(uuid, uuid, text, jsonb, jsonb, uuid) IS 'Add participant to thread';
COMMENT ON FUNCTION v2.remove_thread_participant(uuid, uuid) IS 'Remove participant from thread';
COMMENT ON FUNCTION v2.get_thread_participants(uuid, boolean, text) IS 'Get thread participants';
COMMENT ON FUNCTION v2.update_participant_role(uuid, uuid, text) IS 'Update participant role';
COMMENT ON FUNCTION v2.update_participant_notifications(uuid, uuid, jsonb) IS 'Update participant notification settings';
COMMENT ON FUNCTION v2.is_thread_participant(uuid, uuid, text) IS 'Check if person is thread participant';
COMMENT ON FUNCTION v2.get_participant_statistics(uuid, uuid) IS 'Get participant statistics';
