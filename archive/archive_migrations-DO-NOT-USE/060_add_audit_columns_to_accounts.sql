-- Migration 060: Add created_by and updated_by columns to v2.accounts

-- Add missing audit columns
ALTER TABLE v2.accounts 
  ADD COLUMN IF NOT EXISTS created_by uuid NULL REFERENCES v2.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES v2.people(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_created_by ON v2.accounts(created_by);
CREATE INDEX IF NOT EXISTS idx_accounts_updated_by ON v2.accounts(updated_by);

COMMENT ON COLUMN v2.accounts.created_by IS 'Person who created this account';
COMMENT ON COLUMN v2.accounts.updated_by IS 'Person who last updated this account';
