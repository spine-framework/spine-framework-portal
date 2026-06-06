-- Migration 057: Add RLS to Communication Tables
-- Part of Unified Principal Architecture
-- Enables Row-Level Security on threads, messages, and related tables

-- ============================================
-- THREADS TABLE RLS
-- ============================================

ALTER TABLE v2.threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS threads_access ON v2.threads;
DROP POLICY IF EXISTS threads_isolation ON v2.threads;

-- Policy: Threads in accessible accounts
CREATE POLICY threads_access ON v2.threads
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- MESSAGES TABLE RLS
-- ============================================

ALTER TABLE v2.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_access ON v2.messages;
DROP POLICY IF EXISTS messages_isolation ON v2.messages;

-- Policy: Messages in accessible accounts (via thread lookup)
CREATE POLICY messages_access ON v2.messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM v2.threads t
      WHERE t.id = v2.messages.thread_id
        AND t.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM v2.threads t
      WHERE t.id = v2.messages.thread_id
        AND t.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
  );

-- ============================================
-- THREAD_PARTICIPANTS TABLE RLS
-- ============================================

ALTER TABLE v2.thread_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thread_participants_access ON v2.thread_participants;

CREATE POLICY thread_participants_access ON v2.thread_participants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM v2.threads t
      WHERE t.id = v2.thread_participants.thread_id
        AND t.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM v2.threads t
      WHERE t.id = v2.thread_participants.thread_id
        AND t.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    )
  );

-- ============================================
-- LINKS TABLE RLS
-- ============================================

ALTER TABLE v2.links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS links_access ON v2.links;

-- Policy: Links where source or target is in accessible account
CREATE POLICY links_access ON v2.links
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- LINK_TYPES TABLE RLS
-- ============================================

ALTER TABLE v2.link_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_types_access ON v2.link_types;

-- Link types are shared/global
CREATE POLICY link_types_read ON v2.link_types
  FOR SELECT
  USING (true);

CREATE POLICY link_types_modify ON v2.link_types
  FOR ALL
  USING (
    v2.person_is_system_admin(v2.current_actor_id())
    OR v2.current_actor_id() IS NULL
  );

-- ============================================
-- WATCHERS TABLE RLS
-- ============================================

ALTER TABLE v2.watchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS watchers_access ON v2.watchers;

CREATE POLICY watchers_access ON v2.watchers
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- ATTACHMENTS TABLE RLS
-- ============================================

ALTER TABLE v2.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_access ON v2.attachments;

CREATE POLICY attachments_access ON v2.attachments
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- CREATE INDEXES FOR RLS PERFORMANCE
-- ============================================

-- Thread-related indexes
CREATE INDEX IF NOT EXISTS idx_threads_account_id ON v2.threads(account_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON v2.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_thread_id ON v2.thread_participants(thread_id);

-- Link-related indexes
CREATE INDEX IF NOT EXISTS idx_links_account_id ON v2.links(account_id);
CREATE INDEX IF NOT EXISTS idx_watchers_account_id ON v2.watchers(account_id);
CREATE INDEX IF NOT EXISTS idx_attachments_account_id ON v2.attachments(account_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY threads_access ON v2.threads IS 'RLS: Allow access to threads in accessible accounts';
COMMENT ON POLICY messages_access ON v2.messages IS 'RLS: Allow access to messages in threads within accessible accounts';
COMMENT ON POLICY links_access ON v2.links IS 'RLS: Allow access to links in accessible accounts';
COMMENT ON POLICY watchers_access ON v2.watchers IS 'RLS: Allow access to watchers in accessible accounts';
COMMENT ON POLICY attachments_access ON v2.attachments IS 'RLS: Allow access to attachments in accessible accounts';
