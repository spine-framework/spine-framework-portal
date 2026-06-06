-- Migration 002e: System Tables (AI, Integrations, Logs, API Keys)

CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL,
  description text, agent_type text NOT NULL, model_config jsonb DEFAULT '{}',
  system_prompt text, tools jsonb DEFAULT '[]', capabilities jsonb DEFAULT '[]',
  constraints jsonb DEFAULT '{}', metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL, model_id text NOT NULL, document_id text NOT NULL,
  chunk_index integer NOT NULL, content text NOT NULL, embedding vector(1536),
  metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
  UNIQUE(model_id, document_id, chunk_index)
);

CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL,
  description text, integration_type text NOT NULL, provider text,
  version text, config jsonb DEFAULT '{}', credentials jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_configured boolean DEFAULT false, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.prompt_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL, slug text NOT NULL,
  system_prompt text, context_template text, model text, temperature numeric,
  max_tokens integer, is_multi_turn boolean DEFAULT false, max_history_messages integer,
  confidence_threshold numeric, escalation_action text, escalation_target text,
  output_mode text, output_field text, requires_review boolean DEFAULT false,
  knowledge_sources jsonb DEFAULT '[]', available_tools jsonb DEFAULT '[]',
  tool_constraints jsonb DEFAULT '{}', metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid, account_id uuid, name text NOT NULL,
  key_value text UNIQUE NOT NULL, key_prefix text NOT NULL,
  key_type text NOT NULL, permissions jsonb DEFAULT '[]',
  rate_limit integer DEFAULT 1000, is_active boolean DEFAULT true,
  expires_at timestamptz, metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  machine_type text, is_internal boolean DEFAULT false, scopes text[] DEFAULT '{}',
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.api_key_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL, account_id uuid NOT NULL,
  request_method text, request_path text, request_ip text, user_agent text,
  response_status integer, response_size integer, duration_ms integer,
  success boolean DEFAULT true, error_message text, metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL, message text NOT NULL, context jsonb DEFAULT '{}',
  source text, source_type text, source_id uuid, person_id uuid, account_id uuid,
  metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now()
);

CREATE TABLE public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid, name text NOT NULL, slug text NOT NULL,
  description text, handler text NOT NULL, handler_module text DEFAULT 'functions',
  config jsonb DEFAULT '{}', input_schema jsonb DEFAULT '{}', output_schema jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  default_machine_principal_id uuid, required_scopes text[] DEFAULT '{}',
  is_active boolean DEFAULT true, timeout_seconds integer DEFAULT 300,
  retry_count integer DEFAULT 3, created_by uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid, action_id uuid NOT NULL, name text NOT NULL,
  schedule_type text NOT NULL, cron_expression text,
  next_run_at timestamptz, last_run_at timestamptz,
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, machine_principal_id uuid,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.schedule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL, account_id uuid NOT NULL, machine_principal_id uuid,
  status text DEFAULT 'pending', input_params jsonb DEFAULT '{}',
  output_result jsonb DEFAULT '{}', error_message text, duration_ms integer,
  created_at timestamptz DEFAULT now()
);
