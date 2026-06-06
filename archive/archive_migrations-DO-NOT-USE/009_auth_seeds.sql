-- Seed data for authorization in Spine v2
-- System roles that work across all apps

-- Insert system roles (app_id = null, is_system = true)
INSERT INTO v2.roles (id, app_id, slug, name, description, permissions, is_system, is_active)
VALUES 
  (
    gen_random_uuid(),
    NULL,
    'super_admin',
    'Super Admin',
    'Full system access across all accounts and apps',
    '{
      "accounts": ["create", "read", "update", "delete"],
      "people": ["create", "read", "update", "delete"],
      "apps": ["create", "read", "update", "delete"],
      "types": ["create", "read", "update", "delete"],
      "roles": ["create", "read", "update", "delete"],
      "items": ["create", "read", "update", "delete"],
      "threads": ["create", "read", "update", "delete"],
      "messages": ["create", "read", "update", "delete"],
      "pipelines": ["create", "read", "update", "delete"],
      "triggers": ["create", "read", "update", "delete"],
      "timers": ["create", "read", "update", "delete"],
      "integrations": ["create", "read", "update", "delete"],
      "embeddings": ["create", "read", "update", "delete"],
      "ai_agents": ["create", "read", "update", "delete"],
      "pending_actions": ["create", "read", "update", "delete"],
      "logs": ["read"],
      "system": ["impersonate", "introspect", "configure"]
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'account_admin',
    'Account Admin',
    'Full access within own account',
    '{
      "accounts": ["read"],
      "people": ["create", "read", "update", "delete"],
      "apps": ["create", "read", "update", "delete"],
      "types": ["create", "read", "update", "delete"],
      "roles": ["create", "read", "update", "delete"],
      "items": ["create", "read", "update", "delete"],
      "threads": ["create", "read", "update", "delete"],
      "messages": ["create", "read", "update", "delete"],
      "pipelines": ["create", "read", "update", "delete"],
      "triggers": ["create", "read", "update", "delete"],
      "timers": ["create", "read", "update", "delete"],
      "integrations": ["create", "read", "update", "delete"],
      "embeddings": ["create", "read", "update", "delete"],
      "ai_agents": ["create", "read", "update", "delete"],
      "pending_actions": ["create", "read", "update", "delete"],
      "logs": ["read"]
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'app_admin',
    'App Admin',
    'Full access to apps within account',
    '{
      "accounts": ["read"],
      "people": ["read"],
      "apps": ["create", "read", "update", "delete"],
      "types": ["create", "read", "update", "delete"],
      "roles": ["read"],
      "items": ["create", "read", "update", "delete"],
      "threads": ["create", "read", "update", "delete"],
      "messages": ["create", "read", "update", "delete"],
      "pipelines": ["create", "read", "update", "delete"],
      "triggers": ["create", "read", "update", "delete"],
      "timers": ["create", "read", "update", "delete"],
      "integrations": ["create", "read", "update", "delete"],
      "embeddings": ["create", "read", "update", "delete"],
      "ai_agents": ["create", "read", "update", "delete"],
      "pending_actions": ["create", "read", "update", "delete"],
      "logs": ["read"]
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'member',
    'Member',
    'Standard access to create and manage content',
    '{
      "accounts": ["read"],
      "people": ["read"],
      "apps": ["read"],
      "types": ["read"],
      "roles": ["read"],
      "items": ["create", "read", "update", "delete"],
      "threads": ["create", "read", "update", "delete"],
      "messages": ["create", "read", "update", "delete"],
      "pipelines": ["read"],
      "triggers": ["read"],
      "timers": ["read"],
      "integrations": ["read"],
      "embeddings": ["read"],
      "ai_agents": ["read"],
      "pending_actions": ["read"],
      "logs": ["read"]
    }'::jsonb,
    true,
    true
  ),
  (
    gen_random_uuid(),
    NULL,
    'viewer',
    'Viewer',
    'Read-only access to most content',
    '{
      "accounts": ["read"],
      "people": ["read"],
      "apps": ["read"],
      "types": ["read"],
      "roles": ["read"],
      "items": ["read"],
      "threads": ["read"],
      "messages": ["read"],
      "pipelines": ["read"],
      "triggers": ["read"],
      "timers": ["read"],
      "integrations": ["read"],
      "embeddings": ["read"],
      "ai_agents": ["read"],
      "pending_actions": ["read"],
      "logs": ["read"]
    }'::jsonb,
    true,
    true
  );

-- Create a function to add default admin to new tenant accounts
CREATE OR REPLACE FUNCTION v2.add_default_admin_to_tenant(account_id uuid)
RETURNS void AS $$
DECLARE
  admin_role_id uuid;
  person_id uuid;
BEGIN
  -- Get the account_admin role
  SELECT id INTO admin_role_id
  FROM v2.roles
  WHERE slug = 'account_admin'
  AND is_system = true
  AND is_active = true;
  
  IF admin_role_id IS NULL THEN
    RAISE EXCEPTION 'Account admin role not found';
  END IF;
  
  -- For now, we'll skip auto-creating a person
  -- The admin will need to be created and added manually
  
  -- TODO: Create a system admin person and add them
  -- This will be handled in the user provisioning phase
END;
$$ LANGUAGE plpgsql;

-- Grant super_admin role to default tenant if it exists
DO $$
DECLARE
  tenant_account_id uuid;
  super_admin_role_id uuid;
  system_person_id uuid;
BEGIN
  -- Get default tenant account
  SELECT id INTO tenant_account_id
  FROM v2.accounts
  WHERE slug = 'default-tenant'
  AND is_active = true;
  
  IF tenant_account_id IS NOT NULL THEN
    -- Get super_admin role
    SELECT id INTO super_admin_role_id
    FROM v2.roles
    WHERE slug = 'super_admin'
    AND is_system = true
    AND is_active = true;
    
    IF super_admin_role_id IS NOT NULL THEN
      -- For now, we'll create a placeholder person entry
      -- This will be replaced by actual user provisioning
      INSERT INTO v2.people (id, auth_uid, full_name, email, status, is_active)
      VALUES (
        gen_random_uuid(),
        'system-super-admin',
        'System Super Admin',
        'admin@spine.system',
        'active',
        true
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id INTO system_person_id;
      
      IF system_person_id IS NOT NULL THEN
        -- Add to tenant with super_admin role
        INSERT INTO v2.people_accounts (person_id, account_id, role_slug, is_active)
        VALUES (system_person_id, tenant_account_id, 'super_admin', true)
        ON CONFLICT (person_id, account_id) DO NOTHING;
        
        -- Grant super_admin role
        INSERT INTO v2.people_roles (person_id, account_id, role_id, is_active)
        VALUES (system_person_id, tenant_account_id, super_admin_role_id, true)
        ON CONFLICT (person_id, account_id, role_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
END $$;
