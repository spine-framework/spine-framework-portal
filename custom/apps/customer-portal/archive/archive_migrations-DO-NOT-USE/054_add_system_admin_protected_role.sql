-- Migration 054: Add System Admin as Protected Role
-- Part of Unified Principal Architecture
-- Replaces ctx.systemRole flag with proper role-based system admin

-- ============================================
-- ADD IS_PROTECTED COLUMN TO ROLES
-- ============================================

ALTER TABLE v2.roles ADD COLUMN IF NOT EXISTS is_protected boolean DEFAULT false;

-- ============================================
-- ADD IS_SYSTEM COLUMN (for system-level roles)
-- ============================================

ALTER TABLE v2.roles ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

-- ============================================
-- CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_roles_is_protected ON v2.roles(is_protected);
CREATE INDEX IF NOT EXISTS idx_roles_is_system ON v2.roles(is_system);

-- ============================================
-- UPDATE EXISTING ROLES
-- ============================================

-- Mark existing roles as non-protected, non-system
UPDATE v2.roles 
SET is_protected = false, is_system = false 
WHERE is_protected IS NULL OR is_system IS NULL;

-- ============================================
-- CREATE SYSTEM_ADMIN ROLE (Protected)
-- ============================================

INSERT INTO v2.roles (
  slug, 
  name, 
  description, 
  is_system, 
  is_protected,
  permissions,
  display_order
)
VALUES (
  'system_admin', 
  'System Administrator', 
  'Full system access across all accounts and resources. Protected role cannot be modified or deleted. Only assignable by existing system administrators.',
  true,  -- is_system: visible only to system admins in role management
  true,  -- is_protected: cannot delete, modify slug, or change is_protected flag
  '{}'::jsonb,  -- System admin bypasses all permission checks, so empty permissions object
  0  -- Display first in lists
)
ON CONFLICT (slug) DO UPDATE SET 
  is_system = true,
  is_protected = true,
  name = 'System Administrator',
  description = 'Full system access across all accounts and resources. Protected role cannot be modified or deleted. Only assignable by existing system administrators.';

-- ============================================
-- CREATE OTHER SYSTEM ROLES (Protected by default)
-- ============================================

-- Account Admin (can manage account but not system-level config)
INSERT INTO v2.roles (
  slug, name, description, is_system, is_protected, permissions, display_order
)
VALUES (
  'account_admin',
  'Account Administrator',
  'Full access within their account hierarchy. Can manage users, roles, and all account resources.',
  true,
  true,
  '{}'::jsonb,
  10
)
ON CONFLICT (slug) DO UPDATE SET 
  is_system = true, 
  is_protected = true,
  name = 'Account Administrator';

-- Standard User (basic access)
INSERT INTO v2.roles (
  slug, name, description, is_system, is_protected, permissions, display_order
)
VALUES (
  'user',
  'Standard User',
  'Standard user access to create, read, and update resources. Cannot delete or manage account settings.',
  true,
  true,
  '{"items":{"create":true,"read":true,"update":true,"delete":false}}'::jsonb,
  20
)
ON CONFLICT (slug) DO UPDATE SET 
  is_system = true,
  is_protected = true,
  name = 'Standard User';

-- Read Only (view-only access)
INSERT INTO v2.roles (
  slug, name, description, is_system, is_protected, permissions, display_order
)
VALUES (
  'read_only',
  'Read Only',
  'View-only access to all resources. Cannot create, update, or delete.',
  true,
  true,
  '{"items":{"create":false,"read":true,"update":false,"delete":false}}'::jsonb,
  30
)
ON CONFLICT (slug) DO UPDATE SET 
  is_system = true,
  is_protected = true,
  name = 'Read Only';

-- Guest (minimal access)
INSERT INTO v2.roles (
  slug, name, description, is_system, is_protected, permissions, display_order
)
VALUES (
  'guest',
  'Guest',
  'Minimal access. Can only view assigned items.',
  true,
  true,
  '{"items":{"create":false,"read":true,"update":false,"delete":false}}'::jsonb,
  40
)
ON CONFLICT (slug) DO UPDATE SET 
  is_system = true,
  is_protected = true,
  name = 'Guest';

-- ============================================
-- PROTECT CORE ROLES FROM MODIFICATION
-- ============================================

-- Ensure these critical roles are protected
UPDATE v2.roles 
SET is_protected = true 
WHERE slug IN ('system_admin', 'account_admin', 'user', 'read_only', 'guest');

-- ============================================
-- CREATE ROLE GUARD FUNCTIONS
-- ============================================

-- Check if a role is protected (cannot be deleted or have slug changed)
CREATE OR REPLACE FUNCTION v2.is_role_protected(p_role_slug text)
RETURNS boolean AS $$
DECLARE
  role_record RECORD;
BEGIN
  SELECT is_protected INTO role_record
  FROM v2.roles
  WHERE slug = p_role_slug;
  
  RETURN COALESCE(role_record.is_protected, false);
END;
$$ LANGUAGE plpgsql;

-- Prevent deletion of protected roles
CREATE OR REPLACE FUNCTION v2.prevent_protected_role_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_protected THEN
    RAISE EXCEPTION 'Cannot delete protected role: %', OLD.slug;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Prevent modification of protected role slugs
CREATE OR REPLACE FUNCTION v2.prevent_protected_role_slug_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_protected AND OLD.slug != NEW.slug THEN
    RAISE EXCEPTION 'Cannot change slug of protected role: %', OLD.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Prevent removal of is_protected flag from protected roles
CREATE OR REPLACE FUNCTION v2.prevent_protected_flag_removal()
RETURNS trigger AS $$
BEGIN
  IF OLD.is_protected AND NOT NEW.is_protected THEN
    RAISE EXCEPTION 'Cannot remove is_protected flag from role: %', OLD.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE TRIGGERS
-- ============================================

-- Trigger to prevent deletion of protected roles
DROP TRIGGER IF EXISTS prevent_protected_role_delete ON v2.roles;
CREATE TRIGGER prevent_protected_role_delete
  BEFORE DELETE ON v2.roles
  FOR EACH ROW
  EXECUTE FUNCTION v2.prevent_protected_role_delete();

-- Trigger to prevent slug changes on protected roles
DROP TRIGGER IF EXISTS prevent_protected_role_slug_change ON v2.roles;
CREATE TRIGGER prevent_protected_role_slug_change
  BEFORE UPDATE OF slug ON v2.roles
  FOR EACH ROW
  EXECUTE FUNCTION v2.prevent_protected_role_slug_change();

-- Trigger to prevent removing is_protected flag
DROP TRIGGER IF EXISTS prevent_protected_flag_removal ON v2.roles;
CREATE TRIGGER prevent_protected_flag_removal
  BEFORE UPDATE OF is_protected ON v2.roles
  FOR EACH ROW
  EXECUTE FUNCTION v2.prevent_protected_flag_removal();

-- ============================================
-- CREATE HELPER FUNCTIONS FOR PERMISSION CHECKS
-- ============================================

-- Check if a person has system_admin role
CREATE OR REPLACE FUNCTION v2.person_is_system_admin(p_person_id uuid)
RETURNS boolean AS $$
DECLARE
  has_admin_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 
    FROM v2.people_roles pr
    JOIN v2.roles r ON pr.role_slug = r.slug
    WHERE pr.person_id = p_person_id
      AND r.slug = 'system_admin'
      AND pr.is_active = true
  ) INTO has_admin_role;
  
  RETURN COALESCE(has_admin_role, false);
END;
$$ LANGUAGE plpgsql;

-- Get all roles for a person (including system roles)
CREATE OR REPLACE FUNCTION v2.get_person_roles(p_person_id uuid)
RETURNS TABLE (
  role_slug text,
  role_name text,
  is_system boolean,
  is_protected boolean,
  permissions jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.slug,
    r.name,
    r.is_system,
    r.is_protected,
    r.permissions
  FROM v2.people_roles pr
  JOIN v2.roles r ON pr.role_slug = r.slug
  WHERE pr.person_id = p_person_id
    AND pr.is_active = true
  ORDER BY r.display_order, r.name;
END;
$$ LANGUAGE plpgsql;

-- Get effective permissions for a person (merged from all roles)
CREATE OR REPLACE FUNCTION v2.get_person_effective_permissions(p_person_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}';
  role_perms jsonb;
BEGIN
  -- If system admin, return full permissions
  IF v2.person_is_system_admin(p_person_id) THEN
    RETURN '{"_full_access": true}'::jsonb;
  END IF;
  
  -- Otherwise merge permissions from all roles
  FOR role_perms IN 
    SELECT r.permissions 
    FROM v2.people_roles pr
    JOIN v2.roles r ON pr.role_slug = r.slug
    WHERE pr.person_id = p_person_id AND pr.is_active = true
  LOOP
    result := result || COALESCE(role_perms, '{}'::jsonb);
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ASSIGN SYSTEM_ADMIN TO SYSTEM ADMIN USER
-- ============================================

-- Assign system_admin role to Ken (if not already assigned)
INSERT INTO v2.people_roles (person_id, role_slug, account_id, is_active, created_by)
SELECT 
  p.id,
  'system_admin',
  pa.account_id,
  true,
  p.id
FROM v2.people p
JOIN v2.people_accounts pa ON p.id = pa.person_id
WHERE p.email = 'kpettit851@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM v2.people_roles pr2 
    WHERE pr2.person_id = p.id AND pr2.role_slug = 'system_admin'
  )
LIMIT 1;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN v2.roles.is_protected IS 'If true, role cannot be deleted and slug cannot be changed. Used for system-critical roles.';
COMMENT ON COLUMN v2.roles.is_system IS 'If true, role is a system-defined role (not custom). May affect visibility in UI.';

COMMENT ON FUNCTION v2.is_role_protected(text) IS 'Check if a role is protected from modification';
COMMENT ON FUNCTION v2.person_is_system_admin(uuid) IS 'Check if a person has the system_admin role';
COMMENT ON FUNCTION v2.get_person_roles(uuid) IS 'Get all active roles for a person';
COMMENT ON FUNCTION v2.get_person_effective_permissions(uuid) IS 'Get merged permissions from all roles for a person';
