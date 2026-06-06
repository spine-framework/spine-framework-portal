-- People-Roles connector for Spine v2
-- Links people to specific roles (for role-based permissions)

CREATE TABLE v2.people_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES v2.roles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}',
  
  UNIQUE(person_id, account_id, role_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- Indexes
CREATE INDEX idx_people_roles_person ON v2.people_roles(person_id);
CREATE INDEX idx_people_roles_account ON v2.people_roles(account_id);
CREATE INDEX idx_people_roles_role ON v2.people_roles(role_id);
CREATE INDEX idx_people_roles_granted_by ON v2.people_roles(granted_by);
CREATE INDEX idx_people_roles_active ON v2.people_roles(is_active);
CREATE INDEX idx_people_roles_expires ON v2.people_roles(expires_at) WHERE expires_at IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX idx_people_roles_lookup ON v2.people_roles(person_id, account_id) WHERE is_active = true;
CREATE INDEX idx_people_roles_role_members ON v2.people_roles(role_id, account_id) WHERE is_active = true;

-- Function to get person's roles in account
CREATE OR REPLACE FUNCTION v2.get_person_roles(
  person_id uuid,
  account_id uuid,
  include_expired boolean DEFAULT false
)
RETURNS TABLE (
  role_id uuid,
  role_slug text,
  role_name text,
  is_system boolean,
  granted_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as role_id,
    r.slug as role_slug,
    r.name as role_name,
    r.is_system,
    pr.granted_at,
    pr.expires_at,
    pr.granted_by,
    pr.is_active
  FROM v2.people_roles pr
  JOIN v2.roles r ON pr.role_id = r.id
  WHERE pr.person_id = get_person_roles.person_id
  AND pr.account_id = get_person_roles.account_id
  AND (include_expired OR pr.expires_at IS NULL OR pr.expires_at > now())
  AND r.is_active = true
  ORDER BY pr.granted_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get role members in account
CREATE OR REPLACE FUNCTION v2.get_role_members(
  role_id uuid,
  account_id uuid,
  include_expired boolean DEFAULT false
)
RETURNS TABLE (
  person_id uuid,
  person_name text,
  person_email text,
  granted_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  is_active boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as person_id,
    p.full_name as person_name,
    p.email as person_email,
    pr.granted_at,
    pr.expires_at,
    pr.granted_by,
    pr.is_active
  FROM v2.people_roles pr
  JOIN v2.people p ON pr.person_id = p.id
  WHERE pr.role_id = get_role_members.role_id
  AND pr.account_id = get_role_members.account_id
  AND (include_expired OR pr.expires_at IS NULL OR pr.expires_at > now())
  AND p.is_active = true
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql;

-- Function to grant role to person
CREATE OR REPLACE FUNCTION v2.grant_role_to_person(
  person_id uuid,
  account_id uuid,
  role_id uuid,
  granted_by uuid DEFAULT NULL,
  expires_at timestamptz DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  assignment_id uuid;
BEGIN
  -- Check if role is already granted
  IF EXISTS (
    SELECT 1 FROM v2.people_roles
    WHERE person_id = grant_role_to_person.person_id
    AND account_id = grant_role_to_person.account_id
    AND role_id = grant_role_to_person.role_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Role is already granted to person';
  END IF;
  
  -- Insert or reactivate role assignment
  INSERT INTO v2.people_roles (
    person_id, account_id, role_id, granted_by, expires_at, is_active
  )
  VALUES (
    person_id,
    account_id,
    role_id,
    granted_by,
    expires_at,
    true
  )
  ON CONFLICT (person_id, account_id, role_id)
  DO UPDATE SET
    granted_by = COALESCE(EXCLUDED.granted_by, people_roles.granted_by),
    expires_at = EXCLUDED.expires_at,
    is_active = true,
    granted_at = now()
  RETURNING id INTO assignment_id;
  
  RETURN assignment_id;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke role from person
CREATE OR REPLACE FUNCTION v2.revoke_role_from_person(
  person_id uuid,
  account_id uuid,
  role_id uuid
)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.people_roles
  SET is_active = false
  WHERE person_id = revoke_role_from_person.person_id
  AND account_id = revoke_role_from_person.account_id
  AND role_id = revoke_role_from_person.role_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to check if person has role
CREATE OR REPLACE FUNCTION v2.person_has_role(
  person_id uuid,
  account_id uuid,
  role_slug text
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.people_roles pr
    JOIN v2.roles r ON pr.role_id = r.id
    WHERE pr.person_id = person_has_role.person_id
    AND pr.account_id = person_has_role.account_id
    AND r.slug = person_has_role.role_slug
    AND pr.is_active = true
    AND r.is_active = true
    AND (pr.expires_at IS NULL OR pr.expires_at > now())
  );
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired roles
CREATE OR REPLACE FUNCTION v2.cleanup_expired_roles()
RETURNS integer AS $$
DECLARE
  cleaned_count integer;
BEGIN
  UPDATE v2.people_roles
  SET is_active = false
  WHERE is_active = true
  AND expires_at IS NOT NULL
  AND expires_at <= now();
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.people_roles IS 'Connector table linking people to roles with expiration and audit';
COMMENT ON FUNCTION v2.get_person_roles(uuid, uuid, boolean) IS 'Get all roles for a person in an account';
COMMENT ON FUNCTION v2.get_role_members(uuid, uuid, boolean) IS 'Get all members of a role in an account';
COMMENT ON FUNCTION v2.grant_role_to_person(uuid, uuid, uuid, uuid, timestamptz) IS 'Grant role to person with optional expiration';
COMMENT ON FUNCTION v2.revoke_role_from_person(uuid, uuid, uuid) IS 'Revoke role from person';
COMMENT ON FUNCTION v2.person_has_role(uuid, uuid, text) IS 'Check if person has specific role';
COMMENT ON FUNCTION v2.cleanup_expired_roles() IS 'Deactivate expired role assignments';
