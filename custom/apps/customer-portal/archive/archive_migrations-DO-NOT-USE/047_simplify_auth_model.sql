-- Migration 047: Simplify Auth Model
-- Add account_id and role_id directly to people table to eliminate complex junction tables

-- Add account_id and role_id to people table
ALTER TABLE v2.people 
ADD COLUMN account_id uuid REFERENCES v2.accounts(id),
ADD COLUMN role_id uuid REFERENCES v2.roles(id);

-- Add comments
COMMENT ON COLUMN v2.people.account_id IS 'Direct account assignment - eliminates need for people_accounts junction table';
COMMENT ON COLUMN v2.people.role_id IS 'Direct role assignment - eliminates need for people_roles junction table';

-- Create unique constraint to ensure one account per person
ALTER TABLE v2.people 
ADD CONSTRAINT people_account_id_unique UNIQUE (account_id);

-- Migrate existing data from people_accounts to people.account_id
UPDATE v2.people 
SET account_id = pa.account_id
FROM v2.people_accounts pa
WHERE people.id = pa.person_id 
AND pa.is_active = true;

-- Migrate existing data from people_roles to people.role_id  
UPDATE v2.people
SET role_id = pr.role_id
FROM v2.people_roles pr
WHERE people.id = pr.person_id
AND pr.is_active = true;

-- Make columns NOT NULL after migration (only for users that have assignments)
-- Note: We'll keep them nullable for now to handle edge cases

-- Add indexes for performance
CREATE INDEX idx_people_account_id ON v2.people(account_id);
CREATE INDEX idx_people_role_id ON v2.people(role_id);

-- Update people_accounts and people_roles to be inactive (mark as migrated)
UPDATE v2.people_accounts SET is_active = false WHERE person_id IN (
  SELECT id FROM v2.people WHERE account_id IS NOT NULL
);

UPDATE v2.people_roles SET is_active = false WHERE person_id IN (
  SELECT id FROM v2.people WHERE role_id IS NOT NULL
);

-- Add comment about migration status
COMMENT ON TABLE v2.people_accounts IS 'DEPRECATED - Use people.account_id instead. Kept for historical data.';
COMMENT ON TABLE v2.people_roles IS 'DEPRECATED - Use people.role_id instead. Kept for historical data.';
