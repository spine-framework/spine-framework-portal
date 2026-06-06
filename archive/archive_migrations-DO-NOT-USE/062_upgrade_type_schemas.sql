-- Migration 062: Seed Starter Types for All Runtime Entity Kinds
-- and ensure all existing types have minimum permissions=ALL schema
--
-- Spine seeds starter types for infrastructure entities (thread, message, link,
-- attachment, watcher) with permissions=ALL as safe defaults.
-- Item, account, and person types are developer-defined — Spine seeds none.
--
-- Any existing type missing record_permissions is upgraded to permissions=ALL.

BEGIN;

-- ============================================
-- MINIMUM VALID SCHEMA CONSTANT
-- permissions=ALL: any authenticated principal that passed RLS
-- gets full CRUD. PermissionEngine still evaluates — it just resolves
-- to "allow all" for every role. This is the floor, not a bypass.
-- ============================================

-- ============================================
-- UPGRADE EXISTING TYPES MISSING record_permissions
-- ============================================
-- Merges permissions=ALL into design_schema where record_permissions is absent.
-- Existing types with record_permissions are untouched.

UPDATE v2.types
SET design_schema = design_schema || '{"record_permissions": {"all": ["create", "read", "update", "delete"]}}'::jsonb
WHERE design_schema -> 'record_permissions' IS NULL
  AND is_active = true;

-- ============================================
-- THREAD TYPES (starter types, permissions=ALL)
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
SELECT kind, slug, name, description, ownership, design_schema, validation_schema, is_active
FROM (VALUES
  ('thread', 'discussion',   'Discussion',   'General discussion thread',     'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('thread', 'support',      'Support',      'Customer support thread',       'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('thread', 'notification', 'Notification', 'System notification thread',    'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('thread', 'ai-chat',      'AI Chat',      'AI-assisted conversation',      'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true)
) AS v(kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.types t WHERE t.kind = 'thread' AND t.slug = v.slug AND t.app_id IS NULL
);

-- ============================================
-- MESSAGE TYPES (starter types, permissions=ALL)
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
SELECT kind, slug, name, description, ownership, design_schema, validation_schema, is_active
FROM (VALUES
  ('message', 'comment',       'Comment',       'User comment or reply',         'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('message', 'system',        'System',        'System-generated message',      'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('message', 'ai-generated',  'AI Generated',  'AI-generated response',         'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('message', 'notification',  'Notification',  'Notification message',          'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true)
) AS v(kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.types t WHERE t.kind = 'message' AND t.slug = v.slug AND t.app_id IS NULL
);

-- ============================================
-- LINK TYPES (starter types, permissions=ALL)
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
SELECT kind, slug, name, description, ownership, design_schema, validation_schema, is_active
FROM (VALUES
  ('link', 'related-to',  'Related To',  'Generic relationship',      'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('link', 'depends-on',  'Depends On',  'Dependency relationship',   'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('link', 'blocks',      'Blocks',      'Blocking relationship',      'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('link', 'references',  'References',  'Reference/citation',         'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('link', 'parent-of',   'Parent Of',   'Hierarchical parent',        'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('link', 'child-of',    'Child Of',    'Hierarchical child',         'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true)
) AS v(kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.types t WHERE t.kind = 'link' AND t.slug = v.slug AND t.app_id IS NULL
);

-- ============================================
-- ATTACHMENT TYPES (starter types, permissions=ALL)
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
SELECT kind, slug, name, description, ownership, design_schema, validation_schema, is_active
FROM (VALUES
  ('attachment', 'document',    'Document',    'Document file (PDF, DOC, etc)',  'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'image',       'Image',       'Image file (JPG, PNG, etc)',     'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'video',       'Video',       'Video file (MP4, MOV, etc)',     'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'audio',       'Audio',       'Audio file (MP3, WAV, etc)',     'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'code',        'Code',        'Source code file',               'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'spreadsheet', 'Spreadsheet', 'Spreadsheet file (XLS, CSV)',    'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'archive',     'Archive',     'Archive file (ZIP, TAR)',        'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('attachment', 'other',       'Other',       'Other file type',                'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true)
) AS v(kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.types t WHERE t.kind = 'attachment' AND t.slug = v.slug AND t.app_id IS NULL
);

-- ============================================
-- WATCHER TYPES (starter types, permissions=ALL)
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
SELECT kind, slug, name, description, ownership, design_schema, validation_schema, is_active
FROM (VALUES
  ('watcher', 'all-changes',    'All Changes',    'Watch all changes',         'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('watcher', 'mentions-only',  'Mentions Only',  'Watch only mentions',       'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('watcher', 'assigned-only',  'Assigned Only',  'Watch only when assigned',  'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true),
  ('watcher', 'status-changes', 'Status Changes', 'Watch status changes only', 'system', '{"record_permissions": {"all": ["create", "read", "update", "delete"]}, "fields": {}}'::jsonb, '{}'::jsonb, true)
) AS v(kind, slug, name, description, ownership, design_schema, validation_schema, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM v2.types t WHERE t.kind = 'watcher' AND t.slug = v.slug AND t.app_id IS NULL
);

COMMIT;
