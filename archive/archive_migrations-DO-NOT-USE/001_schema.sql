-- Create v2 schema for Spine v2
-- This schema is completely isolated from the public schema

-- Create the v2 schema
CREATE SCHEMA IF NOT EXISTS v2;

-- Grant usage to the service role (adjust role name as needed)
-- GRANT USAGE ON SCHEMA v2 TO service_role;
-- GRANT CREATE ON SCHEMA v2 TO service_role;

-- Set default search path for v2 operations
-- SET search_path TO v2, public;

COMMENT ON SCHEMA v2 IS 'Spine v2 schema - completely isolated from current system';
