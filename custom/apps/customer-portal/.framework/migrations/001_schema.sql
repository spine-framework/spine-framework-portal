-- Day-Zero Migration 001: Schema
-- Spine v2 day-zero for public schema
-- Note: db.ts must be updated to schema: 'public' before using this migration

-- public schema already exists in PostgreSQL, no CREATE SCHEMA needed
COMMENT ON SCHEMA public IS 'Spine v2 day-zero schema - clean foundation for runtime entities';
