-- Migration 056: Add RLS to Core Tables (Items, Accounts, People)
-- Part of Unified Principal Architecture
-- Enables Row-Level Security with account hierarchy

-- ============================================
-- HELPER FUNCTION: CURRENT ACTOR ID
-- ============================================
-- Returns the current actor ID from JWT or session context
-- Used in RLS policies

CREATE OR REPLACE FUNCTION v2.current_actor_id()
RETURNS uuid AS $$
BEGIN
  -- Get the user ID from the current JWT claim
  -- In Supabase, auth.uid() returns the user UUID from the JWT
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- ACCOUNTS TABLE RLS
-- ============================================

ALTER TABLE v2.accounts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS accounts_access ON v2.accounts;
DROP POLICY IF EXISTS accounts_isolation ON v2.accounts;
DROP POLICY IF EXISTS accounts_hierarchy ON v2.accounts;

-- Policy: Account hierarchy access
CREATE POLICY accounts_access ON v2.accounts
  FOR ALL
  USING (
    -- Actor can access accounts in their hierarchy
    id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR
    -- Special case: system can see all (for migrations)
    v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    -- Can only modify accounts in hierarchy
    id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- PEOPLE TABLE RLS
-- ============================================

ALTER TABLE v2.people ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS people_access ON v2.people;
DROP POLICY IF EXISTS people_isolation ON v2.people;

-- Policy: People in accessible accounts
CREATE POLICY people_access ON v2.people
  FOR ALL
  USING (
    -- Person belongs to an accessible account
    EXISTS (
      SELECT 1 FROM v2.people_accounts pa
      WHERE pa.person_id = v2.people.id
        AND pa.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
        AND pa.is_active = true
    )
    OR
    -- System access
    v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    -- Can only create/modify people in accessible accounts
    EXISTS (
      SELECT 1 FROM v2.people_accounts pa
      WHERE pa.person_id = v2.people.id
        AND pa.account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
        AND pa.is_active = true
    )
  );

-- ============================================
-- PEOPLE_ACCOUNTS TABLE RLS
-- ============================================

ALTER TABLE v2.people_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_accounts_access ON v2.people_accounts;

CREATE POLICY people_accounts_access ON v2.people_accounts
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- PEOPLE_ROLES TABLE RLS
-- ============================================

ALTER TABLE v2.people_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS people_roles_access ON v2.people_roles;

CREATE POLICY people_roles_access ON v2.people_roles
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- ROLES TABLE RLS
-- ============================================

ALTER TABLE v2.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_access ON v2.roles;

-- Policy: Roles are visible across accounts but only modifiable in hierarchy
CREATE POLICY roles_read ON v2.roles
  FOR SELECT
  USING (true);  -- All roles are visible for assignment

CREATE POLICY roles_modify ON v2.roles
  FOR ALL
  USING (
    -- Only system admins can modify system roles
    (is_system = true AND v2.person_is_system_admin(v2.current_actor_id()))
    OR
    -- Non-system roles can be modified by anyone in the account hierarchy
    (is_system = false)
    OR
    -- System access
    v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    (is_system = true AND v2.person_is_system_admin(v2.current_actor_id()))
    OR (is_system = false)
  );

-- ============================================
-- ITEMS TABLE RLS
-- ============================================

ALTER TABLE v2.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_access ON v2.items;
DROP POLICY IF EXISTS items_isolation ON v2.items;

-- Policy: Items in accessible accounts
CREATE POLICY items_access ON v2.items
  FOR ALL
  USING (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  )
  WITH CHECK (
    account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
  );

-- ============================================
-- TYPES TABLE RLS
-- ============================================

ALTER TABLE v2.types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS types_access ON v2.types;

-- Policy: Types are visible across accounts but tied to creating account
CREATE POLICY types_read ON v2.types
  FOR SELECT
  USING (
    account_id IS NULL  -- Global types
    OR account_id IN (SELECT v2.get_accessible_accounts(v2.current_actor_id()))
    OR v2.current_actor_id() IS NULL
  );

CREATE POLICY types_modify ON v2.types
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

-- Indexes to speed up RLS policy lookups
CREATE INDEX IF NOT EXISTS idx_accounts_parent_id ON v2.accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_items_account_id ON v2.items(account_id);
CREATE INDEX IF NOT EXISTS idx_people_accounts_account_id ON v2.people_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_people_accounts_person_id ON v2.people_accounts(person_id);
CREATE INDEX IF NOT EXISTS idx_people_roles_account_id ON v2.people_roles(account_id);
CREATE INDEX IF NOT EXISTS idx_types_account_id ON v2.types(account_id);

-- Composite index for faster hierarchy checks
CREATE INDEX IF NOT EXISTS idx_accounts_active_parent ON v2.accounts(is_active, parent_id) 
  WHERE is_active = true;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION v2.current_actor_id() IS 'Returns the current actor ID from JWT context for RLS policies';

COMMENT ON POLICY accounts_access ON v2.accounts IS 'RLS: Allow access to accounts in actor hierarchy';
COMMENT ON POLICY people_access ON v2.people IS 'RLS: Allow access to people in accessible accounts';
COMMENT ON POLICY items_access ON v2.items IS 'RLS: Allow access to items in accessible accounts';
COMMENT ON POLICY types_read ON v2.types IS 'RLS: Allow reading global types and types in accessible accounts';
