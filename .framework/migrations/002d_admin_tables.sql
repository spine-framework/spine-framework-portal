-- Migration 002d: Admin/Automation Tables

CREATE TABLE public.link_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, slug text NOT NULL, name text NOT NULL,
  description text, icon text, color text,
  config jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(app_id, slug)
);

CREATE TABLE public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL,
  description text, trigger_type text, config jsonb DEFAULT '{}',
  stages jsonb DEFAULT '[]', metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.pipeline_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL, account_id uuid NOT NULL,
  status text DEFAULT 'pending', trigger_data jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}', error_message text,
  started_at timestamptz, completed_at timestamptz, duration_ms integer,
  created_by uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE public.triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL,
  description text, trigger_type text NOT NULL, event_type text,
  config jsonb DEFAULT '{}', pipeline_id uuid, metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, trigger_count integer DEFAULT 0,
  last_triggered timestamptz, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.trigger_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL, status text DEFAULT 'pending',
  triggered_at timestamptz DEFAULT now(), started_at timestamptz,
  completed_at timestamptz, trigger_data jsonb DEFAULT '{}',
  result jsonb DEFAULT '{}', error_message text, duration_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, account_id uuid, name text NOT NULL,
  description text, timer_type text NOT NULL, config jsonb DEFAULT '{}',
  pipeline_id uuid, metadata jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, last_execution timestamptz, next_execution timestamptz,
  execution_count integer DEFAULT 0, success_count integer DEFAULT 0, failure_count integer DEFAULT 0,
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
