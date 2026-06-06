-- Migration 013: Funnel Intelligence Layer
-- Creates item types, triggers, and pipelines for Cortex Intelligence Layer

-- ============================================
-- 1. Funnel Signal Item Type
-- ============================================

INSERT INTO public.types (
  id,
  app_id,
  slug,
  name,
  description,
  kind,
  design_schema,
  validation_schema,
  ownership,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'spine-core' LIMIT 1),
  'funnel_signal',
  'Funnel Signal',
  'Funnel activity signal for lead scoring and lifecycle tracking',
  'item',
  '{
    "scope": "platform",
    "views": {
      "default_list": {
        "type": "list",
        "label": "Funnel Signals",
        "fields": {
          "signal_type": {"sortable": true, "display_type": "badge"},
          "score_delta": {"sortable": true, "display_type": "number"},
          "occurred_at": {"sortable": true, "display_type": "timestamp"},
          "status": {"sortable": true, "display_type": "badge"}
        },
        "display": "table",
        "default_sort": {"field": "occurred_at", "direction": "desc"}
      },
      "default_detail": {
        "type": "detail",
        "label": "Funnel Signal",
        "sections": [
          {"title": "Signal Details", "fields": ["signal_type", "source", "score_delta", "occurred_at"]},
          {"title": "Identity", "fields": ["anonymous_id", "session_id", "account_id", "person_id"]},
          {"title": "Metadata", "fields": ["metadata", "created_at", "updated_at"]}
        ]
      }
    },
    "fields": {
      "signal_type": {
        "label": "Signal Type",
        "required": true,
        "data_type": "text",
        "options": ["docs_view", "pricing_visit", "portal_account_created", "spine_install_registered", "marketplace_app_installed", "support_question_asked", "course_started", "course_completed"]
      },
      "source": {
        "label": "Source",
        "required": false,
        "data_type": "text"
      },
      "anonymous_id": {
        "label": "Anonymous ID",
        "required": false,
        "data_type": "text"
      },
      "session_id": {
        "label": "Session ID",
        "required": false,
        "data_type": "text"
      },
      "account_id": {
        "label": "Account ID",
        "required": false,
        "data_type": "uuid"
      },
      "person_id": {
        "label": "Person ID",
        "required": false,
        "data_type": "uuid"
      },
      "related_item_id": {
        "label": "Related Item ID",
        "required": false,
        "data_type": "uuid"
      },
      "metadata": {
        "label": "Metadata",
        "required": false,
        "data_type": "jsonb"
      },
      "score_delta": {
        "label": "Score Delta",
        "required": true,
        "data_type": "integer",
        "default": 0
      },
      "occurred_at": {
        "label": "Occurred At",
        "required": true,
        "data_type": "datetime"
      }
    },
    "record_permissions": {
      "system_admin": ["create", "read", "update", "delete"],
      "support": ["create", "read", "update"],
      "member": ["read"]
    }
  }'::jsonb,
  '{
    "category": "funnel_intelligence",
    "workflow": "signal_processing",
    "scoring_enabled": true,
    "lifecycle_tracking": true
  }'::jsonb,
  'tenant',
  true,
  now(),
  now()
);

-- ============================================
-- 2. Add lead_score and lifecycle_stage to Account Type
-- ============================================

-- First, get the account type ID and extend its design_schema
DO $$
DECLARE
  account_type_id UUID;
  current_design_schema JSONB;
BEGIN
  SELECT id, design_schema INTO account_type_id, current_design_schema FROM public.types WHERE slug = 'account' AND kind = 'account' LIMIT 1;
  
  IF account_type_id IS NOT NULL THEN
    UPDATE public.types 
    SET design_schema = jsonb_set(
      jsonb_set(
        current_design_schema,
        '{fields,lead_score}',
        '{
          "label": "Lead Score",
          "required": false,
          "data_type": "integer",
          "default": 0
        }'::jsonb
      ),
      '{fields,lifecycle_stage}',
      '{
        "label": "Lifecycle Stage",
        "required": false,
        "data_type": "text",
        "options": ["anonymous", "identified_lead", "engaged_lead", "product_qualified_lead", "sales_qualified_lead", "customer", "churned"],
        "default": "anonymous"
      }'::jsonb
    )
    WHERE id = account_type_id;
  END IF;
END $$;

-- ============================================
-- 3. Create Activity Log Item Type
-- ============================================

INSERT INTO public.types (
  id,
  app_id,
  slug,
  name,
  description,
  kind,
  design_schema,
  validation_schema,
  ownership,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'spine-core' LIMIT 1),
  'activity_log',
  'Activity Log',
  'Audit log for funnel intelligence activities',
  'item',
  '{
    "scope": "platform",
    "views": {
      "default_list": {
        "type": "list",
        "label": "Activity Logs",
        "fields": {
          "action": {"sortable": true, "display_type": "badge"},
          "account_id": {"sortable": true, "display_type": "text"},
          "created_at": {"sortable": true, "display_type": "timestamp"}
        },
        "display": "table",
        "default_sort": {"field": "created_at", "direction": "desc"}
      }
    },
    "fields": {
      "action": {
        "label": "Action",
        "required": true,
        "data_type": "text",
        "options": ["lead_score_updated", "lifecycle_stage_changed", "signal_processed", "task_created"]
      },
      "account_id": {
        "label": "Account ID",
        "required": false,
        "data_type": "uuid"
      },
      "person_id": {
        "label": "Person ID",
        "required": false,
        "data_type": "uuid"
      },
      "signal_type": {
        "label": "Signal Type",
        "required": false,
        "data_type": "text"
      },
      "score_delta": {
        "label": "Score Delta",
        "required": false,
        "data_type": "integer"
      },
      "new_score": {
        "label": "New Score",
        "required": false,
        "data_type": "integer"
      },
      "new_stage": {
        "label": "New Stage",
        "required": false,
        "data_type": "text"
      }
    },
    "record_permissions": {
      "system_admin": ["create", "read", "update", "delete"],
      "support": ["create", "read", "update"],
      "member": ["read"]
    }
  }'::jsonb,
  '{
    "category": "audit",
    "workflow": "logging",
    "auto_generated": true
  }'::jsonb,
  'tenant',
  true,
  now(),
  now()
);

-- ============================================
-- 4. Create Task Item Type
-- ============================================

INSERT INTO public.types (
  id,
  app_id,
  slug,
  name,
  description,
  kind,
  design_schema,
  validation_schema,
  ownership,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.apps WHERE slug = 'spine-core' LIMIT 1),
  'task',
  'Task',
  'Task or action item for follow-up and tracking',
  'item',
  '{
    "scope": "platform",
    "views": {
      "default_list": {
        "type": "list",
        "label": "Tasks",
        "fields": {
          "task_type": {"sortable": true, "display_type": "badge"},
          "priority": {"sortable": true, "display_type": "badge"},
          "status": {"sortable": true, "display_type": "badge"},
          "due_date": {"sortable": true, "display_type": "timestamp"}
        },
        "display": "table",
        "default_sort": {"field": "created_at", "direction": "desc"}
      },
      "default_detail": {
        "type": "detail",
        "label": "Task",
        "sections": [
          {"title": "Task Details", "fields": ["task_type", "priority", "description", "due_date"]},
          {"title": "Assignment", "fields": ["account_id", "person_id"]},
          {"title": "Metadata", "fields": ["status", "created_at", "updated_at"]}
        ]
      }
    },
    "fields": {
      "task_type": {
        "label": "Task Type",
        "required": true,
        "data_type": "text",
        "options": ["lead_review", "customer_followup", "support_escalation", "health_check"]
      },
      "priority": {
        "label": "Priority",
        "required": true,
        "data_type": "text",
        "options": ["low", "medium", "high", "urgent"],
        "default": "medium"
      },
      "account_id": {
        "label": "Account ID",
        "required": false,
        "data_type": "uuid"
      },
      "person_id": {
        "label": "Person ID",
        "required": false,
        "data_type": "uuid"
      },
      "description": {
        "label": "Description",
        "required": true,
        "data_type": "textarea"
      },
      "due_date": {
        "label": "Due Date",
        "required": false,
        "data_type": "datetime"
      }
    },
    "record_permissions": {
      "system_admin": ["create", "read", "update", "delete"],
      "support": ["create", "read", "update"],
      "member": ["read"]
    }
  }'::jsonb,
  '{
    "category": "task_management",
    "workflow": "task_lifecycle",
    "automation_enabled": true
  }'::jsonb,
  'tenant',
  true,
  now(),
  now()
);
