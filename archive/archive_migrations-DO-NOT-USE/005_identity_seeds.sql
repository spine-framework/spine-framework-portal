-- Seed data for identity primitives in Spine v2
-- System types for accounts and people

-- Insert system account types
INSERT INTO v2.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES 
  (
    gen_random_uuid(),
    NULL, -- system type
    'account',
    'tenant',
    'Tenant',
    'The organization operating Spine (internal staff)',
    'building',
    'blue',
    '{
      "fields": {
        "industry": {
          "type": "text",
          "label": "Industry",
          "required": false
        },
        "size": {
          "type": "select",
          "label": "Company Size",
          "required": false,
          "options": ["1-10", "11-50", "51-200", "201-1000", "1000+"]
        },
        "website": {
          "type": "url",
          "label": "Website",
          "required": false
        }
      },
      "record_permissions": {
        "admin": ["create", "read", "update", "delete"],
        "member": ["read"]
      },
      "pipeline": {
        "stages": [
          {"id": "setup", "name": "Setup", "description": "Initial configuration"},
          {"id": "active", "name": "Active", "description": "Fully operational"},
          {"id": "suspended", "name": "Suspended", "description": "Temporarily disabled"}
        ]
      }
    }'::jsonb,
    '{
      "fields": {
        "industry": {
          "data_type": "text",
          "required": false
        },
        "size": {
          "data_type": "text",
          "required": false
        },
        "website": {
          "data_type": "url",
          "required": false
        }
      }
    }'::jsonb,
    'pack',
    true
  ),
  (
    gen_random_uuid(),
    NULL, -- system type
    'account',
    'customer',
    'Customer',
    'An external client organization',
    'users',
    'green',
    '{
      "fields": {
        "industry": {
          "type": "text",
          "label": "Industry",
          "required": false
        },
        "contact_email": {
          "type": "email",
          "label": "Primary Contact Email",
          "required": true
        },
        "support_level": {
          "type": "select",
          "label": "Support Level",
          "required": true,
          "options": ["basic", "premium", "enterprise"]
        },
        "contract_start": {
          "type": "date",
          "label": "Contract Start Date",
          "required": true
        },
        "contract_end": {
          "type": "date",
          "label": "Contract End Date",
          "required": true
        }
      },
      "record_permissions": {
        "admin": ["create", "read", "update", "delete"],
        "member": ["read"]
      }
    }'::jsonb,
    '{
      "fields": {
        "industry": {
          "data_type": "text",
          "required": false
        },
        "contact_email": {
          "data_type": "email",
          "required": true
        },
        "support_level": {
          "data_type": "text",
          "required": true
        },
        "contract_start": {
          "data_type": "date",
          "required": true
        },
        "contract_end": {
          "data_type": "date",
          "required": true
        }
      }
    }'::jsonb,
    'pack',
    true
  ),
  (
    gen_random_uuid(),
    NULL, -- system type
    'account',
    'individual',
    'Individual',
    'A single-person account',
    'user',
    'purple',
    '{
      "fields": {
        "first_name": {
          "type": "text",
          "label": "First Name",
          "required": true
        },
        "last_name": {
          "type": "text",
          "label": "Last Name",
          "required": true
        },
        "use_case": {
          "type": "select",
          "label": "Primary Use Case",
          "required": false,
          "options": ["personal", "small_business", "freelance", "other"]
        }
      },
      "record_permissions": {
        "owner": ["create", "read", "update", "delete"]
      }
    }'::jsonb,
    '{
      "fields": {
        "first_name": {
          "data_type": "text",
          "required": true
        },
        "last_name": {
          "data_type": "text",
          "required": true
        },
        "use_case": {
          "data_type": "text",
          "required": false
        }
      }
    }'::jsonb,
    'pack',
    true
  );

-- Insert system person types
INSERT INTO v2.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES 
  (
    gen_random_uuid(),
    NULL, -- system type
    'person',
    'employee',
    'Employee',
    'Internal staff member',
    'briefcase',
    'blue',
    '{
      "fields": {
        "department": {
          "type": "select",
          "label": "Department",
          "required": true,
          "options": ["Engineering", "Sales", "Marketing", "Support", "HR", "Finance", "Operations"]
        },
        "employee_id": {
          "type": "text",
          "label": "Employee ID",
          "required": true
        },
        "manager_id": {
          "type": "reference",
          "label": "Manager",
          "required": false,
          "reference_type": "person"
        },
        "start_date": {
          "type": "date",
          "label": "Start Date",
          "required": true
        },
        "title": {
          "type": "text",
          "label": "Job Title",
          "required": true
        }
      },
      "permissions": {
        "admin": {
          "accounts": ["read"],
          "people": ["create", "read", "update"],
          "apps": ["read"]
        },
        "manager": {
          "people": ["read"],
          "apps": ["read"]
        },
        "employee": {
          "people": ["read"],
          "apps": ["read"]
        }
      }
    }'::jsonb,
    '{
      "fields": {
        "department": {
          "data_type": "text",
          "required": true
        },
        "employee_id": {
          "data_type": "text",
          "required": true
        },
        "manager_id": {
          "data_type": "uuid",
          "required": false
        },
        "start_date": {
          "data_type": "date",
          "required": true
        },
        "title": {
          "data_type": "text",
          "required": true
        }
      }
    }'::jsonb,
    'pack',
    true
  ),
  (
    gen_random_uuid(),
    NULL, -- system type
    'person',
    'contact',
    'Contact',
    'External contact person',
    'address-book',
    'green',
    '{
      "fields": {
        "company": {
          "type": "text",
          "label": "Company",
          "required": false
        },
        "title": {
          "type": "text",
          "label": "Title",
          "required": false
        },
        "relationship": {
          "type": "select",
          "label": "Relationship",
          "required": false,
          "options": ["customer", "prospect", "partner", "vendor", "other"]
        }
      },
      "permissions": {
        "admin": {
          "people": ["create", "read", "update", "delete"]
        },
        "member": {
          "people": ["read"]
        }
      }
    }'::jsonb,
    '{
      "fields": {
        "company": {
          "data_type": "text",
          "required": false
        },
        "title": {
          "data_type": "text",
          "required": false
        },
        "relationship": {
          "data_type": "text",
          "required": false
        }
      }
    }'::jsonb,
    'pack',
    true
  );

-- Create a default tenant account if none exists
INSERT INTO v2.accounts (id, type_id, slug, display_name, description, metadata, is_active)
SELECT 
  gen_random_uuid(),
  t.id,
  'default-tenant',
  'Default Tenant',
  'Default tenant organization for Spine v2',
  '{"is_default": true}'::jsonb,
  true
FROM v2.types t
WHERE t.kind = 'account' AND t.slug = 'tenant' AND t.app_id IS NULL
AND NOT EXISTS (SELECT 1 FROM v2.accounts a JOIN v2.types t ON a.type_id = t.id WHERE t.slug = 'tenant');
