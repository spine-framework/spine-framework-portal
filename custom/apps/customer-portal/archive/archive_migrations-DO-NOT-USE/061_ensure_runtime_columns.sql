-- Migration 061: Ensure All Runtime Tables Have Required Schema Columns
-- Adds type_id, design_schema, validation_schema, data to links and watchers
-- Expands types.kind CHECK to include 'link' and 'watcher'

BEGIN;

-- ============================================
-- EXPAND types.kind CHECK CONSTRAINT
-- ============================================
-- Must happen before we can insert link/watcher types

ALTER TABLE v2.types DROP CONSTRAINT IF EXISTS types_kind_check;

ALTER TABLE v2.types
  ADD CONSTRAINT types_kind_check
    CHECK (kind IN ('item', 'account', 'person', 'thread', 'message', 'attachment', 'link', 'watcher'));

-- ============================================
-- LINKS TABLE
-- ============================================
-- Currently has: id, source_type, source_id, target_type, target_id,
--                link_type_id, metadata, created_by, account_id, created_at
-- Needs:         type_id, design_schema, validation_schema, data, updated_at, updated_by

ALTER TABLE v2.links
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES v2.people(id);

-- ============================================
-- WATCHERS TABLE
-- ============================================
-- Currently has: id, target_type, target_id, person_id,
--                notification_level, metadata, created_at, updated_at
-- Needs:         type_id, design_schema, validation_schema, data, account_id, created_by

ALTER TABLE v2.watchers
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES v2.accounts(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES v2.people(id);

-- ============================================
-- VERIFY OTHER RUNTIME TABLES HAVE REQUIRED COLUMNS
-- (accounts, people, items, threads, messages, attachments already have them
--  from migrations 049/050 — adding IF NOT EXISTS as safety net)
-- ============================================

ALTER TABLE v2.accounts
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE v2.people
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE v2.items
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE v2.threads
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE v2.messages
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

ALTER TABLE v2.attachments
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id),
  ADD COLUMN IF NOT EXISTS design_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}';

-- ============================================
-- INDEXES FOR NEW FKs
-- ============================================

CREATE INDEX IF NOT EXISTS idx_links_type_id ON v2.links(type_id);
CREATE INDEX IF NOT EXISTS idx_links_account_id ON v2.links(account_id);
CREATE INDEX IF NOT EXISTS idx_watchers_type_id ON v2.watchers(type_id);
CREATE INDEX IF NOT EXISTS idx_watchers_account_id ON v2.watchers(account_id);

COMMIT;
