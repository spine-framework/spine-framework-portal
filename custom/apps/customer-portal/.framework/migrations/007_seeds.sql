-- Migration 007: Day-Zero Seeds
-- Minimum seeds for a working Spine v2 instance

-- ============================================
-- 1. System Role (system_admin)
-- ============================================

INSERT INTO public.roles (id, slug, name, description, permissions, is_system, is_active, is_protected, app_id, account_id)
VALUES (
  gen_random_uuid(),
  'system_admin',
  'System Admin',
  'Full system access - can manage all accounts, types, and system configuration',
  '["*"]'::jsonb,
  true,
  true,
  true,
  NULL,
  NULL
);

-- ============================================
-- 2. Master System Account
-- ============================================

INSERT INTO public.accounts (id, slug, display_name, description, data, is_active, design_schema, validation_schema, type_id)
VALUES (
  gen_random_uuid(),
  'spine-system',
  'Spine System',
  'Master system account for internal Spine operations',
  '{}'::jsonb,
  true,
  '{}'::jsonb,
  '{}'::jsonb,
  gen_random_uuid()  -- placeholder, will update after types seeded
);

-- ============================================
-- 3. System App (spine-core)
-- ============================================

INSERT INTO public.apps (id, slug, name, description, version, app_type, source, is_active, is_system)
VALUES (
  gen_random_uuid(),
  'spine-core',
  'Spine Core',
  'Core Spine runtime - provides accounts, people, items, threads, messages, links, attachments, watchers',
  '1.0.0',
  'system',
  'builtin',
  true,
  true
);

-- ============================================
-- 4. Runtime Entity Types (8 types)
-- Each with minimal design_schema: system columns + record_permissions only
-- No field-level permissions (inherited from record_permissions)
-- ============================================

-- Get the spine-core app id for foreign keys
DO $$
DECLARE
  v_spine_core_app_id uuid;
  v_system_account_id uuid;
BEGIN
  SELECT id INTO v_spine_core_app_id FROM public.apps WHERE slug = 'spine-core' LIMIT 1;
  SELECT id INTO v_system_account_id FROM public.accounts WHERE slug = 'spine-system' LIMIT 1;

  -- 4.1 accounts type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'account',
    'account',
    'Account',
    'Organization or tenant account',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'slug', jsonb_build_object('data_type', 'text', 'label', 'Slug', 'required', true, 'system', true, 'validation', null),
        'display_name', jsonb_build_object('data_type', 'text', 'label', 'Display Name', 'required', true, 'system', true, 'validation', null),
        'description', jsonb_build_object('data_type', 'textarea', 'label', 'Description', 'required', false, 'system', true, 'validation', null),
        'is_active', jsonb_build_object('data_type', 'boolean', 'label', 'Active', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Accounts',
          'fields', jsonb_build_object(
            'display_name', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'slug', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'is_active', jsonb_build_object('sortable', true, 'display_type', 'badge')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Account',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Overview', 'fields', jsonb_build_array('slug', 'display_name', 'description', 'is_active')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.2 people type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'person',
    'person',
    'Person',
    'User or contact person',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'full_name', jsonb_build_object('data_type', 'text', 'label', 'Full Name', 'required', true, 'system', true, 'validation', null),
        'email', jsonb_build_object('data_type', 'email', 'label', 'Email', 'required', true, 'system', true, 'validation', null),
        'phone', jsonb_build_object('data_type', 'phone', 'label', 'Phone', 'required', false, 'system', true, 'validation', null),
        'avatar_url', jsonb_build_object('data_type', 'url', 'label', 'Avatar URL', 'required', false, 'system', true, 'validation', null),
        'status', jsonb_build_object('data_type', 'text', 'label', 'Status', 'required', true, 'system', true, 'validation', null),
        'is_active', jsonb_build_object('data_type', 'boolean', 'label', 'Active', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'People',
          'fields', jsonb_build_object(
            'full_name', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'email', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'status', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'is_active', jsonb_build_object('sortable', true, 'display_type', 'badge')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Person',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Profile', 'fields', jsonb_build_array('full_name', 'email', 'phone', 'avatar_url')),
            jsonb_build_object('title', 'Status', 'fields', jsonb_build_array('status', 'is_active')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.3 items type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'item',
    'item',
    'Item',
    'Generic item - tickets, tasks, records',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'title', jsonb_build_object('data_type', 'text', 'label', 'Title', 'required', true, 'system', true, 'validation', null),
        'description', jsonb_build_object('data_type', 'textarea', 'label', 'Description', 'required', false, 'system', true, 'validation', null),
        'status', jsonb_build_object('data_type', 'text', 'label', 'Status', 'required', true, 'system', true, 'validation', null),
        'is_active', jsonb_build_object('data_type', 'boolean', 'label', 'Active', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Items',
          'fields', jsonb_build_object(
            'title', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'status', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'is_active', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'created_at', jsonb_build_object('sortable', true, 'display_type', 'timestamp')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Item',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Overview', 'fields', jsonb_build_array('title', 'description', 'status', 'is_active')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.4 threads type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'thread',
    'thread',
    'Thread',
    'Conversation thread',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'title', jsonb_build_object('data_type', 'text', 'label', 'Title', 'required', false, 'system', true, 'validation', null),
        'target_type', jsonb_build_object('data_type', 'text', 'label', 'Target Type', 'required', true, 'system', true, 'readonly', true, 'validation', null),
        'visibility', jsonb_build_object('data_type', 'text', 'label', 'Visibility', 'required', true, 'system', true, 'validation', null),
        'status', jsonb_build_object('data_type', 'text', 'label', 'Status', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Threads',
          'fields', jsonb_build_object(
            'title', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'target_type', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'status', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'created_at', jsonb_build_object('sortable', true, 'display_type', 'timestamp')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Thread',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Overview', 'fields', jsonb_build_array('title', 'target_type', 'visibility', 'status')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.5 messages type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'message',
    'message',
    'Message',
    'Message within a thread',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'content', jsonb_build_object('data_type', 'textarea', 'label', 'Content', 'required', true, 'system', true, 'validation', null),
        'direction', jsonb_build_object('data_type', 'text', 'label', 'Direction', 'required', true, 'system', true, 'readonly', true, 'validation', null),
        'sequence', jsonb_build_object('data_type', 'number', 'label', 'Sequence', 'required', true, 'system', true, 'readonly', true, 'validation', null),
        'visibility', jsonb_build_object('data_type', 'text', 'label', 'Visibility', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Messages',
          'fields', jsonb_build_object(
            'content', jsonb_build_object('sortable', false, 'display_type', 'text'),
            'direction', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'sequence', jsonb_build_object('sortable', true, 'display_type', 'number'),
            'created_at', jsonb_build_object('sortable', true, 'display_type', 'timestamp')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Message',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Content', 'fields', jsonb_build_array('content')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('direction', 'sequence', 'visibility', 'created_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.6 links type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'link',
    'link',
    'Link',
    'Relationship link between entities',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'link_type', jsonb_build_object('data_type', 'text', 'label', 'Link Type', 'required', false, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Links',
          'fields', jsonb_build_object(
            'link_type', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'created_at', jsonb_build_object('sortable', true, 'display_type', 'timestamp')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Link',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Relationship', 'fields', jsonb_build_array('link_type')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.7 attachments type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'attachment',
    'attachment',
    'Attachment',
    'File attachment',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'filename', jsonb_build_object('data_type', 'text', 'label', 'Filename', 'required', true, 'system', true, 'validation', null),
        'file_size', jsonb_build_object('data_type', 'number', 'label', 'File Size', 'required', false, 'system', true, 'validation', null),
        'mime_type', jsonb_build_object('data_type', 'text', 'label', 'MIME Type', 'required', false, 'system', true, 'validation', null),
        'storage_path', jsonb_build_object('data_type', 'text', 'label', 'Storage Path', 'required', false, 'system', true, 'validation', null),
        'storage_provider', jsonb_build_object('data_type', 'text', 'label', 'Provider', 'required', false, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Uploaded', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Attachments',
          'fields', jsonb_build_object(
            'filename', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'file_size', jsonb_build_object('sortable', true, 'display_type', 'number'),
            'mime_type', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'created_at', jsonb_build_object('sortable', true, 'display_type', 'timestamp')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Attachment',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'File', 'fields', jsonb_build_array('filename', 'file_size', 'mime_type', 'storage_path', 'storage_provider')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- 4.8 watchers type
  INSERT INTO public.types (id, app_id, kind, slug, name, description, design_schema, validation_schema, ownership, is_active)
  VALUES (
    gen_random_uuid(),
    v_spine_core_app_id,
    'watcher',
    'watcher',
    'Watcher',
    'Entity watcher subscription',
    jsonb_build_object(
      'scope', 'account',
      'record_permissions', jsonb_build_object('system_admin', ARRAY['create', 'read', 'update', 'delete']),
      'fields', jsonb_build_object(
        'target_type', jsonb_build_object('data_type', 'text', 'label', 'Target Type', 'required', true, 'system', true, 'validation', null),
        'watch_type', jsonb_build_object('data_type', 'text', 'label', 'Watch Type', 'required', false, 'system', true, 'validation', null),
        'notification_level', jsonb_build_object('data_type', 'text', 'label', 'Notification Level', 'required', true, 'system', true, 'validation', null),
        'is_active', jsonb_build_object('data_type', 'boolean', 'label', 'Active', 'required', true, 'system', true, 'validation', null),
        'created_at', jsonb_build_object('data_type', 'datetime', 'label', 'Created', 'required', false, 'system', true, 'readonly', true, 'validation', null),
        'updated_at', jsonb_build_object('data_type', 'datetime', 'label', 'Updated', 'required', false, 'system', true, 'readonly', true, 'validation', null)
      ),
      'views', jsonb_build_object(
        'default_list', jsonb_build_object('type', 'list', 'display', 'table', 'label', 'Watchers',
          'fields', jsonb_build_object(
            'target_type', jsonb_build_object('sortable', true, 'display_type', 'text'),
            'watch_type', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'notification_level', jsonb_build_object('sortable', true, 'display_type', 'badge'),
            'is_active', jsonb_build_object('sortable', true, 'display_type', 'badge')
          )
        ),
        'default_detail', jsonb_build_object('type', 'detail', 'label', 'Watcher',
          'sections', jsonb_build_array(
            jsonb_build_object('title', 'Watch Settings', 'fields', jsonb_build_array('target_type', 'watch_type', 'notification_level', 'is_active')),
            jsonb_build_object('title', 'Metadata', 'fields', jsonb_build_array('created_at', 'updated_at'))
          )
        )
      )
    ),
    '{}'::jsonb,
    'pack',
    true
  );

  -- Update system account's type_id to point to the accounts type
  UPDATE public.accounts SET type_id = (SELECT id FROM public.types WHERE kind = 'account' AND slug = 'account' LIMIT 1)
  WHERE slug = 'spine-system';

  -- Copy design_schema from types to runtime entity records
  -- This ensures list views work correctly for runtime entities
  UPDATE public.accounts a
  SET design_schema = t.design_schema
  FROM public.types t
  WHERE a.type_id = t.id;

  UPDATE public.people p
  SET design_schema = t.design_schema
  FROM public.types t
  WHERE p.type_id = t.id;

END $$;

-- ============================================
-- 5. System-Level Configs (Hybrid Ownership Pattern)
-- Available to all tenants, created by dev
-- ============================================

-- 5.1 System Prompt Config: Default Assistant
INSERT INTO public.prompt_configs (
  id, app_id, account_id, name, slug, system_prompt, model, temperature, max_tokens,
  is_multi_turn, max_history_messages, ownership, is_system, is_active, metadata
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'spine-core' LIMIT 1),
  NULL,  -- No account_id = system-level
  'Default Assistant',
  'default-assistant',
  'You are a helpful AI assistant. Be concise, accurate, and professional in your responses.',
  'gpt-4o-mini',
  0.7,
  4000,
  true,
  20,
  'system',
  true,
  true,
  jsonb_build_object('description', 'General-purpose assistant for common tasks')
);

-- 5.2 System AI Agent: Support Helper
INSERT INTO public.ai_agents (
  id, app_id, account_id, name, description, agent_type, model_config,
  system_prompt, tools, capabilities, ownership, is_system, is_active
)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'spine-core' LIMIT 1),
  NULL,  -- No account_id = system-level
  'Support Helper',
  'AI agent for handling common support inquiries and routing tickets',
  'chat',
  jsonb_build_object('model', 'gpt-4o', 'temperature', 0.5, 'max_tokens', 2000),
  'You are a support assistant. Help users with common questions, troubleshoot basic issues, and escalate complex problems to human agents. Always be polite and empathetic.',
  jsonb_build_array('search_knowledge_base', 'create_ticket', 'escalate_to_human'),
  jsonb_build_array('natural_language_understanding', 'sentiment_analysis', 'intent_classification'),
  'system',
  true,
  true
);

-- 5.3 System Action: Send Notification
INSERT INTO public.actions (
  id, account_id, name, slug, description, handler, handler_module, config,
  input_schema, output_schema, ownership, is_system, is_active, timeout_seconds, retry_count
)
VALUES (
  gen_random_uuid(),
  NULL,  -- No account_id = system-level
  'Send Notification',
  'send-notification',
  'Send email or in-app notification to users',
  'send_notification',
  'functions',
  jsonb_build_object(
    'channels', jsonb_build_array('email', 'in_app', 'sms'),
    'default_priority', 'normal',
    'rate_limit_per_minute', 60
  ),
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('recipient_id', 'subject', 'message'),
    'properties', jsonb_build_object(
      'recipient_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
      'subject', jsonb_build_object('type', 'string', 'maxLength', 200),
      'message', jsonb_build_object('type', 'string', 'maxLength', 5000),
      'channel', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('email', 'in_app', 'sms')),
      'priority', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('low', 'normal', 'high', 'urgent'))
    )
  ),
  jsonb_build_object(
    'type', 'object',
    'properties', jsonb_build_object(
      'message_id', jsonb_build_object('type', 'string', 'format', 'uuid'),
      'sent_at', jsonb_build_object('type', 'string', 'format', 'date-time'),
      'channel_used', jsonb_build_object('type', 'string'),
      'status', jsonb_build_object('type', 'string')
    )
  ),
  'system',
  true,
  true,
  30,
  2
);
