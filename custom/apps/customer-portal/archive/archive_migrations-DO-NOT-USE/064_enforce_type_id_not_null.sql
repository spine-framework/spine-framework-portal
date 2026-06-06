-- Migration 064: Enforce type_id NOT NULL on All Runtime Tables
-- Runs AFTER migration 063 which guarantees every existing record has a type_id.
-- This is the permanent forward gate: no runtime record can be created without a type.

BEGIN;

-- ============================================
-- VERIFY all records have type_id before constraining
-- (These will raise an error and abort the transaction if any row has NULL type_id)
-- ============================================

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM v2.accounts WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'accounts: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.people WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'people: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.items WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'items: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.threads WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'threads: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.messages WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'messages: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.attachments WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'attachments: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.links WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'links: % records still have NULL type_id', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.watchers WHERE type_id IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'watchers: % records still have NULL type_id', cnt; END IF;

  RAISE NOTICE 'All runtime tables: type_id verified, applying NOT NULL constraints';
END $$;

-- ============================================
-- APPLY NOT NULL CONSTRAINTS
-- ============================================

ALTER TABLE v2.accounts    ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.people      ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.items       ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.threads     ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.messages    ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.attachments ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.links       ALTER COLUMN type_id SET NOT NULL;
ALTER TABLE v2.watchers    ALTER COLUMN type_id SET NOT NULL;

-- ============================================
-- ALSO ENFORCE non-empty design_schema
-- Every record must have a design_schema with record_permissions
-- ============================================

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM v2.accounts WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'accounts: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.people WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'people: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.items WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'items: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.threads WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'threads: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.messages WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'messages: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.attachments WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'attachments: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.links WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'links: % records still have no record_permissions in design_schema', cnt; END IF;

  SELECT COUNT(*) INTO cnt FROM v2.watchers WHERE design_schema -> 'record_permissions' IS NULL;
  IF cnt > 0 THEN RAISE EXCEPTION 'watchers: % records still have no record_permissions in design_schema', cnt; END IF;

  RAISE NOTICE 'All runtime tables: design_schema verified with record_permissions present';
END $$;

COMMIT;
