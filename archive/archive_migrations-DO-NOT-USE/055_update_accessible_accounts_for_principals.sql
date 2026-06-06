-- Migration 055: Update get_accessible_accounts for Unified Principals
-- Part of Unified Principal Architecture
-- Extends hierarchy function to work with both persons and machine principals

-- ============================================
-- DROP EXISTING FUNCTION (if exists with different signature)
-- ============================================

DROP FUNCTION IF EXISTS v2.get_accessible_accounts(uuid);
DROP FUNCTION IF EXISTS v2.get_accessible_accounts(uuid, integer);

-- ============================================
-- CREATE ENHANCED ACCESSIBLE ACCOUNTS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION v2.get_accessible_accounts(
  p_actor_id uuid,
  p_max_levels integer DEFAULT 2
)
RETURNS TABLE (account_id uuid) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE hierarchy AS (
    -- ========================================
    -- BASE CASES: Direct account access
    -- ========================================
    
    -- Case 1: Person with direct account membership
    SELECT 
      pa.account_id,
      0 as level,
      'person_membership'::text as access_type
    FROM v2.people_accounts pa
    WHERE pa.person_id = p_actor_id
      AND pa.is_active = true
    
    UNION
    
    -- Case 2: Machine principal with direct account
    SELECT 
      ak.account_id,
      0 as level,
      'machine_principal'::text as access_type
    FROM v2.api_keys ak
    WHERE ak.id = p_actor_id
      AND ak.is_active = true
    
    UNION
    
    -- ========================================
    -- RECURSIVE CASE 1: Parent accounts (up the tree)
    -- ========================================
    SELECT 
      a.parent_id,
      h.level + 1,
      'parent_account'::text
    FROM v2.accounts a
    INNER JOIN hierarchy h ON a.id = h.account_id
    WHERE a.parent_id IS NOT NULL
      AND h.level < p_max_levels
      AND a.is_active = true
    
    UNION ALL
    
    -- ========================================
    -- RECURSIVE CASE 2: Child accounts (down the tree)
    -- ========================================
    SELECT 
      a.id,
      h.level + 1,
      'child_account'::text
    FROM v2.accounts a
    INNER JOIN hierarchy h ON a.parent_id = h.account_id
    WHERE h.level < p_max_levels
      AND a.is_active = true
  )
  SELECT DISTINCT h.account_id 
  FROM hierarchy h
  WHERE h.account_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE SIMPLIFIED VERSION (default 2 levels)
-- ============================================

CREATE OR REPLACE FUNCTION v2.get_accessible_accounts(p_actor_id uuid)
RETURNS TABLE (account_id uuid) AS $$
BEGIN
  RETURN QUERY SELECT * FROM v2.get_accessible_accounts(p_actor_id, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE ACCOUNT PATH FUNCTIONS
-- ============================================

-- Get full account path (parent chain) for an account
CREATE OR REPLACE FUNCTION v2.get_account_path(p_account_id uuid)
RETURNS TABLE (
  account_id uuid,
  account_slug text,
  account_name text,
  level integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE path AS (
    -- Start with the given account
    SELECT 
      a.id,
      a.slug,
      a.display_name,
      a.parent_id,
      0 as level
    FROM v2.accounts a
    WHERE a.id = p_account_id
    
    UNION ALL
    
    -- Recurse up to parents
    SELECT 
      a.id,
      a.slug,
      a.display_name,
      a.parent_id,
      p.level + 1
    FROM v2.accounts a
    INNER JOIN path p ON a.id = p.parent_id
    WHERE p.level < 5  -- Safety limit
  )
  SELECT 
    p.id,
    p.slug,
    p.display_name,
    p.level
  FROM path p
  ORDER BY p.level;
END;
$$ LANGUAGE plpgsql STABLE;

-- Check if one account is in the hierarchy of another
CREATE OR REPLACE FUNCTION v2.is_account_in_hierarchy(
  p_check_account_id uuid,
  p_base_account_id uuid
)
RETURNS boolean AS $$
DECLARE
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM v2.get_accessible_accounts(p_base_account_id) accessible
    WHERE accessible.account_id = p_check_account_id
  ) INTO result;
  
  RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE ACTOR RESOLUTION FUNCTION
-- ============================================

-- Determine actor type (person or machine) from ID
CREATE OR REPLACE FUNCTION v2.get_actor_type(p_actor_id uuid)
RETURNS text AS $$
DECLARE
  actor_type text;
BEGIN
  -- Check if it's a person
  SELECT 'person'::text INTO actor_type
  FROM v2.people
  WHERE id = p_actor_id;
  
  IF actor_type IS NOT NULL THEN
    RETURN actor_type;
  END IF;
  
  -- Check if it's a machine principal
  SELECT 'machine'::text INTO actor_type
  FROM v2.api_keys
  WHERE id = p_actor_id;
  
  IF actor_type IS NOT NULL THEN
    RETURN actor_type;
  END IF;
  
  RETURN 'unknown';
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE PRINCIPAL INFO FUNCTION
-- ============================================

-- Get principal info for any actor type
CREATE OR REPLACE FUNCTION v2.get_principal_info(p_actor_id uuid)
RETURNS TABLE (
  principal_type text,
  principal_id uuid,
  account_id uuid,
  name text,
  is_active boolean
) AS $$
BEGIN
  -- Try person first
  RETURN QUERY
  SELECT 
    'person'::text,
    p.id,
    pa.account_id,
    COALESCE(p.display_name, p.email),
    p.is_active
  FROM v2.people p
  LEFT JOIN v2.people_accounts pa ON p.id = pa.person_id AND pa.is_primary = true
  WHERE p.id = p_actor_id;
  
  -- If not found, try machine
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      'machine'::text,
      ak.id,
      ak.account_id,
      ak.name,
      ak.is_active
    FROM v2.api_keys ak
    WHERE ak.id = p_actor_id;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE SCOPE CHECK FUNCTION FOR MACHINES
-- ============================================

-- Check if a machine principal has a specific scope
CREATE OR REPLACE FUNCTION v2.machine_has_scope_v2(
  p_machine_id uuid,
  p_scope text
)
RETURNS boolean AS $$
DECLARE
  machine_record RECORD;
  resource_type text;
  action_type text;
BEGIN
  -- Parse scope (format: "resource:action" or "resource:*" or "*:*")
  resource_type := split_part(p_scope, ':', 1);
  action_type := split_part(p_scope, ':', 2);
  
  -- Get machine scopes
  SELECT scopes INTO machine_record
  FROM v2.api_keys
  WHERE id = p_machine_id AND is_active = true;
  
  IF machine_record IS NULL OR machine_record.scopes IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check for exact match
  IF p_scope = ANY(machine_record.scopes) THEN
    RETURN true;
  END IF;
  
  -- Check for wildcard resource (e.g., "items:*" matches "items:read")
  IF (resource_type || ':*') = ANY(machine_record.scopes) THEN
    RETURN true;
  END IF;
  
  -- Check for global wildcard
  IF '*:*' = ANY(machine_record.scopes) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- CREATE COMPREHENSIVE PERMISSION CHECK
-- ============================================

-- Unified permission check for both humans and machines
CREATE OR REPLACE FUNCTION v2.check_principal_permission(
  p_actor_id uuid,
  p_resource_type text,
  p_action text,
  p_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  has_permission boolean,
  permission_source text,
  details jsonb
) AS $$
DECLARE
  actor_type text;
  is_system_admin boolean;
  has_scope boolean;
  account_access boolean;
BEGIN
  -- Determine actor type
  actor_type := v2.get_actor_type(p_actor_id);
  
  IF actor_type = 'unknown' THEN
    RETURN QUERY SELECT false, 'unknown_actor'::text, '{}'::jsonb;
    RETURN;
  END IF;
  
  -- Check account access if specified
  IF p_account_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM v2.get_accessible_accounts(p_actor_id) a WHERE a.account_id = p_account_id
    ) INTO account_access;
    
    IF NOT account_access THEN
      RETURN QUERY SELECT false, 'no_account_access'::text, jsonb_build_object('account_id', p_account_id);
      RETURN;
    END IF;
  END IF;
  
  -- Check based on actor type
  IF actor_type = 'person' THEN
    -- Check if system admin
    is_system_admin := v2.person_is_system_admin(p_actor_id);
    
    IF is_system_admin THEN
      RETURN QUERY SELECT true, 'system_admin_role'::text, '{}'::jsonb;
      RETURN;
    END IF;
    
    -- Otherwise check role-based permissions (simplified - full check in PermissionEngine)
    RETURN QUERY SELECT true, 'role_based'::text, jsonb_build_object('requires_schema_check', true);
    RETURN;
    
  ELSIF actor_type = 'machine' THEN
    -- Check scope
    has_scope := v2.machine_has_scope_v2(p_actor_id, p_resource_type || ':' || p_action);
    
    IF has_scope THEN
      RETURN QUERY SELECT true, 'machine_scope'::text, jsonb_build_object('scope', p_resource_type || ':' || p_action);
      RETURN;
    ELSE
      RETURN QUERY SELECT false, 'missing_scope'::text, jsonb_build_object('required_scope', p_resource_type || ':' || p_action);
      RETURN;
    END IF;
  END IF;
  
  RETURN QUERY SELECT false, 'unknown'::text, '{}'::jsonb;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION v2.get_accessible_accounts(uuid, integer) IS 'Get all accounts accessible by an actor (person or machine) up to N hierarchy levels';
COMMENT ON FUNCTION v2.get_accessible_accounts(uuid) IS 'Get all accounts accessible by an actor (person or machine), default 2 levels';
COMMENT ON FUNCTION v2.get_account_path(uuid) IS 'Get parent account chain for an account';
COMMENT ON FUNCTION v2.is_account_in_hierarchy(uuid, uuid) IS 'Check if account A is in the hierarchy of account B';
COMMENT ON FUNCTION v2.get_actor_type(uuid) IS 'Determine if an ID is a person or machine principal';
COMMENT ON FUNCTION v2.get_principal_info(uuid) IS 'Get principal information for any actor type';
COMMENT ON FUNCTION v2.machine_has_scope_v2(uuid, text) IS 'Check if a machine principal has a specific scope (supports wildcards)';
COMMENT ON FUNCTION v2.check_principal_permission(uuid, text, text, uuid) IS 'Unified permission check for humans and machines';
