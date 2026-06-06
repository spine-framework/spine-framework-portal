-- Migration 049: Schema-Driven Permissions for First Surface Tables
-- This migration implements the three-layer schema system:
-- - design_schema: Permissions, field definitions, AI agents, pipelines
-- - validation_schema: Auto-generated validation rules
-- - data: Runtime data (renamed from metadata where applicable)

-- Begin transaction
BEGIN;

-- Update types table: rename schema to design_schema, add validation_schema, add attachment kind
ALTER TABLE v2.types 
  RENAME COLUMN schema TO design_schema;

ALTER TABLE v2.types 
  ADD COLUMN validation_schema jsonb DEFAULT '{}';

-- Update kind constraint to include 'attachment'
ALTER TABLE v2.types 
  DROP CONSTRAINT types_kind_check;

ALTER TABLE v2.types 
  ADD CONSTRAINT types_kind_check 
    CHECK (kind IN ('item', 'account', 'person', 'thread', 'message', 'attachment'));

-- Drop permissions column from roles table
ALTER TABLE v2.roles 
  DROP COLUMN IF EXISTS permissions;

-- Add type_id to threads, messages, attachments tables
ALTER TABLE v2.threads 
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);

ALTER TABLE v2.messages 
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);

ALTER TABLE v2.attachments 
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES v2.types(id);

-- Add design_schema and validation_schema to all six record tables
ALTER TABLE v2.accounts 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

ALTER TABLE v2.people 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

ALTER TABLE v2.items 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

ALTER TABLE v2.threads 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

ALTER TABLE v2.messages 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

ALTER TABLE v2.attachments 
  ADD COLUMN IF NOT EXISTS design_schema jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_schema jsonb DEFAULT '{}';

-- Rename metadata to data on tables that have it
ALTER TABLE v2.accounts 
  RENAME COLUMN metadata TO data;

ALTER TABLE v2.people 
  RENAME COLUMN metadata TO data;

ALTER TABLE v2.threads 
  RENAME COLUMN metadata TO data;

ALTER TABLE v2.messages 
  RENAME COLUMN metadata TO data;

ALTER TABLE v2.attachments 
  RENAME COLUMN metadata TO data;

-- Drop metadata from items table (merge into data)
-- First, merge any existing metadata into data
UPDATE v2.items 
SET data = COALESCE(
  jsonb_build_object(
    'merged_metadata', metadata,
    'existing_data', data
  ),
  jsonb_build_object('merged_metadata', metadata)
)
WHERE metadata IS NOT NULL AND metadata != '{}';

-- Then drop the column
ALTER TABLE v2.items 
  DROP COLUMN IF EXISTS metadata;

-- Update get_type_schema function to read from design_schema
CREATE OR REPLACE FUNCTION v2.get_type_schema(kind text, slug text, app_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  type_schema jsonb;
BEGIN
  SELECT design_schema INTO type_schema
  FROM v2.types
  WHERE kind = get_type_schema.kind
  AND slug = get_type_schema.slug
  AND (app_id = get_type_schema.app_id OR (app_id IS NULL AND get_type_schema.app_id IS NULL))
  AND is_active = true
  ORDER BY app_id DESC NULLS LAST -- Prefer app-specific types over system types
  LIMIT 1;
  
  RETURN COALESCE(type_schema, '{}');
END;
$$ LANGUAGE plpgsql;

-- Update validate_type_schema function for new structure
CREATE OR REPLACE FUNCTION v2.validate_type_schema(schema jsonb)
RETURNS boolean AS $$
BEGIN
  -- Basic validation - check if it's a valid JSON object
  IF jsonb_typeof(schema) != 'object' THEN
    RETURN false;
  END IF;
  
  -- For now, just basic structure validation
  -- More comprehensive validation can be added later
  
  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_types_design_schema ON v2.types USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_types_validation_schema ON v2.types USING GIN (validation_schema);

-- Indexes for record tables
CREATE INDEX IF NOT EXISTS idx_accounts_design_schema ON v2.accounts USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_accounts_type_id ON v2.accounts (type_id);
CREATE INDEX IF NOT EXISTS idx_accounts_validation_schema ON v2.accounts USING GIN (validation_schema);

CREATE INDEX IF NOT EXISTS idx_people_design_schema ON v2.people USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_people_type_id ON v2.people (type_id);
CREATE INDEX IF NOT EXISTS idx_people_validation_schema ON v2.people USING GIN (validation_schema);

CREATE INDEX IF NOT EXISTS idx_items_design_schema ON v2.items USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_items_type_id ON v2.items (type_id);
CREATE INDEX IF NOT EXISTS idx_items_validation_schema ON v2.items USING GIN (validation_schema);

CREATE INDEX IF NOT EXISTS idx_threads_design_schema ON v2.threads USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_threads_type_id ON v2.threads (type_id);
CREATE INDEX IF NOT EXISTS idx_threads_validation_schema ON v2.threads USING GIN (validation_schema);

CREATE INDEX IF NOT EXISTS idx_messages_design_schema ON v2.messages USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_messages_type_id ON v2.messages (type_id);
CREATE INDEX IF NOT EXISTS idx_messages_validation_schema ON v2.messages USING GIN (validation_schema);

CREATE INDEX IF NOT EXISTS idx_attachments_design_schema ON v2.attachments USING GIN (design_schema);
CREATE INDEX IF NOT EXISTS idx_attachments_type_id ON v2.attachments (type_id);
CREATE INDEX IF NOT EXISTS idx_attachments_validation_schema ON v2.attachments USING GIN (validation_schema);

-- Add comments for documentation
COMMENT ON COLUMN v2.types.design_schema IS 'Design schema containing permissions, field definitions, AI agents, and pipelines';
COMMENT ON COLUMN v2.types.validation_schema IS 'Auto-generated validation schema with data type rules and constraints';
COMMENT ON COLUMN v2.accounts.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.accounts.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.accounts.data IS 'Runtime data for the account (renamed from metadata)';
COMMENT ON COLUMN v2.people.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.people.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.people.data IS 'Runtime data for the person (renamed from metadata)';
COMMENT ON COLUMN v2.items.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.items.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.items.data IS 'Runtime data for the item';
COMMENT ON COLUMN v2.threads.type_id IS 'Reference to the type definition for this thread';
COMMENT ON COLUMN v2.threads.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.threads.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.threads.data IS 'Runtime data for the thread (renamed from metadata)';
COMMENT ON COLUMN v2.messages.type_id IS 'Reference to the type definition for this message';
COMMENT ON COLUMN v2.messages.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.messages.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.messages.data IS 'Runtime data for the message (renamed from metadata)';
COMMENT ON COLUMN v2.attachments.type_id IS 'Reference to the type definition for this attachment';
COMMENT ON COLUMN v2.attachments.design_schema IS 'Snapshot of type design schema at creation time';
COMMENT ON COLUMN v2.attachments.validation_schema IS 'Snapshot of type validation schema at creation time';
COMMENT ON COLUMN v2.attachments.data IS 'Runtime data for the attachment (renamed from metadata)';

-- Create trigger function to automatically populate design_schema and validation_schema on record creation
CREATE OR REPLACE FUNCTION v2.set_record_schema_defaults()
RETURNS TRIGGER AS $$
DECLARE
  type_record v2.types%ROWTYPE;
BEGIN
  -- Get the type record
  SELECT * INTO type_record 
  FROM v2.types 
  WHERE id = NEW.type_id 
  AND is_active = true;
  
  IF FOUND THEN
    -- Set schema snapshots from type
    NEW.design_schema := type_record.design_schema;
    NEW.validation_schema := type_record.validation_schema;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for tables with type_id
CREATE TRIGGER set_threads_schema_defaults
  BEFORE INSERT ON v2.threads
  FOR EACH ROW
  WHEN (NEW.type_id IS NOT NULL)
  EXECUTE FUNCTION v2.set_record_schema_defaults();

CREATE TRIGGER set_messages_schema_defaults
  BEFORE INSERT ON v2.messages
  FOR EACH ROW
  WHEN (NEW.type_id IS NOT NULL)
  EXECUTE FUNCTION v2.set_record_schema_defaults();

CREATE TRIGGER set_attachments_schema_defaults
  BEFORE INSERT ON v2.attachments
  FOR EACH ROW
  WHEN (NEW.type_id IS NOT NULL)
  EXECUTE FUNCTION v2.set_record_schema_defaults();

-- Create trigger function for items table (uses item_type_id)
CREATE OR REPLACE FUNCTION v2.set_item_schema_defaults()
RETURNS TRIGGER AS $$
DECLARE
  type_record v2.types%ROWTYPE;
BEGIN
  -- Get the type record using item_type_id as text lookup
  SELECT * INTO type_record 
  FROM v2.types 
  WHERE slug = NEW.item_type_id 
  AND kind = 'item'
  AND is_active = true;
  
  IF FOUND THEN
    -- Set schema snapshots from type
    NEW.design_schema := type_record.design_schema;
    NEW.validation_schema := type_record.validation_schema;
    -- Update item_type_id to use the actual UUID
    NEW.item_type_id := type_record.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_items_schema_defaults
  BEFORE INSERT ON v2.items
  FOR EACH ROW
  WHEN (NEW.item_type_id IS NOT NULL)
  EXECUTE FUNCTION v2.set_item_schema_defaults();

-- Commit transaction
COMMIT;

-- Migration complete
-- All six first surface tables now have uniform schema-driven permissions
-- with design_schema, data, and validation_schema columns
