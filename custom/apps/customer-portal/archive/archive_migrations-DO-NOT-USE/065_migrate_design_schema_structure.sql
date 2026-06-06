-- Migration: Migrate existing design_schema records to new 4-node structure
-- This updates existing types to use the new record_permissions, fields, views, functionality structure

-- First, let's see what we're working with
-- SELECT id, slug, kind, design_schema FROM v2.types WHERE design_schema IS NOT NULL LIMIT 5;

-- Update existing types to new structure
UPDATE v2.types 
SET design_schema = jsonb_set(
    jsonb_set(
        jsonb_set(
            -- Start with existing design_schema
            design_schema,
            -- Ensure views node exists with default views
            '{views}',
            CASE 
                WHEN design_schema ? 'views' THEN design_schema->'views'
                ELSE jsonb_build_object(
                    'default_list', jsonb_build_object(
                        'type', 'list',
                        'display', 'table',
                        'label', 'Default List',
                        'fields', jsonb_build_object(
                            'title', jsonb_build_object('display_type', 'text', 'sortable', true),
                            'status', jsonb_build_object('display_type', 'badge', 'sortable', true),
                            'created_at', jsonb_build_object('display_type', 'timestamp', 'sortable', true)
                        ),
                        'default_sort', jsonb_build_object('field', 'created_at', 'direction', 'desc')
                    ),
                    'default_detail', jsonb_build_object(
                        'type', 'detail',
                        'label', 'Default Detail',
                        'sections', jsonb_build_array(
                            jsonb_build_object(
                                'title', 'Details',
                                'fields', jsonb_build_object(
                                    'title', jsonb_build_object('display_type', 'text'),
                                    'status', jsonb_build_object('display_type', 'badge')
                                )
                            )
                        )
                    )
                )
            END
        ),
        -- Ensure functionality node exists (empty by default)
        '{functionality}',
        CASE 
            WHEN design_schema ? 'functionality' THEN design_schema->'functionality'
            ELSE 'null'::jsonb
        END
    ),
    -- Ensure record_permissions exists
    '{record_permissions}',
    CASE 
        WHEN design_schema ? 'record_permissions' THEN design_schema->'record_permissions'
        WHEN design_schema ? 'permissions' THEN design_schema->'permissions'  -- Move old permissions node
        ELSE jsonb_build_object('admin', jsonb_build_array('create', 'read', 'update', 'delete'))
    END
)
WHERE design_schema IS NOT NULL;

-- Remove old permissions node if it exists (moved to record_permissions)
UPDATE v2.types 
SET design_schema = design_schema - 'permissions'
WHERE design_schema ? 'permissions';

-- Update fields to ensure they have required properties
UPDATE v2.types 
SET design_schema = jsonb_set(
    design_schema,
    '{fields}',
    (
        SELECT jsonb_object_agg(
            field_name,
            jsonb_build_object(
                'data_type', COALESCE((field_def->>'data_type'), 'text'),
                'label', COALESCE((field_def->>'label'), field_name),
                'required', COALESCE((field_def->>'required')::boolean, false),
                'system', COALESCE((field_def->>'system')::boolean, false),
                'validation', CASE 
                    WHEN field_def ? 'validation' THEN field_def->'validation'
                    ELSE NULL::jsonb
                END,
                'options', CASE 
                    WHEN field_def ? 'options' THEN field_def->'options'
                    WHEN field_def->>'data_type' IN ('select', 'multiselect', 'radio') THEN jsonb_build_array()
                    ELSE NULL::jsonb
                END,
                'permissions', CASE 
                    WHEN field_def ? 'permissions' THEN field_def->'permissions'
                    ELSE NULL::jsonb
                END
            )
        )
        FROM jsonb_each_text(design_schema->'fields') AS field_name
        JOIN jsonb_each(design_schema->'fields') AS field_def ON field_name.key = field_def.key
    )
)
WHERE design_schema ? 'fields';

-- Regenerate validation_schema for all types
UPDATE v2.types 
SET validation_schema = (
    SELECT jsonb_build_object(
        'fields',
        jsonb_object_agg(
            field_name,
            jsonb_build_object(
                'data_type', field_def->>'data_type',
                'required', COALESCE((field_def->>'required')::boolean, false)
            ) || 
            CASE 
                WHEN field_def ? 'validation' THEN field_def->'validation'
                ELSE '{}'::jsonb
            END ||
            CASE 
                WHEN field_def ? 'options' THEN jsonb_build_object('options', field_def->'options')
                ELSE '{}'::jsonb
            END
        )
    )
    FROM jsonb_each_text(design_schema->'fields') AS field_name
    JOIN jsonb_each(design_schema->'fields') AS field_def ON field_name.key = field_def.key
)
WHERE design_schema ? 'fields';

-- Verify the migration
SELECT 
    slug, 
    kind,
    jsonb_typeof(design_schema->'record_permissions') as has_record_permissions,
    jsonb_typeof(design_schema->'fields') as has_fields,
    jsonb_typeof(design_schema->'views') as has_views,
    jsonb_typeof(design_schema->'functionality') as has_functionality,
    jsonb_typeof(validation_schema->'fields') as has_validation_fields
FROM v2.types 
WHERE design_schema IS NOT NULL
ORDER BY kind, slug;
