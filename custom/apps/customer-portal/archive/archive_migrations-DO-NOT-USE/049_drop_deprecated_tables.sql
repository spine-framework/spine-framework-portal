-- Migration 049: Drop deprecated junction tables
-- Superseded by direct columns on people table:
--   people_accounts → people.account_id
--   people_roles    → people.role_id
--   account_paths   → get_account_hierarchy() function

DROP TABLE IF EXISTS v2.account_paths;
DROP TABLE IF EXISTS v2.people_accounts;
DROP TABLE IF EXISTS v2.people_roles;
