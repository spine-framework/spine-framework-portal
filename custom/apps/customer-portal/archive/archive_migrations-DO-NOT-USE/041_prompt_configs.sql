-- Prompt Configurations table for Spine v2
-- Configurable AI prompts and templates

CREATE TABLE v2.prompt_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid REFERENCES v2.apps(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  prompt_type text NOT NULL CHECK (prompt_type IN ('system', 'user', 'assistant', 'function', 'template')),
  category text DEFAULT 'general',
  template text NOT NULL,
  variables jsonb DEFAULT '[]',
  model_config jsonb DEFAULT '{}',
  constraints jsonb DEFAULT '{}',
  examples jsonb DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb DEFAULT '{}',
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CHECK (prompt_type IS NOT NULL),
  CHECK (template IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_prompt_configs_app_id ON v2.prompt_configs(app_id);
CREATE INDEX idx_prompt_configs_type ON v2.prompt_configs(prompt_type);
CREATE INDEX idx_prompt_configs_category ON v2.prompt_configs(category);
CREATE INDEX idx_prompt_configs_active ON v2.prompt_configs(is_active);
CREATE INDEX idx_prompt_configs_default ON v2.prompt_configs(is_default);
CREATE INDEX idx_prompt_configs_created_by ON v2.prompt_configs(created_by);
CREATE INDEX idx_prompt_configs_account ON v2.prompt_configs(account_id);

-- GIN indexes for JSONB
CREATE INDEX idx_prompt_configs_variables_gin ON v2.prompt_configs USING gin(variables);
CREATE INDEX idx_prompt_configs_model_config_gin ON v2.prompt_configs USING gin(model_config);
CREATE INDEX idx_prompt_configs_constraints_gin ON v2.prompt_configs USING gin(constraints);
CREATE INDEX idx_prompt_configs_examples_gin ON v2.prompt_configs USING gin(examples);

-- Prompt Config Versions table
CREATE TABLE v2.prompt_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES v2.prompt_configs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  template text NOT NULL,
  variables jsonb DEFAULT '[]',
  model_config jsonb DEFAULT '{}',
  constraints jsonb DEFAULT '{}',
  examples jsonb DEFAULT '[]',
  change_description text,
  created_by uuid REFERENCES v2.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL REFERENCES v2.accounts(id) ON DELETE CASCADE,
  
  CHECK (template IS NOT NULL)
);

-- Indexes for prompt_config_versions
CREATE INDEX idx_prompt_config_versions_config_id ON v2.prompt_config_versions(config_id);
CREATE INDEX idx_prompt_config_versions_version ON v2.prompt_config_versions(version);
CREATE INDEX idx_prompt_config_versions_created_at ON v2.prompt_config_versions(created_at);
CREATE INDEX idx_prompt_config_versions_account ON v2.prompt_config_versions(account_id);

-- Function to create prompt config
CREATE OR REPLACE FUNCTION v2.create_prompt_config(
  app_id uuid,
  name text,
  description text DEFAULT NULL,
  prompt_type text,
  category text DEFAULT 'general',
  template text,
  variables jsonb DEFAULT '[]',
  model_config jsonb DEFAULT '{}',
  constraints jsonb DEFAULT '{}',
  examples jsonb DEFAULT '[]',
  is_default boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_by uuid DEFAULT NULL,
  account_id uuid
)
RETURNS uuid AS $$
DECLARE
  config_id uuid;
BEGIN
  -- Validate prompt type
  IF prompt_type NOT IN ('system', 'user', 'assistant', 'function', 'template') THEN
    RAISE EXCEPTION 'Invalid prompt type';
  END IF;
  
  -- Insert prompt config
  INSERT INTO v2.prompt_configs (
    app_id, name, description, prompt_type, category, template,
    variables, model_config, constraints, examples, is_default,
    metadata, created_by, account_id
  )
  VALUES (
    app_id, name, description, prompt_type, category, template,
    variables, model_config, constraints, examples, is_default,
    metadata, created_by, account_id
  )
  RETURNING id INTO config_id;
  
  RETURN config_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update prompt config
CREATE OR REPLACE FUNCTION v2.update_prompt_config(
  config_id uuid,
  name text DEFAULT NULL,
  description text DEFAULT NULL,
  category text DEFAULT NULL,
  template text DEFAULT NULL,
  variables jsonb DEFAULT NULL,
  model_config jsonb DEFAULT NULL,
  constraints jsonb DEFAULT NULL,
  examples jsonb DEFAULT NULL,
  metadata jsonb DEFAULT NULL,
  is_active boolean DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  old_template text;
  old_variables jsonb;
  old_model_config jsonb;
  old_constraints jsonb;
  old_examples jsonb;
  version_number integer;
BEGIN
  -- Get current values for version tracking
  SELECT template, variables, model_config, constraints, examples, version
  INTO old_template, old_variables, old_model_config, old_constraints, old_examples, version_number
  FROM v2.prompt_configs
  WHERE id = update_prompt_config.config_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Create version record if template or significant changes
  IF template IS NOT NULL AND template != old_template THEN
    INSERT INTO v2.prompt_config_versions (
      config_id, version, template, variables, model_config,
      constraints, examples, change_description, account_id
    )
    VALUES (
      config_id, version_number, old_template, old_variables, old_model_config,
      old_constraints, old_examples, 'Template updated', 
      (SELECT account_id FROM v2.prompt_configs WHERE id = config_id)
    );
    
    -- Update version number
    version_number := version_number + 1;
  END IF;
  
  -- Update the config
  UPDATE v2.prompt_configs
  SET 
    name = COALESCE(update_prompt_config.name, name),
    description = COALESCE(update_prompt_config.description, description),
    category = COALESCE(update_prompt_config.category, category),
    template = COALESCE(update_prompt_config.template, template),
    variables = COALESCE(update_prompt_config.variables, variables),
    model_config = COALESCE(update_prompt_config.model_config, model_config),
    constraints = COALESCE(update_prompt_config.constraints, constraints),
    examples = COALESCE(update_prompt_config.examples, examples),
    metadata = COALESCE(update_prompt_config.metadata, metadata),
    is_active = COALESCE(update_prompt_config.is_active, is_active),
    version = version_number,
    updated_at = now()
  WHERE id = update_prompt_config.config_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to render prompt template
CREATE OR REPLACE FUNCTION v2.render_prompt_template(
  config_id uuid,
  variables_data jsonb DEFAULT '{}'
)
RETURNS TABLE (
  rendered_template text,
  variables_used jsonb,
  missing_variables jsonb
) AS $$
DECLARE
  config_record RECORD;
  rendered_text text;
  variables_used jsonb;
  missing_variables jsonb;
  variable_record RECORD;
BEGIN
  -- Get prompt config
  SELECT * INTO config_record
  FROM v2.prompt_configs
  WHERE id = render_prompt_template.config_id
  AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, '{}'::jsonb, '{}'::jsonb;
    RETURN;
  END IF;
  
  rendered_text := config_record.template;
  variables_used := '{}'::jsonb;
  missing_variables := '{}'::jsonb;
  
  -- Replace variables in template
  FOR variable_record IN 
    SELECT value FROM jsonb_array_elements(config_record.variables)
  LOOP
    DECLARE
      var_name text := variable_record->>'name';
      var_value text;
    BEGIN
      -- Get variable value from provided data
      var_value := COALESCE(
        (variables_data->>var_name),
        variable_record->>'default_value',
        ''
      );
      
      -- Replace variable in template
      rendered_text := replace(
        rendered_text, 
        '{{' || var_name || '}}', 
        var_value
      );
      
      -- Track used variables
      IF variables_data ? var_name THEN
        variables_used := jsonb_set(variables_used, '{ ' || var_name || ' }', to_jsonb(var_value));
      END IF;
      
      -- Check for missing required variables
      IF variable_record->>'required' = 'true' AND NOT (variables_data ? var_name) THEN
        missing_variables := jsonb_set(missing_variables, '{ ' || var_name || ' }', to_jsonb(true));
      END IF;
    END;
  END LOOP;
  
  RETURN QUERY SELECT 
    rendered_text as rendered_template,
    variables_used as variables_used,
    missing_variables as missing_variables;
END;
$$ LANGUAGE plpgsql;

-- Function to get prompt configs by type
CREATE OR REPLACE FUNCTION v2.get_prompt_configs_by_type(
  prompt_type text,
  category text DEFAULT NULL,
  app_id uuid DEFAULT NULL,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  category text,
  template text,
  variables jsonb,
  is_default boolean,
  version integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.name,
    pc.description,
    pc.category,
    pc.template,
    pc.variables,
    pc.is_default,
    pc.version
  FROM v2.prompt_configs pc
  WHERE pc.prompt_type = get_prompt_configs_by_type.prompt_type
  AND (category IS NULL OR pc.category = get_prompt_configs_by_type.category)
  AND (app_id IS NULL OR pc.app_id = get_prompt_configs_by_type.app_id)
  AND (include_inactive = true OR pc.is_active = true)
  ORDER BY pc.is_default DESC, pc.name;
END;
$$ LANGUAGE plpgsql;

-- Function to get default prompt config
CREATE OR REPLACE FUNCTION v2.get_default_prompt_config(
  prompt_type text,
  category text DEFAULT NULL,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  category text,
  template text,
  variables jsonb,
  model_config jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.id,
    pc.name,
    pc.description,
    pc.category,
    pc.template,
    pc.variables,
    pc.model_config
  FROM v2.prompt_configs pc
  WHERE pc.prompt_type = get_default_prompt_config.prompt_type
  AND pc.is_default = true
  AND pc.is_active = true
  AND (category IS NULL OR pc.category = get_default_prompt_config.category)
  AND (app_id IS NULL OR pc.app_id = get_default_prompt_config.app_id)
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to validate prompt template
CREATE OR REPLACE FUNCTION v2.validate_prompt_template(
  config_id uuid
)
RETURNS TABLE (
  is_valid boolean,
  validation_errors jsonb,
  variable_count integer
) AS $$
DECLARE
  config_record RECORD;
  template_text text;
  validation_errors jsonb;
  variable_count integer;
  template_variants jsonb;
BEGIN
  -- Get prompt config
  SELECT * INTO config_record
  FROM v2.prompt_configs
  WHERE id = validate_prompt_template.config_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '["Config not found"]'::jsonb, 0;
    RETURN;
  END IF;
  
  template_text := config_record.template;
  validation_errors := '[]'::jsonb;
  variable_count := jsonb_array_length(config_record.variables);
  
  -- Check for required variables
  FOR i IN 0..variable_count-1 LOOP
    DECLARE
      var_record jsonb := config_record.variables->i;
      var_name text := var_record->>'name';
      var_required boolean := (var_record->>'required') = 'true';
    BEGIN
      IF var_required AND template_text NOT LIKE '%{{' || var_name || '}}%' THEN
        validation_errors := jsonb_array_append(
          validation_errors, 
          to_jsonb('Required variable ' || var_name || ' not found in template')
        );
      END IF;
    END;
  END LOOP;
  
  -- Check for undefined variables in template
  template_variants := regexp_split_to_array(template_text, '\{\{');
  FOR i IN 2..array_length(template_variants, 1) LOOP
    DECLARE
      var_part text := template_variants[i];
      var_name text;
    BEGIN
      IF var_part LIKE '%\}\%' THEN
        var_name := split_part(var_part, '\}\}', 1);
        
        -- Check if variable is defined
        IF NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(config_record.variables) v
          WHERE v->>'name' = var_name
        ) THEN
          validation_errors := jsonb_array_append(
            validation_errors, 
            to_jsonb('Undefined variable in template: ' || var_name)
          );
        END IF;
      END IF;
    END;
  END LOOP;
  
  RETURN QUERY SELECT 
    (jsonb_array_length(validation_errors) = 0) as is_valid,
    validation_errors as validation_errors,
    variable_count as variable_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get prompt config statistics
CREATE OR REPLACE FUNCTION v2.get_prompt_config_statistics(
  account_id uuid DEFAULT NULL,
  app_id uuid DEFAULT NULL
)
RETURNS TABLE (
  prompt_type text,
  category text,
  total_configs bigint,
  active_configs bigint,
  default_configs bigint,
  avg_version numeric,
  last_updated_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pc.prompt_type,
    pc.category,
    COUNT(*) as total_configs,
    COUNT(*) FILTER (WHERE pc.is_active = true) as active_configs,
    COUNT(*) FILTER (WHERE pc.is_default = true) as default_configs,
    AVG(pc.version) as avg_version,
    MAX(pc.updated_at) as last_updated_at
  FROM v2.prompt_configs pc
  WHERE (account_id IS NULL OR pc.account_id = get_prompt_config_statistics.account_id)
  AND (app_id IS NULL OR pc.app_id = get_prompt_config_statistics.app_id)
  GROUP BY pc.prompt_type, pc.category
  ORDER BY total_configs DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get prompt config versions
CREATE OR REPLACE FUNCTION v2.get_prompt_config_versions(
  config_id uuid,
  limit integer DEFAULT 10
)
RETURNS TABLE (
  version integer,
  template text,
  change_description text,
  created_at timestamptz,
  created_by uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pcv.version,
    pcv.template,
    pcv.change_description,
    pcv.created_at,
    pcv.created_by
  FROM v2.prompt_config_versions pcv
  WHERE pcv.config_id = get_prompt_config_versions.config_id
  ORDER BY pcv.version DESC
  LIMIT get_prompt_config_versions.limit;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old versions
CREATE OR REPLACE FUNCTION v2.cleanup_prompt_config_versions(
  keep_versions integer DEFAULT 10
)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM v2.prompt_config_versions
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (PARTITION BY config_id ORDER BY version DESC) as rn
      FROM v2.prompt_config_versions
    ) ranked
    WHERE rn <= keep_versions
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE v2.prompt_configs IS 'Configurable AI prompts and templates';
COMMENT ON TABLE v2.prompt_config_versions IS 'Version history for prompt configurations';
COMMENT ON FUNCTION v2.create_prompt_config(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, uuid, uuid) IS 'Create prompt config';
COMMENT ON FUNCTION v2.update_prompt_config(uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean) IS 'Update prompt config';
COMMENT ON FUNCTION v2.render_prompt_template(uuid, jsonb) IS 'Render prompt template';
COMMENT ON FUNCTION v2.get_prompt_configs_by_type(text, text, uuid, boolean) IS 'Get prompt configs by type';
COMMENT ON FUNCTION v2.get_default_prompt_config(text, text, uuid) IS 'Get default prompt config';
COMMENT ON FUNCTION v2.validate_prompt_template(uuid) IS 'Validate prompt template';
COMMENT ON FUNCTION v2.get_prompt_config_statistics(uuid, uuid) IS 'Get prompt config statistics';
COMMENT ON FUNCTION v2.get_prompt_config_versions(uuid, integer) IS 'Get prompt config versions';
COMMENT ON FUNCTION v2.cleanup_prompt_config_versions(integer) IS 'Cleanup old versions';
