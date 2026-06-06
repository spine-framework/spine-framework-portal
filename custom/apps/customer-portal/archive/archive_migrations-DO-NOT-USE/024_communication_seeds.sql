-- Seed data and functions for communication layer in Spine v2
-- Default notification settings and system events

-- Update emitLog function to use the new logs table
CREATE OR REPLACE FUNCTION v2.emitLog(
  ctx jsonb, -- RequestContext as JSON
  eventType text,
  target jsonb DEFAULT NULL, -- {type: string, id: string}
  changes jsonb DEFAULT NULL, -- {before: any, after: any}
  metadata jsonb DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  log_id uuid;
  actor_id uuid;
  account_id uuid;
  app_id uuid;
BEGIN
  -- Extract context from ctx
  actor_id := (ctx->>'personId')::uuid;
  account_id := (ctx->>'accountId')::uuid;
  app_id := (ctx->>'appId')::uuid;
  
  -- Handle null UUIDs
  IF actor_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    actor_id := NULL;
  END IF;
  
  IF app_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    app_id := NULL;
  END IF;
  
  -- Log the event
  INSERT INTO v2.logs (
    app_id, event_type, actor_id, target_type, target_id,
    action, details, metadata, account_id
  )
  VALUES (
    app_id,
    eventType,
    actor_id,
    COALESCE(target->>'type', NULL),
    COALESCE(target->>'id', NULL)::uuid,
    COALESCE(metadata->>'action', NULL),
    COALESCE(changes, '{}'),
    metadata,
    account_id
  );
END;
$$ LANGUAGE plpgsql;

-- Default notification settings
CREATE OR REPLACE FUNCTION v2.get_default_notification_settings()
RETURNS jsonb AS $$
BEGIN
  RETURN '{
    "email": {
      "enabled": true,
      "messages": true,
      "mentions": true,
      "assignments": true,
      "digest": "daily"
    },
    "push": {
      "enabled": true,
      "messages": true,
      "mentions": true,
      "assignments": true
    },
    "in_app": {
      "enabled": true,
      "messages": true,
      "mentions": true,
      "assignments": true,
      "thread_updates": false
    }
  }'::jsonb;
END;
$$ LANGUAGE plpgsql;

-- Function to create welcome thread for new account members
CREATE OR REPLACE FUNCTION v2.create_welcome_thread(
  person_id uuid,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  thread_id uuid;
  welcome_message text;
BEGIN
  -- Create welcome thread
  INSERT INTO v2.threads (
    target_type, target_id, title, description,
    visibility, status, conversation_mode,
    created_by, account_id
  )
  VALUES (
    'account', account_id,
    'Welcome to ' || (SELECT display_name FROM v2.accounts WHERE id = account_id),
    'A thread to welcome new members and share important information',
    'team', 'active', 'human',
    NULL, account_id
  )
  RETURNING id INTO thread_id;
  
  -- Add person as participant
  INSERT INTO v2.thread_participants (thread_id, person_id, role, account_id)
  VALUES (thread_id, person_id, 'member', account_id);
  
  -- Add welcome message
  welcome_message := 'Welcome to the team! This is your conversation space where you can:
• Ask questions and get help
• Share updates and ideas
• Collaborate with your team members
• Access important announcements

Feel free to introduce yourself and start exploring!';
  
  INSERT INTO v2.messages (
    thread_id, content, direction, visibility,
    created_by, account_id
  )
  VALUES (
    thread_id, welcome_message, 'outbound', 'all',
    NULL, account_id
  );
  
  RETURN thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create system notification thread
CREATE OR REPLACE FUNCTION v2.create_system_thread(
  account_id uuid,
  title text,
  content text
)
RETURNS uuid AS $$
DECLARE
  thread_id uuid;
BEGIN
  -- Create system thread
  INSERT INTO v2.threads (
    target_type, target_id, title, description,
    visibility, status, conversation_mode,
    created_by, account_id
  )
  VALUES (
    'account', account_id, title, 'System announcement',
    'team', 'active', 'human',
    NULL, account_id
  )
  RETURNING id INTO thread_id;
  
  -- Add system message
  INSERT INTO v2.messages (
    thread_id, content, direction, visibility,
    created_by, account_id
  )
  VALUES (
    thread_id, content, 'outbound', 'all',
    NULL, account_id
  );
  
  -- Add all active account members as participants
  INSERT INTO v2.thread_participants (thread_id, person_id, role, account_id)
  SELECT 
    thread_id,
    pa.person_id,
    'member',
    account_id
  FROM v2.people_accounts pa
  WHERE pa.account_id = account_id
  AND pa.is_active = true
  ON CONFLICT (thread_id, person_id) DO NOTHING;
  
  RETURN thread_id;
END;
$$ LANGUAGE plpgsql;

-- Function to handle thread notifications
CREATE OR REPLACE FUNCTION v2.notify_thread_participants(
  thread_id uuid,
  message_id uuid,
  exclude_participant_id uuid DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  participant RECORD;
BEGIN
  -- Get all active participants (except the message author)
  FOR participant IN 
    SELECT 
      tp.person_id,
      p.full_name,
      p.email,
      tp.notification_settings
    FROM v2.thread_participants tp
    JOIN v2.people p ON tp.person_id = p.id
    WHERE tp.thread_id = notify_thread_participants.thread_id
    AND tp.is_active = true
    AND p.is_active = true
    AND (exclude_participant_id IS NULL OR tp.person_id != exclude_participant_id)
  LOOP
    -- Log notification event
    PERFORM v2.log_event(
      'notification',
      NULL, -- system actor
      'thread',
      thread_id,
      'message_notification',
      json_build_object(
        'participant_id', participant.person_id,
        'participant_name', participant.full_name,
        'participant_email', participant.email,
        'message_id', message_id,
        'notification_settings', participant.notification_settings
      ),
      '{}',
      (SELECT account_id FROM v2.threads WHERE id = thread_id)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread message count for person
CREATE OR REPLACE FUNCTION v2.get_unread_message_count(
  person_id uuid,
  account_id uuid
)
RETURNS TABLE (
  thread_id uuid,
  thread_title text,
  unread_count bigint,
  last_message_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  WITH thread_access AS (
    -- Get threads person can access
    SELECT DISTINCT t.id, t.title
    FROM v2.threads t
    WHERE t.account_id = get_unread_message_count.account_id
    AND t.status = 'active'
    AND (
      t.visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM v2.thread_participants tp
        WHERE tp.thread_id = t.id
        AND tp.person_id = get_unread_message_count.person_id
        AND tp.is_active = true
      )
    )
  ),
  last_read AS (
    -- Get last read message per thread for person
    SELECT 
      thread_id,
      MAX(sequence) as last_read_sequence
    FROM v2.message_reads
    WHERE person_id = get_unread_message_count.person_id
    GROUP BY thread_id
  )
  SELECT 
    ta.id as thread_id,
    ta.title as thread_title,
    COALESCE(
      (SELECT COUNT(*) 
       FROM v2.messages m 
       WHERE m.thread_id = ta.id 
       AND m.is_active = true
       AND (lr.last_read_sequence IS NULL OR m.sequence > lr.last_read_sequence)
      ), 0
    ) as unread_count,
    (SELECT MAX(created_at) 
     FROM v2.messages m 
     WHERE m.thread_id = ta.id 
     AND m.is_active = true
    ) as last_message_at
  FROM thread_access ta
  LEFT JOIN last_read lr ON ta.id = lr.thread_id
  WHERE COALESCE(
    (SELECT COUNT(*) 
     FROM v2.messages m 
     WHERE m.thread_id = ta.id 
     AND m.is_active = true
     AND (lr.last_read_sequence IS NULL OR m.sequence > lr.last_read_sequence)
    ), 0
  ) > 0
  ORDER BY last_message_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Message reads table for tracking read status
CREATE TABLE IF NOT EXISTS v2.message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES v2.messages(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES v2.threads(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(person_id, thread_id),
  UNIQUE(message_id, person_id)
);

-- Indexes for message_reads
CREATE INDEX IF NOT EXISTS idx_message_reads_person ON v2.message_reads(person_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_thread ON v2.message_reads(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON v2.message_reads(message_id);

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION v2.mark_thread_read(
  person_id uuid,
  thread_id uuid,
  up_to_sequence integer DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  max_sequence integer;
BEGIN
  -- Get max sequence in thread if not specified
  IF up_to_sequence IS NULL THEN
    SELECT MAX(sequence) INTO max_sequence
    FROM v2.messages
    WHERE thread_id = mark_thread_read.thread_id
    AND is_active = true;
  ELSE
    max_sequence := up_to_sequence;
  END IF;
  
  -- Insert or update read status
  INSERT INTO v2.message_reads (message_id, person_id, thread_id, sequence)
  SELECT 
    id, person_id, thread_id, max_sequence
  FROM v2.messages
  WHERE thread_id = mark_thread_read.thread_id
  AND sequence = max_sequence
  ON CONFLICT (person_id, thread_id)
  DO UPDATE SET
    message_id = EXCLUDED.message_id,
    sequence = EXCLUDED.sequence,
    read_at = now();
END;
$$ LANGUAGE plpgsql;
