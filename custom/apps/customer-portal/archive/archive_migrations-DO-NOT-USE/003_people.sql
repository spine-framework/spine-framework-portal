-- People table for Spine v2
-- People represent users in the system and can belong to multiple accounts

-- Create people table
CREATE TABLE v2.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid REFERENCES v2.types(id) ON DELETE SET NULL,
  auth_uid text UNIQUE, -- Supabase auth user ID
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  avatar_url text,
  metadata jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(email),
  CHECK (is_active = (status = 'active'))
);

-- Indexes
CREATE INDEX idx_people_auth_uid ON v2.people(auth_uid);
CREATE INDEX idx_people_type_id ON v2.people(type_id);
CREATE INDEX idx_people_email ON v2.people(email);
CREATE INDEX idx_people_status ON v2.people(status);
CREATE INDEX idx_people_active ON v2.people(is_active);

-- Function to get or create person from auth
CREATE OR REPLACE FUNCTION v2.get_or_create_person(auth_uid text, email text, full_name text)
RETURNS uuid AS $$
DECLARE
  person_id uuid;
BEGIN
  -- Try to find existing person
  SELECT id INTO person_id
  FROM v2.people
  WHERE auth_uid = get_or_create_person.auth_uid;
  
  -- If not found, create new person
  IF person_id IS NULL THEN
    INSERT INTO v2.people (auth_uid, email, full_name)
    VALUES (auth_uid, email, full_name)
    RETURNING id INTO person_id;
  END IF;
  
  RETURN person_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update person from auth
CREATE OR REPLACE FUNCTION v2.update_person_from_auth(auth_uid text, email text, full_name text)
RETURNS void AS $$
BEGIN
  UPDATE v2.people
  SET 
    email = email,
    full_name = full_name,
    updated_at = now()
  WHERE auth_uid = update_person_from_auth.auth_uid;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.people IS 'People records - users in Spine v2';
COMMENT ON FUNCTION v2.get_or_create_person(text, text, text) IS 'Get existing person or create new from auth data';
COMMENT ON FUNCTION v2.update_person_from_auth(text, text, text) IS 'Update person record from auth data';
