-- Watchers table for Spine v2
-- Polymorphic subscription to entities for notifications

CREATE TABLE v2.watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  person_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  watch_type text NOT NULL DEFAULT 'all' CHECK (watch_type IN ('all', 'mentions', 'assigned', 'custom')),
  notification_settings jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(person_id, target_type, target_id)
);

-- Indexes
CREATE INDEX idx_watchers_target ON v2.watchers(target_type, target_id);
CREATE INDEX idx_watchers_person ON v2.watchers(person_id);
CREATE INDEX idx_watchers_type ON v2.watchers(watch_type);
CREATE INDEX idx_watchers_active ON v2.watchers(is_active);
CREATE INDEX idx_watchers_created_at ON v2.watchers(created_at);

-- Composite indexes
CREATE INDEX idx_watchers_target_active ON v2.watchers(target_type, target_id) WHERE is_active = true;
CREATE INDEX idx_watchers_person_active ON v2.watchers(person_id) WHERE is_active = true;

-- Function to add watcher
CREATE OR REPLACE FUNCTION v2.add_watcher(
  target_type text,
  target_id uuid,
  person_id uuid,
  watch_type text DEFAULT 'all',
  notification_settings jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE
  watcher_id uuid;
BEGIN
  -- Insert or update watcher
  INSERT INTO v2.watchers (
    target_type, target_id, person_id, watch_type, 
    notification_settings, metadata, is_active
  )
  VALUES (
    target_type, target_id, person_id, watch_type,
    notification_settings, metadata, true
  )
  ON CONFLICT (person_id, target_type, target_id)
  DO UPDATE SET
    watch_type = EXCLUDED.watch_type,
    notification_settings = EXCLUDED.notification_settings,
    metadata = EXCLUDED.metadata,
    is_active = true,
    updated_at = now()
  RETURNING id INTO watcher_id;
  
  RETURN watcher_id;
END;
$$ LANGUAGE plpgsql;

-- Function to remove watcher
CREATE OR REPLACE FUNCTION v2.remove_watcher(
  target_type text,
  target_id uuid,
  person_id uuid
)
RETURNS boolean AS $$
BEGIN
  DELETE FROM v2.watchers
  WHERE target_type = remove_watcher.target_type
  AND target_id = remove_watcher.target_id
  AND person_id = remove_watcher.person_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get watchers for target
CREATE OR REPLACE FUNCTION v2.get_watchers(
  target_type text,
  target_id uuid,
  watch_type text DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  person_id uuid,
  person_name text,
  person_email text,
  watch_type text,
  notification_settings jsonb,
  is_active boolean,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.person_id,
    p.full_name as person_name,
    p.email as person_email,
    w.watch_type,
    w.notification_settings,
    w.is_active,
    w.created_at
  FROM v2.watchers w
  JOIN v2.people p ON w.person_id = p.id
  WHERE w.target_type = get_watchers.target_type
  AND w.target_id = get_watchers.target_id
  AND (watch_type IS NULL OR w.watch_type = get_watchers.watch_type)
  AND (include_inactive OR w.is_active = true)
  AND p.is_active = true
  ORDER BY w.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get person's watches
CREATE OR REPLACE FUNCTION v2.get_person_watches(
  person_id uuid,
  target_type text DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  target_type text,
  target_id uuid,
  watch_type text,
  notification_settings jsonb,
  is_active boolean,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.target_type,
    w.target_id,
    w.watch_type,
    w.notification_settings,
    w.is_active,
    w.created_at
  FROM v2.watchers w
  WHERE w.person_id = get_person_watches.person_id
  AND (target_type IS NULL OR w.target_type = get_person_watches.target_type)
  AND (include_inactive OR w.is_active = true)
  ORDER BY w.target_type, w.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if person is watching
CREATE OR REPLACE FUNCTION v2.is_watching(
  person_id uuid,
  target_type text,
  target_id uuid,
  watch_type text DEFAULT NULL
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.watchers
    WHERE person_id = is_watching.person_id
    AND target_type = is_watching.target_type
    AND target_id = is_watching.target_id
    AND is_active = true
    AND (watch_type IS NULL OR watch_type = is_watching.watch_type)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update notification settings
CREATE OR REPLACE FUNCTION v2.update_notification_settings(
  target_type text,
  target_id uuid,
  person_id uuid,
  notification_settings jsonb
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.watchers
  SET 
    notification_settings = notification_settings,
    updated_at = now()
  WHERE target_type = update_notification_settings.target_type
  AND target_id = update_notification_settings.target_id
  AND person_id = update_notification_settings.person_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to deactivate watcher
CREATE OR REPLACE FUNCTION v2.deactivate_watcher(
  target_type text,
  target_id uuid,
  person_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.watchers
  SET 
    is_active = false,
    updated_at = now()
  WHERE target_type = deactivate_watcher.target_type
  AND target_id = deactivate_watcher.target_id
  AND person_id = deactivate_watcher.person_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.watchers IS 'Polymorphic subscription to entities for notifications';
COMMENT ON FUNCTION v2.add_watcher(text, uuid, uuid, text, jsonb, jsonb) IS 'Add person as watcher to target';
COMMENT ON FUNCTION v2.remove_watcher(text, uuid, uuid) IS 'Remove watcher from target';
COMMENT ON FUNCTION v2.get_watchers(text, uuid, text, boolean) IS 'Get all watchers for a target';
COMMENT ON FUNCTION v2.get_person_watches(uuid, text, boolean) IS 'Get all targets a person is watching';
COMMENT ON FUNCTION v2.is_watching(uuid, text, uuid, text) IS 'Check if person is watching target';
COMMENT ON FUNCTION v2.update_notification_settings(text, uuid, uuid, jsonb) IS 'Update notification settings for watcher';
COMMENT ON FUNCTION v2.deactivate_watcher(text, uuid, uuid) IS 'Deactivate watcher (soft delete)';
