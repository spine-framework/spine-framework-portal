-- Migration 050: Unify Runtime Entity Schema
-- Adds data, design_schema, validation_schema, is_active, and other standard fields
-- to accounts, people, items, threads, messages, links, attachments, watchers

-- ============================================
-- ACCOUNTS: Add schema-driven fields
-- ============================================

-- Add data jsonb for custom fields per type
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

-- Add schema caches from type
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS validation_schema jsonb;

-- Add is_active for soft delete
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Add app_id for scoping (nullable for system accounts)
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES v2.apps(id);

-- Add updated_by for audit
ALTER TABLE v2.accounts ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_accounts_data ON v2.accounts USING gin(data);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active ON v2.accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_app_id ON v2.accounts(app_id);

-- ============================================
-- PEOPLE: Add schema-driven fields
-- ============================================

ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES v2.apps(id);
ALTER TABLE v2.people ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

CREATE INDEX IF NOT EXISTS idx_people_data ON v2.people USING gin(data);
CREATE INDEX IF NOT EXISTS idx_people_is_active ON v2.people(is_active);
CREATE INDEX IF NOT EXISTS idx_people_app_id ON v2.people(app_id);

-- ============================================
-- ITEMS: Migrate to type_id FK, add schema fields
-- ============================================

-- First add the new columns
ALTER TABLE v2.items ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.items ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.items ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.items ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.items ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_items_type_id ON v2.items(type_id);
CREATE INDEX IF NOT EXISTS idx_items_slug ON v2.items(slug);

-- ============================================
-- THREADS: Add schema-driven fields
-- ============================================

ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.threads ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

CREATE INDEX IF NOT EXISTS idx_threads_type_id ON v2.threads(type_id);
CREATE INDEX IF NOT EXISTS idx_threads_slug ON v2.threads(slug);
CREATE INDEX IF NOT EXISTS idx_threads_data ON v2.threads USING gin(data);
CREATE INDEX IF NOT EXISTS idx_threads_is_active ON v2.threads(is_active);

-- ============================================
-- MESSAGES: Add schema-driven fields
-- ============================================

ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.messages ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

CREATE INDEX IF NOT EXISTS idx_messages_type_id ON v2.messages(type_id);
CREATE INDEX IF NOT EXISTS idx_messages_data ON v2.messages USING gin(data);
CREATE INDEX IF NOT EXISTS idx_messages_is_active ON v2.messages(is_active);

-- ============================================
-- LINKS: Migrate link_type to type_id, add schema fields
-- ============================================

ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.links ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

CREATE INDEX IF NOT EXISTS idx_links_type_id ON v2.links(type_id);
CREATE INDEX IF NOT EXISTS idx_links_slug ON v2.links(slug);
CREATE INDEX IF NOT EXISTS idx_links_data ON v2.links USING gin(data);
CREATE INDEX IF NOT EXISTS idx_links_is_active ON v2.links(is_active);

-- ============================================
-- ATTACHMENTS: Add schema-driven fields, rename uploaded_by
-- ============================================

ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES v2.people(id);
ALTER TABLE v2.attachments ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

-- Migrate uploaded_by to created_by if data exists
UPDATE v2.attachments SET created_by = uploaded_by WHERE uploaded_by IS NOT NULL AND created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_type_id ON v2.attachments(type_id);
CREATE INDEX IF NOT EXISTS idx_attachments_slug ON v2.attachments(slug);
CREATE INDEX IF NOT EXISTS idx_attachments_data ON v2.attachments USING gin(data);
CREATE INDEX IF NOT EXISTS idx_attachments_is_active ON v2.attachments(is_active);
CREATE INDEX IF NOT EXISTS idx_attachments_created_by ON v2.attachments(created_by);

-- ============================================
-- WATCHERS: Add schema-driven fields
-- ============================================

ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS design_schema jsonb;
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS validation_schema jsonb;
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE v2.watchers ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

CREATE INDEX IF NOT EXISTS idx_watchers_type_id ON v2.watchers(type_id);
CREATE INDEX IF NOT EXISTS idx_watchers_data ON v2.watchers USING gin(data);
CREATE INDEX IF NOT EXISTS idx_watchers_is_active ON v2.watchers(is_active);

-- ============================================
-- Add kind values to types table constraint
-- ============================================

-- Note: The types table should already have these kind values.
-- If not, we may need to alter the constraint. This is handled in separate migration.

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE v2.accounts IS 'Account records with schema-driven data support';
COMMENT ON TABLE v2.people IS 'People records with schema-driven data support';
COMMENT ON TABLE v2.items IS 'Item records with type_id FK and schema-driven data';
COMMENT ON TABLE v2.threads IS 'Thread records with schema-driven data support';
COMMENT ON TABLE v2.messages IS 'Message records with schema-driven data support';
COMMENT ON TABLE v2.links IS 'Link records with schema-driven data support';
COMMENT ON TABLE v2.attachments IS 'Attachment records with schema-driven data support';
COMMENT ON TABLE v2.watchers IS 'Watcher records with schema-driven data support';
