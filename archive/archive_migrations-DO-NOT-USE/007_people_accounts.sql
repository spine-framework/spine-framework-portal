-- People-Accounts connector for Spine v2
-- Links people to accounts (membership)

CREATE TABLE v2.people_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES v2.people(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  metadata jsonb DEFAULT '{}',
  
  UNIQUE(person_id, account_id),
  CHECK (left_at IS NULL OR is_active = false)
);

-- Indexes
CREATE INDEX idx_people_accounts_person ON v2.people_accounts(person_id);
CREATE INDEX idx_people_accounts_account ON v2.people_accounts(account_id);
CREATE INDEX idx_people_accounts_role ON v2.people_accounts(role_slug);
CREATE INDEX idx_people_accounts_active ON v2.people_accounts(is_active);

-- Function to get person's accounts
CREATE OR REPLACE FUNCTION v2.get_person_accounts(person_id uuid, include_inactive boolean DEFAULT false)
RETURNS TABLE (
  account_id uuid,
  account_slug text,
  account_name text,
  role_slug text,
  is_active boolean,
  joined_at timestamptz,
  left_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id as account_id,
    a.slug as account_slug,
    a.display_name as account_name,
    pa.role_slug,
    pa.is_active,
    pa.joined_at,
    pa.left_at
  FROM v2.people_accounts pa
  JOIN v2.accounts a ON pa.account_id = a.id
  WHERE pa.person_id = get_person_accounts.person_id
  AND (include_inactive OR pa.is_active = true)
  AND a.is_active = true
  ORDER BY pa.joined_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get account's people
CREATE OR REPLACE FUNCTION v2.get_account_people(account_id uuid, include_inactive boolean DEFAULT false)
RETURNS TABLE (
  person_id uuid,
  person_name text,
  person_email text,
  role_slug text,
  is_active boolean,
  joined_at timestamptz,
  left_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as person_id,
    p.full_name as person_name,
    p.email as person_email,
    pa.role_slug,
    pa.is_active,
    pa.joined_at,
    pa.left_at
  FROM v2.people_accounts pa
  JOIN v2.people p ON pa.person_id = p.id
  WHERE pa.account_id = get_account_people.account_id
  AND (include_inactive OR pa.is_active = true)
  AND p.is_active = true
  ORDER BY p.full_name;
END;
$$ LANGUAGE plpgsql;

-- Function to check if person is member of account
CREATE OR REPLACE FUNCTION v2.is_account_member(person_id uuid, account_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM v2.people_accounts
    WHERE person_id = is_account_member.person_id
    AND account_id = is_account_member.account_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql;

-- Function to add person to account
CREATE OR REPLACE FUNCTION v2.add_person_to_account(
  person_id uuid,
  account_id uuid,
  role_slug text
)
RETURNS uuid AS $$
DECLARE
  membership_id uuid;
BEGIN
  -- Check if person is already member
  IF EXISTS (
    SELECT 1 FROM v2.people_accounts
    WHERE person_id = add_person_to_account.person_id
    AND account_id = add_person_to_account.account_id
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Person is already active member of account';
  END IF;
  
  -- Insert or reactivate membership
  INSERT INTO v2.people_accounts (person_id, account_id, role_slug, is_active, joined_at)
  VALUES (
    person_id,
    account_id,
    role_slug,
    true,
    now()
  )
  ON CONFLICT (person_id, account_id) 
  DO UPDATE SET
    role_slug = EXCLUDED.role_slug,
    is_active = true,
    joined_at = now(),
    left_at = NULL
  RETURNING id INTO membership_id;
  
  RETURN membership_id;
END;
$$ LANGUAGE plpgsql;

-- Function to remove person from account
CREATE OR REPLACE FUNCTION v2.remove_person_from_account(person_id uuid, account_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE v2.people_accounts
  SET 
    is_active = false,
    left_at = now()
  WHERE person_id = remove_person_from_account.person_id
  AND account_id = remove_person_from_account.account_id
  AND is_active = true;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.people_accounts IS 'Connector table linking people to accounts with roles';
COMMENT ON FUNCTION v2.get_person_accounts(uuid, boolean) IS 'Get all accounts for a person';
COMMENT ON FUNCTION v2.get_account_people(uuid, boolean) IS 'Get all people in an account';
COMMENT ON FUNCTION v2.is_account_member(uuid, uuid) IS 'Check if person is active member of account';
COMMENT ON FUNCTION v2.add_person_to_account(uuid, uuid, text) IS 'Add person to account with role';
COMMENT ON FUNCTION v2.remove_person_from_account(uuid, uuid) IS 'Remove person from account';
