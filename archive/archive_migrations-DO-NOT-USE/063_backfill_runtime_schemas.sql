-- Migration 063: Backfill design_schema and validation_schema on All Existing Runtime Records
-- For each record with empty design_schema, resolve type via type_id FK (preferred)
-- or item_type slug (items fallback), then stamp the schema from that type.
-- If no type match exists, stamp permissions=ALL directly as last resort.
-- This migration is idempotent — safe to re-run.

BEGIN;

-- ============================================
-- HELPER: Minimal permissions=ALL schema constant
-- ============================================

-- Used as last-resort stamp when no type can be resolved

-- ============================================
-- ACCOUNTS
-- ============================================

-- Stamp from resolved type where type_id is set
UPDATE v2.accounts a
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE a.type_id = t.id
  AND (a.design_schema = '{}' OR a.design_schema IS NULL OR a.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Last resort: no type_id or type has no record_permissions
UPDATE v2.accounts
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- PEOPLE
-- ============================================

UPDATE v2.people p
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE p.type_id = t.id
  AND (p.design_schema = '{}' OR p.design_schema IS NULL OR p.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

UPDATE v2.people
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- ITEMS
-- ============================================

-- Primary: stamp from type_id FK
UPDATE v2.items i
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE i.type_id = t.id
  AND (i.design_schema = '{}' OR i.design_schema IS NULL OR i.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Fallback: resolve via item_type text slug (for records where type_id was not set)
UPDATE v2.items i
SET
  type_id           = t.id,
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE i.item_type = t.slug
  AND t.kind = 'item'
  AND i.type_id IS NULL
  AND (i.design_schema = '{}' OR i.design_schema IS NULL OR i.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Last resort
UPDATE v2.items
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- THREADS
-- ============================================

UPDATE v2.threads th
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE th.type_id = t.id
  AND (th.design_schema = '{}' OR th.design_schema IS NULL OR th.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

UPDATE v2.threads
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- MESSAGES
-- ============================================

UPDATE v2.messages m
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE m.type_id = t.id
  AND (m.design_schema = '{}' OR m.design_schema IS NULL OR m.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

UPDATE v2.messages
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- ATTACHMENTS
-- ============================================

UPDATE v2.attachments att
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE att.type_id = t.id
  AND (att.design_schema = '{}' OR att.design_schema IS NULL OR att.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

UPDATE v2.attachments
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- LINKS
-- ============================================
-- Links use type_id (added in migration 061).
-- Existing links with link_type_id can be resolved via the link_types table slug → types.slug

-- Resolve via type_id if set
UPDATE v2.links l
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE l.type_id = t.id
  AND (l.design_schema = '{}' OR l.design_schema IS NULL OR l.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Fallback: resolve via link_type_id → link_types.slug → types.slug
UPDATE v2.links l
SET
  type_id           = t.id,
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.link_types lt
JOIN v2.types t ON t.slug = lt.slug AND t.kind = 'link'
WHERE l.link_type_id = lt.id
  AND l.type_id IS NULL
  AND (l.design_schema = '{}' OR l.design_schema IS NULL OR l.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Last resort: use the 'related-to' starter type for all unresolved links
UPDATE v2.links l
SET
  type_id           = t.id,
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE t.kind = 'link' AND t.slug = 'related-to'
  AND l.type_id IS NULL
  AND (l.design_schema = '{}' OR l.design_schema IS NULL OR l.design_schema -> 'record_permissions' IS NULL);

-- Absolute last resort if no link types seeded yet
UPDATE v2.links
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

-- ============================================
-- WATCHERS
-- ============================================

-- Resolve via type_id if set
UPDATE v2.watchers w
SET
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE w.type_id = t.id
  AND (w.design_schema = '{}' OR w.design_schema IS NULL OR w.design_schema -> 'record_permissions' IS NULL)
  AND t.design_schema -> 'record_permissions' IS NOT NULL;

-- Last resort: use the 'all-changes' starter type for unresolved watchers
UPDATE v2.watchers w
SET
  type_id           = t.id,
  design_schema     = t.design_schema,
  validation_schema = COALESCE(t.validation_schema, '{}')
FROM v2.types t
WHERE t.kind = 'watcher' AND t.slug = 'all-changes'
  AND w.type_id IS NULL
  AND (w.design_schema = '{}' OR w.design_schema IS NULL OR w.design_schema -> 'record_permissions' IS NULL);

-- Absolute last resort
UPDATE v2.watchers
SET design_schema = '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb
WHERE (design_schema = '{}' OR design_schema IS NULL OR design_schema -> 'record_permissions' IS NULL);

COMMIT;
