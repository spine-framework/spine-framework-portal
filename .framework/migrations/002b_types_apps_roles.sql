-- Migration 002b: Types, Apps, Roles

CREATE TABLE public.types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid, kind text NOT NULL, slug text NOT NULL, name text NOT NULL,
  description text, icon text, color text,
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  ownership text DEFAULT 'tenant', is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(app_id, kind, slug)
);

CREATE TABLE public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, name text NOT NULL, description text,
  icon text, color text, version text DEFAULT '1.0.0',
  app_type text DEFAULT 'system', source text DEFAULT 'builtin',
  config jsonb DEFAULT '{}', nav_items jsonb DEFAULT '[]',
  min_role text, integration_deps jsonb DEFAULT '[]', metadata jsonb DEFAULT '{}',
  is_active boolean DEFAULT true, is_system boolean DEFAULT false,
  account_id uuid, owner_account_id uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL, name text NOT NULL, description text,
  permissions jsonb DEFAULT '[]', is_system boolean DEFAULT false,
  is_active boolean DEFAULT true, is_protected boolean DEFAULT false,
  app_id uuid, account_id uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(app_id, slug)
);
