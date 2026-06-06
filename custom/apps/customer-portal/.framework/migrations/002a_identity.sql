-- Migration 002a: Identity Tables

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid, type_id uuid NOT NULL, slug text NOT NULL UNIQUE,
  display_name text NOT NULL, description text,
  data jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  app_id uuid, created_by uuid, updated_by uuid
);

CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_uid uuid UNIQUE, email text UNIQUE NOT NULL, full_name text NOT NULL,
  avatar_url text, phone text, status text DEFAULT 'active',
  data jsonb DEFAULT '{}', is_active boolean DEFAULT true, account_id uuid NOT NULL,
  app_id uuid, role_id uuid, type_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  created_by uuid
);
