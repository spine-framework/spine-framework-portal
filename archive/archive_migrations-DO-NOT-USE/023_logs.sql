-- Logs table for Spine v2
-- Comprehensive audit and activity logging

CREATE TABLE v2.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_id uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  target_type text,
  target_id uuid,
  action text,
  details jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (app_id IS NOT NULL OR event_type IN ('system', 'auth', 'account', 'person'))
);

-- Indexes
CREATE INDEX idx_logs_app_id ON v2.logs(app_id);
CREATE INDEX idx_logs_event_type ON v2.logs(event_type);
CREATE INDEX idx_logs_actor ON v2.logs(actor_id);
CREATE INDEX idx_logs_target ON v2.logs(target_type, target_id);
CREATE INDEX idx_logs_action ON v2.logs(action);
CREATE INDEX idx_logs_account ON v2.logs(account_id);
CREATE INDEX idx_logs_created_at ON v2.logs(created_at);

-- Composite indexes for common queries
CREATE INDEX idx_logs_account_event ON v2.logs(account_id, event_type);
CREATE INDEX idx_logs_target_event ON v2.logs(target_type, target_id, event_type);
CREATE INDEX idx_logs_actor_recent ON v2.logs(actor_id, created_at DESC);

-- GIN index for JSONB
CREATE INDEX idx_logs_details_gin ON v2.logs USING gin(details);
CREATE INDEX idx_logs_metadata_gin ON v2.logs USING gin(metadata);

-- Function to log event
CREATE OR REPLACE FUNCTION v2.log_event(
  event_type text,
  actor_id uuid DEFAULT NULL,
  target_type text DEFAULT NULL,
  target_id uuid DEFAULT NULL,
  action text DEFAULT NULL,
  details jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  account_id uuid,
  app_id uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO v2.logs (
    app_id, event_type, actor_id, target_type, target_id,
    action, details, metadata, account_id
  )
  VALUES (
    app_id, event_type, actor_id, target_type, target_id,
    action, details, metadata, account_id
  )
  RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get logs by account
CREATE OR REPLACE FUNCTION v2.get_account_logs(
  account_id uuid,
  event_type text DEFAULT NULL,
  target_type text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  limit integer DEFAULT 100,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_type text,
  actor_id uuid,
  actor_name text,
  target_type text,
  target_id uuid,
  action text,
  details jsonb,
  metadata jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.event_type,
    l.actor_id,
    p.full_name as actor_name,
    l.target_type,
    l.target_id,
    l.action,
    l.details,
    l.metadata,
    l.created_at
  FROM v2.logs l
  LEFT JOIN v2.people p ON l.actor_id = p.id
  WHERE l.account_id = get_account_logs.account_id
  AND (event_type IS NULL OR l.event_type = get_account_logs.event_type)
  AND (target_type IS NULL OR l.target_type = get_account_logs.target_type)
  AND (date_from IS NULL OR l.created_at >= get_account_logs.date_from)
  AND (date_to IS NULL OR l.created_at <= get_account_logs.date_to)
  ORDER BY l.created_at DESC
  LIMIT get_account_logs.limit
  OFFSET get_account_logs.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get logs by target
CREATE OR REPLACE FUNCTION v2.get_target_logs(
  target_type text,
  target_id uuid,
  account_id uuid,
  event_type text DEFAULT NULL,
  limit integer DEFAULT 100,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_type text,
  actor_id uuid,
  actor_name text,
  action text,
  details jsonb,
  metadata jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.event_type,
    l.actor_id,
    p.full_name as actor_name,
    l.action,
    l.details,
    l.metadata,
    l.created_at
  FROM v2.logs l
  LEFT JOIN v2.people p ON l.actor_id = p.id
  WHERE l.target_type = get_target_logs.target_type
  AND l.target_id = get_target_logs.target_id
  AND l.account_id = get_target_logs.account_id
  AND (event_type IS NULL OR l.event_type = get_target_logs.event_type)
  ORDER BY l.created_at DESC
  LIMIT get_target_logs.limit
  OFFSET get_target_logs.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get activity feed for person
CREATE OR REPLACE FUNCTION v2.get_person_activity(
  person_id uuid,
  account_id uuid,
  include_system boolean DEFAULT false,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_type text,
  action text,
  target_type text,
  target_id uuid,
  target_title text,
  details jsonb,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.event_type,
    l.action,
    l.target_type,
    l.target_id,
    CASE 
      WHEN l.target_type = 'item' THEN (SELECT title FROM v2.items WHERE id = l.target_id)
      WHEN l.target_type = 'thread' THEN (SELECT title FROM v2.threads WHERE id = l.target_id)
      WHEN l.target_type = 'person' THEN (SELECT full_name FROM v2.people WHERE id = l.target_id)
      WHEN l.target_type = 'account' THEN (SELECT display_name FROM v2.accounts WHERE id = l.target_id)
      ELSE NULL
    END as target_title,
    l.details,
    l.created_at
  FROM v2.logs l
  WHERE l.actor_id = get_person_activity.person_id
  AND l.account_id = get_person_activity.account_id
  AND (include_system OR l.event_type NOT IN ('system', 'auth'))
  ORDER BY l.created_at DESC
  LIMIT get_person_activity.limit
  OFFSET get_person_activity.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get log statistics
CREATE OR REPLACE FUNCTION v2.get_log_statistics(
  account_id uuid,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  event_type text,
  count bigint,
  unique_actors bigint,
  first_event_at timestamptz,
  last_event_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    event_type,
    COUNT(*) as count,
    COUNT(DISTINCT actor_id) as unique_actors,
    MIN(created_at) as first_event_at,
    MAX(created_at) as last_event_at
  FROM v2.logs
  WHERE account_id = get_log_statistics.account_id
  AND (date_from IS NULL OR created_at >= get_log_statistics.date_from)
  AND (date_to IS NULL OR created_at <= get_log_statistics.date_to)
  GROUP BY event_type
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to search logs
CREATE OR REPLACE FUNCTION v2.search_logs(
  account_id uuid,
  query text,
  event_type text DEFAULT NULL,
  target_type text DEFAULT NULL,
  limit integer DEFAULT 50,
  offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  event_type text,
  actor_id uuid,
  actor_name text,
  target_type text,
  target_id uuid,
  action text,
  details jsonb,
  metadata jsonb,
  created_at timestamptz,
  rank real
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.event_type,
    l.actor_id,
    p.full_name as actor_name,
    l.target_type,
    l.target_id,
    l.action,
    l.details,
    l.metadata,
    l.created_at,
    ts_rank(
      to_tsvector('english', COALESCE(l.action, '') || ' ' || COALESCE(l.details::text, '')), 
      plainto_tsquery('english', query)
    ) as rank
  FROM v2.logs l
  LEFT JOIN v2.people p ON l.actor_id = p.id
  WHERE l.account_id = search_logs.account_id
  AND (event_type IS NULL OR l.event_type = search_logs.event_type)
  AND (target_type IS NULL OR l.target_type = search_logs.target_type)
  AND to_tsvector('english', COALESCE(l.action, '') || ' ' || COALESCE(l.details::text, '')) @@ plainto_tsquery('english', query)
  ORDER BY rank DESC, l.created_at DESC
  LIMIT search_logs.limit
  OFFSET search_logs.offset;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old logs
CREATE OR REPLACE FUNCTION v2.cleanup_old_logs(
  days_to_keep integer DEFAULT 90
)
RETURNS integer AS $$
DECLARE
  cutoff_date timestamptz;
  deleted_count integer;
BEGIN
  cutoff_date := now() - (days_to_keep || ' days')::interval;
  
  DELETE FROM v2.logs
  WHERE created_at < cutoff_date
  AND event_type NOT IN ('system', 'auth');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.logs IS 'Comprehensive audit and activity logging';
COMMENT ON FUNCTION v2.log_event(text, uuid, text, uuid, text, jsonb, jsonb, uuid, uuid) IS 'Log an event';
COMMENT ON FUNCTION v2.get_account_logs(uuid, text, text, timestamptz, timestamptz, integer, integer) IS 'Get logs by account';
COMMENT ON FUNCTION v2.get_target_logs(text, uuid, uuid, text, integer, integer) IS 'Get logs for a target';
COMMENT ON FUNCTION v2.get_person_activity(uuid, uuid, boolean, integer, integer) IS 'Get activity feed for person';
COMMENT ON FUNCTION v2.get_log_statistics(uuid, timestamptz, timestamptz) IS 'Get log statistics';
COMMENT ON FUNCTION v2.search_logs(uuid, text, text, text, integer, integer) IS 'Search logs by content';
COMMENT ON FUNCTION v2.cleanup_old_logs(integer) IS 'Cleanup old logs (retention policy)';
