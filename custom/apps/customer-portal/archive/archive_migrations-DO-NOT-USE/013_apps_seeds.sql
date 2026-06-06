-- Seed data for apps in Spine v2
-- System apps that are available to all accounts

-- Insert system apps
INSERT INTO v2.apps (id, slug, name, description, icon, color, version, app_type, source, is_system, config, nav_items, min_role, integration_deps, metadata, is_active)
VALUES 
  (
    gen_random_uuid(),
    'admin',
    'Admin',
    'System administration interface',
    'shield',
    'red',
    '1.0.0',
    'system',
    'pack',
    true,
    '{
      "features": ["accounts", "people", "types", "apps", "roles", "integrations"],
      "ui": {
        "theme": "system",
        "layout": "sidebar"
      }
    }'::jsonb,
    '[
      {
        "id": "accounts",
        "label": "Accounts",
        "icon": "building",
        "path": "/admin/accounts",
        "min_role": "admin"
      },
      {
        "id": "people",
        "label": "People",
        "icon": "users",
        "path": "/admin/people",
        "min_role": "admin"
      },
      {
        "id": "types",
        "label": "Types",
        "icon": "shapes",
        "path": "/admin/types",
        "min_role": "admin"
      },
      {
        "id": "apps",
        "label": "Apps",
        "icon": "grid",
        "path": "/admin/apps",
        "min_role": "admin"
      },
      {
        "id": "roles",
        "label": "Roles",
        "icon": "key",
        "path": "/admin/roles",
        "min_role": "admin"
      },
      {
        "id": "integrations",
        "label": "Integrations",
        "icon": "plug",
        "path": "/admin/integrations",
        "min_role": "admin"
      }
    ]'::jsonb,
    'admin',
    '[]'::jsonb,
    '{"category": "system", "core": true}'::jsonb,
    true
  ),
  (
    gen_random_uuid(),
    'items',
    'Items',
    'Generic item management system',
    'box',
    'blue',
    '1.0.0',
    'system',
    'pack',
    true,
    '{
      "features": ["create", "read", "update", "delete", "search", "filter"],
      "ui": {
        "views": ["list", "board", "detail"],
        "default_view": "list"
      }
    }'::jsonb,
    '[
      {
        "id": "items",
        "label": "Items",
        "icon": "box",
        "path": "/items",
        "min_role": "member"
      },
      {
        "id": "item-detail",
        "label": "Item Detail",
        "icon": "file",
        "path": "/items/:id",
        "min_role": "member"
      }
    ]'::jsonb,
    'member',
    '[]'::jsonb,
    '{"category": "core", "core": true}'::jsonb,
    true
  ),
  (
    gen_random_uuid(),
    'threads',
    'Threads',
    'Conversation and messaging system',
    'message-circle',
    'green',
    '1.0.0',
    'system',
    'pack',
    true,
    '{
      "features": ["create", "read", "update", "delete", "reply"],
      "ui": {
        "views": ["thread", "inbox"],
        "default_view": "thread"
      }
    }'::jsonb,
    '[
      {
        "id": "threads",
        "label": "Threads",
        "icon": "message-circle",
        "path": "/threads",
        "min_role": "member"
      },
      {
        "id": "thread-detail",
        "label": "Thread",
        "icon": "message-square",
        "path": "/threads/:id",
        "min_role": "member"
      }
    ]'::jsonb,
    'member',
    '[]'::jsonb,
    '{"category": "core", "core": true}'::jsonb,
    true
  ),
  (
    gen_random_uuid(),
    'automations',
    'Automations',
    'Workflow automation system',
    'zap',
    'purple',
    '1.0.0',
    'system',
    'pack',
    true,
    '{
      "features": ["pipelines", "triggers", "timers"],
      "ui": {
        "views": ["pipeline-editor", "trigger-editor", "timer-editor"]
      }
    }'::jsonb,
    '[
      {
        "id": "pipelines",
        "label": "Pipelines",
        "icon": "git-branch",
        "path": "/automations/pipelines",
        "min_role": "app_admin"
      },
      {
        "id": "triggers",
        "label": "Triggers",
        "icon": "bell",
        "path": "/automations/triggers",
        "min_role": "app_admin"
      },
      {
        "id": "timers",
        "label": "Timers",
        "icon": "clock",
        "path": "/automations/timers",
        "min_role": "app_admin"
      }
    ]'::jsonb,
    'app_admin',
    '[]'::jsonb,
    '{"category": "automation", "core": true}'::jsonb,
    true
  ),
  (
    gen_random_uuid(),
    'ai',
    'AI Assistant',
    'AI-powered features and agents',
    'cpu',
    'indigo',
    '1.0.0',
    'system',
    'pack',
    true,
    '{
      "features": ["agents", "prompt-configs", "retrieval"],
      "ui": {
        "views": ["agent-editor", "prompt-editor", "retrieval-config"]
      }
    }'::jsonb,
    '[
      {
        "id": "agents",
        "label": "AI Agents",
        "icon": "bot",
        "path": "/ai/agents",
        "min_role": "app_admin"
      },
      {
        "id": "prompt-configs",
        "label": "Prompt Configs",
        "icon": "file-text",
        "path": "/ai/prompts",
        "min_role": "app_admin"
      },
      {
        "id": "retrieval",
        "label": "Knowledge Retrieval",
        "icon": "search",
        "path": "/ai/retrieval",
        "min_role": "app_admin"
      }
    ]'::jsonb,
    'app_admin',
    '[]'::jsonb,
    '{"category": "ai", "core": true}'::jsonb,
    true
  );

-- Create a function to auto-install system apps for new accounts
CREATE OR REPLACE FUNCTION v2.install_system_apps_for_account(account_id uuid)
RETURNS void AS $$
DECLARE
  app_record RECORD;
BEGIN
  -- Install all active system apps
  FOR app_record IN 
    SELECT id FROM v2.apps 
    WHERE is_system = true 
    AND is_active = true
  LOOP
    INSERT INTO v2.apps_accounts (app_id, account_id, status, activated_at)
    VALUES (app_record.id, account_id, 'activated', now())
    ON CONFLICT (app_id, account_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Install system apps for default tenant if it exists
DO $$
DECLARE
  tenant_account_id uuid;
BEGIN
  SELECT id INTO tenant_account_id
  FROM v2.accounts
  WHERE slug = 'default-tenant'
  AND is_active = true;
  
  IF tenant_account_id IS NOT NULL THEN
    PERFORM v2.install_system_apps_for_account(tenant_account_id);
  END IF;
END $$;
