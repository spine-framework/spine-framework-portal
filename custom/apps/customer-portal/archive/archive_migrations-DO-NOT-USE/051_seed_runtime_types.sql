-- Migration 051: Seed Runtime Types
-- Creates default types for threads, messages, links, attachments, watchers
-- And updates existing item types to proper format

-- ============================================
-- THREAD TYPES
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active) VALUES
('thread', 'discussion', 'Discussion', 'General discussion thread', '{}', '{"fields": []}', true),
('thread', 'support', 'Support', 'Customer support thread', '{}', '{"fields": []}', true),
('thread', 'notification', 'Notification', 'System notification thread', '{}', '{"fields": []}', true),
('thread', 'ai-chat', 'AI Chat', 'AI-assisted conversation', '{}', '{"fields": []}', true)
ON CONFLICT (kind, slug) DO NOTHING;

-- ============================================
-- MESSAGE TYPES
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active) VALUES
('message', 'comment', 'Comment', 'User comment or reply', '{}', '{"fields": []}', true),
('message', 'system', 'System', 'System-generated message', '{}', '{"fields": []}', true),
('message', 'ai-generated', 'AI Generated', 'AI-generated response', '{}', '{"fields": []}', true),
('message', 'notification', 'Notification', 'Notification message', '{}', '{"fields": []}', true)
ON CONFLICT (kind, slug) DO NOTHING;

-- ============================================
-- LINK TYPES
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active) VALUES
('link', 'related-to', 'Related To', 'Generic relationship', '{}', '{"fields": []}', true),
('link', 'depends-on', 'Depends On', 'Dependency relationship', '{}', '{"fields": []}', true),
('link', 'blocks', 'Blocks', 'Blocking relationship', '{}', '{"fields": []}', true),
('link', 'references', 'References', 'Reference/citation', '{}', '{"fields": []}', true),
('link', 'parent-of', 'Parent Of', 'Hierarchical parent', '{}', '{"fields": []}', true),
('link', 'child-of', 'Child Of', 'Hierarchical child', '{}', '{"fields": []}', true)
ON CONFLICT (kind, slug) DO NOTHING;

-- ============================================
-- ATTACHMENT TYPES
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active) VALUES
('attachment', 'document', 'Document', 'Document file (PDF, DOC, etc)', '{}', '{"fields": []}', true),
('attachment', 'image', 'Image', 'Image file (JPG, PNG, etc)', '{}', '{"fields": []}', true),
('attachment', 'video', 'Video', 'Video file (MP4, MOV, etc)', '{}', '{"fields": []}', true),
('attachment', 'audio', 'Audio', 'Audio file (MP3, WAV, etc)', '{}', '{"fields": []}', true),
('attachment', 'code', 'Code', 'Source code file', '{}', '{"fields": []}', true),
('attachment', 'spreadsheet', 'Spreadsheet', 'Spreadsheet file (XLS, CSV)', '{}', '{"fields": []}', true),
('attachment', 'archive', 'Archive', 'Archive file (ZIP, TAR)', '{}', '{"fields": []}', true),
('attachment', 'other', 'Other', 'Other file type', '{}', '{"fields": []}', true)
ON CONFLICT (kind, slug) DO NOTHING;

-- ============================================
-- WATCHER TYPES
-- ============================================

INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active) VALUES
('watcher', 'all-changes', 'All Changes', 'Watch all changes', '{}', '{"fields": []}', true),
('watcher', 'mentions-only', 'Mentions Only', 'Watch only mentions', '{}', '{"fields": []}', true),
('watcher', 'assigned-only', 'Assigned Only', 'Watch only when assigned', '{}', '{"fields": []}', true),
('watcher', 'status-changes', 'Status Changes', 'Watch status changes only', '{}', '{"fields": []}', true)
ON CONFLICT (kind, slug) DO NOTHING;

-- ============================================
-- Migrate existing items to use type_id
-- ============================================

-- First, ensure we have types for existing item kinds
INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active)
SELECT DISTINCT 'item', item_type, item_type, 'Auto-migrated item type', '{}', '{"fields": []}', true
FROM v2.items
WHERE item_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM v2.types 
    WHERE kind = 'item' AND slug = v2.items.item_type
  );

-- Then update items to set type_id based on item_type
UPDATE v2.items i
SET type_id = t.id
FROM v2.types t
WHERE i.item_type = t.slug
  AND t.kind = 'item'
  AND i.type_id IS NULL;

-- ============================================
-- Migrate existing links to use type_id
-- ============================================

-- Create types for existing link_type values
INSERT INTO v2.types (kind, slug, name, description, validation_schema, design_schema, is_active)
SELECT DISTINCT 'link', link_type, link_type, 'Auto-migrated link type', '{}', '{"fields": []}', true
FROM v2.links
WHERE link_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM v2.types 
    WHERE kind = 'link' AND slug = v2.links.link_type
  );

-- Update links to set type_id based on link_type
UPDATE v2.links l
SET type_id = t.id
FROM v2.types t
WHERE l.link_type = t.slug
  AND t.kind = 'link'
  AND l.type_id IS NULL;

-- ============================================
-- Set default types for existing records
-- ============================================

-- Set default thread type for existing threads
UPDATE v2.threads
SET type_id = (SELECT id FROM v2.types WHERE kind = 'thread' AND slug = 'discussion' LIMIT 1)
WHERE type_id IS NULL;

-- Set default message type for existing messages
UPDATE v2.messages
SET type_id = (SELECT id FROM v2.types WHERE kind = 'message' AND slug = 'comment' LIMIT 1)
WHERE type_id IS NULL;

-- Set default attachment type for existing attachments
UPDATE v2.attachments
SET type_id = (SELECT id FROM v2.types WHERE kind = 'attachment' AND slug = 'document' LIMIT 1)
WHERE type_id IS NULL;

-- Set default watcher type for existing watchers
UPDATE v2.watchers
SET type_id = (SELECT id FROM v2.types WHERE kind = 'watcher' AND slug = 'all-changes' LIMIT 1)
WHERE type_id IS NULL;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE v2.types IS 'Type definitions for all runtime entities including threads, messages, links, attachments, watchers';
