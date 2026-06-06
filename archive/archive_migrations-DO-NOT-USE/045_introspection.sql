-- Introspection system for Spine v2
-- Self-describing API and schema metadata

CREATE TABLE v2.schema_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('table', 'view', 'function', 'procedure', 'trigger', 'index', 'constraint')),
  object_name text NOT NULL,
  object_schema text NOT NULL DEFAULT 'v2',
  display_name text,
  description text,
  object_definition jsonb DEFAULT '{}',
  field_definitions jsonb DEFAULT '[]',
  relationships jsonb DEFAULT '[]',
  permissions jsonb DEFAULT '{}',
  tags jsonb DEFAULT '[]',
  is_public boolean NOT NULL DEFAULT true,
  is_deprecated boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (schema_name IS NOT NULL),
  CHECK (object_type IS NOT NULL),
  CHECK (object_name IS NOT NULL),
  UNIQUE(schema_name, object_type, object_name)
);

-- Indexes
CREATE INDEX idx_schema_metadata_schema_name ON v2.schema_metadata(schema_name);
CREATE INDEX idx_schema_metadata_object_type ON v2.schema_metadata(object_type);
CREATE INDEX idx_schema_metadata_object_name ON v2.schema_metadata(object_name);
CREATE INDEX idx_schema_metadata_public ON v2.schema_metadata(is_public);
CREATE INDEX idx_schema_metadata_deprecated ON v2.schema_metadata(is_deprecated);
CREATE INDEX idx_schema_metadata_created_by ON v2.schema_metadata(created_by);
CREATE INDEX idx_schema_metadata_account ON v2.schema_metadata(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_schema_metadata_object_definition_gin ON v2.schema_metadata USING gin(object_definition);
CREATE INDEX idx_schema_metadata_field_definitions_gin ON v2.schema_metadata USING gin(field_definitions);
CREATE INDEX idx_schema_metadata_relationships_gin ON v2.schema_metadata USING gin(relationships);
CREATE INDEX idx_schema_metadata_permissions_gin ON v2.schema_metadata USING gin(permissions);
CREATE INDEX idx_schema_metadata_tags_gin ON v2.schema_metadata USING gin(tags);

-- API Endpoints table
CREATE TABLE v2.api_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')),
  handler_function text NOT NULL,
  display_name text,
  description text,
  parameters jsonb DEFAULT '[]',
  request_schema jsonb DEFAULT '{}',
  response_schema jsonb DEFAULT '{}',
  error_responses jsonb DEFAULT '[]',
  authentication_required boolean NOT NULL DEFAULT true,
  required_permissions jsonb DEFAULT '[]',
  rate_limit integer DEFAULT 1000,
  is_public boolean NOT NULL DEFAULT false,
  is_deprecated boolean NOT NULL DEFAULT false,
  version text DEFAULT 'v1',
  tags jsonb DEFAULT '[]',
  examples jsonb DEFAULT '[]',
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (path IS NOT NULL),
  CHECK (method IS NOT NULL),
  CHECK (handler_function IS NOT NULL),
  UNIQUE(path, method, version)
);

-- Indexes for api_endpoints
CREATE INDEX idx_api_endpoints_path ON v2.api_endpoints(path);
CREATE INDEX idx_api_endpoints_method ON v2.api_endpoints(method);
CREATE INDEX idx_api_endpoints_handler ON v2.api_endpoints(handler_function);
CREATE INDEX idx_api_endpoints_auth_required ON v2.api_endpoints(authentication_required);
CREATE INDEX idx_api_endpoints_public ON v2.api_endpoints(is_public);
CREATE INDEX idx_api_endpoints_deprecated ON v2.api_endpoints(is_deprecated);
CREATE INDEX idx_api_endpoints_version ON v2.api_endpoints(version);
CREATE INDEX idx_api_endpoints_created_by ON v2.api_endpoints(created_by);
CREATE INDEX idx_api_endpoints_account ON v2.api_endpoints(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_api_endpoints_parameters_gin ON v2.api_endpoints USING gin(parameters);
CREATE INDEX idx_api_endpoints_request_schema_gin ON v2.api_endpoints USING gin(request_schema);
CREATE INDEX idx_api_endpoints_response_schema_gin ON v2.api_endpoints USING gin(response_schema);
CREATE INDEX idx_api_endpoints_permissions_gin ON v2.api_endpoints USING gin(required_permissions);
CREATE INDEX idx_api_endpoints_tags_gin ON v2.api_endpoints USING gin(tags);

-- Function to update schema metadata
CREATE OR REPLACE FUNCTION v2.update_schema_metadata(
  schema_name text,
  object_type text,
  object_name text,
  display_name text DEFAULT NULL,
  description text DEFAULT NULL,
  object_definition jsonb DEFAULT NULL,
  field_definitions jsonb DEFAULT NULL,
  relationships jsonb DEFAULT NULL,
  permissions jsonb DEFAULT NULL,
  tags jsonb DEFAULT NULL,
  is_public boolean DEFAULT NULL,
  is_deprecated boolean DEFAULT NULL,
  metadata jsonb DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE v2.schema_metadata
  SET 
    display_name = COALESCE(update_schema_metadata.display_name, display_name),
    description = COALESCE(update_schema_metadata.description, description),
    object_definition = COALESCE(update_schema_metadata.object_definition, object_definition),
    field_definitions = COALESCE(update_schema_metadata.field_definitions, field_definitions),
    relationships = COALESCE(update_schema_metadata.relationships, relationships),
    permissions = COALESCE(update_schema_metadata.permissions, permissions),
    tags = COALESCE(update_schema_metadata.tags, tags),
    is_public = COALESCE(update_schema_metadata.is_public, is_public),
    is_deprecated = COALESCE(update_schema_metadata.is_deprecated, is_deprecated),
    metadata = COALESCE(update_schema_metadata.metadata, metadata),
    updated_at = now()
  WHERE schema_name = update_schema_metadata.schema_name
  AND object_type = update_schema_metadata.object_type
  AND object_name = update_schema_metadata.object_name;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get schema metadata
CREATE OR REPLACE FUNCTION v2_get_schema_metadata(
  schema_name text DEFAULT NULL,
  object_type text DEFAULT NULL,
  object_name text DEFAULT NULL,
  include_deprecated boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  schema_name text,
  object_type text,
  object_name text,
  display_name text,
  description text,
  object_definition jsonb,
  field_definitions jsonb,
  relationships jsonb,
  permissions jsonb,
  tags jsonb,
  is_public boolean,
  is_deprecated boolean,
  updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sm.id,
    sm.schema_name,
    sm.object_type,
    sm.object_name,
    sm.display_name,
    sm.description,
    sm.object_definition,
    sm.field_definitions,
    sm.relationships,
    sm.permissions,
    sm.tags,
    sm.is_public,
    sm.is_deprecated,
    sm.updated_at
  FROM v2.schema_metadata sm
  WHERE (schema_name IS NULL OR sm.schema_name = v2_get_schema_metadata.schema_name)
  AND (object_type IS NULL OR sm.object_type = v2_get_schema_metadata.object_type)
  AND (object_name IS NULL OR sm.object_name = v2_get_schema_metadata.object_name)
  AND (include_deprecated = true OR sm.is_deprecated = false)
  AND sm.is_public = true
  ORDER BY sm.schema_name, sm.object_type, sm.object_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get API endpoints
CREATE OR REPLACE FUNCTION v2_get_api_endpoints(
  path text DEFAULT NULL,
  method text DEFAULT NULL,
  handler_function text DEFAULT NULL,
  include_deprecated boolean DEFAULT false,
  include_private boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  path text,
  method text,
  handler_function text,
  display_name text,
  description text,
  parameters jsonb,
  request_schema jsonb,
  response_schema jsonb,
  authentication_required boolean,
  required_permissions jsonb,
  rate_limit integer,
  is_public boolean,
  is_deprecated boolean,
  version text,
  tags jsonb,
  examples jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ae.id,
    ae.path,
    ae.method,
    ae.handler_function,
    ae.display_name,
    ae.description,
    ae.parameters,
    ae.request_schema,
    ae.response_schema,
    ae.authentication_required,
    ae.required_permissions,
    ae.rate_limit,
    ae.is_public,
    ae.is_deprecated,
    ae.version,
    ae.tags,
    ae.examples
  FROM v2.api_endpoints ae
  WHERE (path IS NULL OR ae.path = v2_get_api_endpoints.path)
  AND (method IS NULL OR ae.method = v2_get_api_endpoints.method)
  AND (handler_function IS NULL OR ae.handler_function = v2_get_api_endpoints.handler_function)
  AND (include_deprecated = true OR ae.is_deprecated = false)
  AND (include_private = true OR ae.is_public = true)
  ORDER BY ae.path, ae.method;
END;
$$ LANGUAGE plpgsql;

-- Function to generate OpenAPI specification
CREATE OR REPLACE FUNCTION v2_generate_openapi_spec(
  base_url text DEFAULT 'https://api.spine.dev',
  version text DEFAULT 'v1'
)
RETURNS jsonb AS $$
DECLARE
  openapi_spec jsonb;
  endpoints_data jsonb;
BEGIN
  -- Build OpenAPI specification
  SELECT jsonb_build_object(
    'openapi', '3.0.0',
    'info', jsonb_build_object(
      'title', 'Spine API',
      'version', version,
      'description', 'Spine v2 API specification'
    ),
    'servers', jsonb_build_array(
      jsonb_build_object('url', base_url, 'description', 'Production server')
    ),
    'paths', (
      SELECT jsonb_object_agg(
        path || (CASE WHEN method = 'GET' AND parameters ? 'id' THEN '/{id}' ELSE '' END),
        jsonb_build_object(
          lower(method), jsonb_build_object(
            'summary', display_name,
            'description', description,
            'tags', tags,
            'parameters', CASE 
              WHEN method = 'GET' AND parameters ? 'id' THEN
                jsonb_build_array(
                  jsonb_build_object(
                    'name', 'id',
                    'in', 'path',
                    'required', true,
                    'schema', jsonb_build_object('type', 'string', 'format', 'uuid')
                  )
                )
              ELSE parameters
            END,
            'requestBody', CASE 
              WHEN method IN ('POST', 'PUT', 'PATCH') AND request_schema IS NOT NULL THEN
                jsonb_build_object(
                  'content', jsonb_build_object(
                    'application/json', jsonb_build_object('schema', request_schema)
                  )
                )
              ELSE NULL
            END,
            'responses', jsonb_build_object(
              '200', jsonb_build_object(
                'description', 'Successful response',
                'content', CASE 
                  WHEN response_schema IS NOT NULL THEN
                    jsonb_build_object(
                      'application/json', jsonb_build_object('schema', response_schema)
                    )
                  ELSE NULL
                END
              ),
              '400', jsonb_build_object('description', 'Bad request'),
              '401', jsonb_build_object('description', 'Unauthorized'),
              '403', jsonb_build_object('description', 'Forbidden'),
              '404', jsonb_build_object('description', 'Not found'),
              '500', jsonb_build_object('description', 'Internal server error')
            ),
            'security', CASE 
              WHEN authentication_required THEN
                jsonb_build_array(jsonb_build_object('bearerAuth', jsonb_array()))
              ELSE jsonb_build_array()
            END
          )
        )
      )
      FROM v2.api_endpoints
      WHERE is_public = true
      AND is_deprecated = false
      AND version = v2_generate_openapi_spec.version
    ),
    'components', jsonb_build_object(
      'securitySchemes', jsonb_build_object(
        'bearerAuth', jsonb_build_object(
          'type', 'http',
          'scheme', 'bearer',
          'bearerFormat', 'JWT'
        )
      )
    )
  ) INTO openapi_spec;
  
  RETURN openapi_spec;
END;
$$ LANGUAGE plpgsql;

-- Function to get database schema information
CREATE OR REPLACE FUNCTION v2_get_database_schema(
  schema_name text DEFAULT 'v2'
)
RETURNS TABLE (
  table_name text,
  table_type text,
  columns jsonb,
  constraints jsonb,
  indexes jsonb,
  foreign_keys jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name,
    CASE WHEN t.table_type = 'BASE TABLE' THEN 'table' ELSE t.table_type::text END as table_type,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', c.column_name,
          'type', c.data_type,
          'nullable', c.is_nullable = 'YES',
          'default', c.column_default,
          'character_maximum_length', c.character_maximum_length,
          'numeric_precision', c.numeric_precision,
          'numeric_scale', c.numeric_scale
        )
      )
      FROM information_schema.columns c
      WHERE c.table_schema = v2_get_database_schema.schema_name
      AND c.table_name = t.table_name
    ) as columns,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', tc.constraint_name,
          'type', tc.constraint_type,
          'columns', (
            SELECT jsonb_agg(kcu.column_name)
            FROM information_schema.key_column_usage kcu
            WHERE kcu.constraint_name = tc.constraint_name
            AND kcu.constraint_schema = v2_get_database_schema.schema_name
          )
        )
      )
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = v2_get_database_schema.schema_name
      AND tc.table_name = t.table_name
    ) as constraints,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', i.relname,
          'columns', (
            SELECT jsonb_agg(a.attname ORDER BY a.attnum)
            FROM pg_attribute a
            JOIN pg_index ix ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
            WHERE a.attrelid = i.indrelid AND ix.indexrelid = i.oid
          ),
          'unique', i.indisunique,
          'primary', i.indisprimary
        )
      )
      FROM pg_class i
      JOIN pg_namespace n ON i.relnamespace = n.oid
      JOIN pg_index ix ON i.oid = ix.indexrelid
      JOIN pg_class t ON ix.indrelid = t.oid
      WHERE n.nspname = v2_get_database_schema.schema_name
      AND t.relname = v2_get_database_schema.table_name
    ) as indexes,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', kcu.constraint_name,
          'column', kcu.column_name,
          'foreign_table', ccu.table_name,
          'foreign_column', ccu.column_name
        )
      )
      FROM information_schema.key_column_usage kcu
      JOIN information_schema.constraint_column_usage ccu
        ON kcu.constraint_name = ccu.constraint_name
      WHERE kcu.table_schema = v2_get_database_schema.schema_name
      AND kcu.table_name = v2_get_database_schema.table_name
      AND kcu.constraint_name LIKE 'fk_%'
    ) as foreign_keys
  FROM information_schema.tables t
  WHERE t.table_schema = v2_get_database_schema.schema_name
  AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
END;
$$ LANGUAGE plpgsql;

-- Function to get function metadata
CREATE OR REPLACE FUNCTION v2_get_function_metadata(
  schema_name text DEFAULT 'v2'
)
RETURNS TABLE (
  function_name text,
  function_type text,
  arguments jsonb,
  return_type text,
  language text,
  volatility text,
  description text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.proname as function_name,
    CASE 
      WHEN p.prokind = 'f' THEN 'function'
      WHEN p.prokind = 'p' THEN 'procedure'
      ELSE 'unknown'
    END as function_type,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', a.argname,
          'type', a.argtype::text,
          'mode', a.argmode,
          'default', a.argdefault
        )
      )
      FROM (
        SELECT 
          pg_get_function_arguments(p.oid) as args
      ) args,
      unnest(string_to_array(args.args, ', ')) as arg
    ) as arguments,
    pg_get_function_result(p.oid) as return_type,
    p.prolang::regproc::text as language,
    CASE p.provolatile
      WHEN 'i' THEN 'immutable'
      WHEN 's' THEN 'stable'
      WHEN 'v' THEN 'volatile'
      ELSE 'unknown'
    END as volatility,
    COALESCE(obj_description(p.oid, 'pg_proc'), '') as description
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = v2_get_function_metadata.schema_name
  ORDER BY p.proname;
END;
$$ LANGUAGE plpgsql;

-- Function to validate API documentation
CREATE OR REPLACE FUNCTION v2_validate_api_documentation()
RETURNS TABLE (
  validation_type text,
  issue_count bigint,
  issues jsonb
) AS $$
BEGIN
  -- Check for undocumented endpoints
  RETURN QUERY SELECT 
    'undocumented_endpoints' as validation_type,
    COUNT(*) as issue_count,
    jsonb_agg(
      jsonb_build_object(
        'path', ae.path,
        'method', ae.method,
        'handler', ae.handler_function
      )
    ) as issues
  FROM v2.api_endpoints ae
  WHERE ae.description IS NULL OR ae.description = '';
  
  -- Check for missing request schemas
  RETURN QUERY SELECT 
    'missing_request_schemas' as validation_type,
    COUNT(*) as issue_count,
    jsonb_agg(
      jsonb_build_object(
        'path', ae.path,
        'method', ae.method,
        'handler', ae.handler_function
      )
    ) as issues
  FROM v2.api_endpoints ae
  WHERE ae.method IN ('POST', 'PUT', 'PATCH')
  AND (ae.request_schema IS NULL OR jsonb_typeof(ae.request_schema) != 'object');
  
  -- Check for missing response schemas
  RETURN QUERY SELECT 
    'missing_response_schemas' as validation_type,
    COUNT(*) as issue_count,
    jsonb_agg(
      jsonb_build_object(
        'path', ae.path,
        'method', ae.method,
        'handler', ae.handler_function
      )
    ) as issues
  FROM v2.api_endpoints ae
  WHERE ae.response_schema IS NULL OR jsonb_typeof(ae.response_schema) != 'object';
END;
$$ LANGUAGE plpgsql;

-- Function to sync database schema to metadata
CREATE OR REPLACE FUNCTION v2_sync_schema_metadata(
  schema_name text DEFAULT 'v2'
)
RETURNS TABLE (
  synced_count integer,
  updated_count integer,
  created_count integer
) AS $$
DECLARE
  synced_count integer := 0;
  updated_count integer := 0;
  created_count integer := 0;
  table_record RECORD;
BEGIN
  -- Sync tables
  FOR table_record IN 
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = schema_name
    AND table_type = 'BASE TABLE'
  LOOP
    synced_count := synced_count + 1;
    
    -- Check if metadata exists
    IF EXISTS (
      SELECT 1 FROM v2.schema_metadata
      WHERE schema_name = 'spine_v2'
      AND object_type = 'table'
      AND object_name = table_record.table_name
    ) THEN
      -- Update existing
      UPDATE v2.schema_metadata
      SET updated_at = now()
      WHERE schema_name = 'spine_v2'
      AND object_type = 'table'
      AND object_name = table_record.table_name;
      
      updated_count := updated_count + 1;
    ELSE
      -- Create new
      INSERT INTO v2.schema_metadata (
        schema_name, object_type, object_name, display_name,
        object_definition, account_id
      )
      VALUES (
        'spine_v2', 'table', table_record.table_name,
        initcap(replace(table_record.table_name, '_', ' ')),
        jsonb_build_object('table_name', table_record.table_name),
        '00000000-0000-0000-0000-000000000000' -- System account
      );
      
      created_count := created_count + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT synced_count, updated_count, created_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.schema_metadata IS 'Schema metadata for introspection';
COMMENT ON TABLE v2.api_endpoints IS 'API endpoint documentation';
COMMENT ON FUNCTION v2.update_schema_metadata(text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, boolean, jsonb) IS 'Update schema metadata';
COMMENT ON FUNCTION v2_get_schema_metadata(text, text, text, boolean) IS 'Get schema metadata';
COMMENT ON FUNCTION v2_get_api_endpoints(text, text, text, boolean, boolean) IS 'Get API endpoints';
COMMENT ON FUNCTION v2_generate_openapi_spec(text, text) IS 'Generate OpenAPI specification';
COMMENT ON FUNCTION v2_get_database_schema(text) IS 'Get database schema';
COMMENT ON FUNCTION v2_get_function_metadata(text) IS 'Get function metadata';
COMMENT ON FUNCTION v2_validate_api_documentation() IS 'Validate API documentation';
COMMENT ON FUNCTION v2_sync_schema_metadata(text) IS 'Sync database schema to metadata';
