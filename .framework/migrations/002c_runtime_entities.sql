-- Migration 002c: Runtime Entities

CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, account_id uuid NOT NULL, app_id uuid,
  title text, description text, status text DEFAULT 'active',
  data jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  created_by uuid, updated_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, account_id uuid NOT NULL, app_id uuid,
  title text, target_type text NOT NULL, target_id uuid NOT NULL,
  visibility text DEFAULT 'internal', status text DEFAULT 'open',
  data jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  created_by uuid, updated_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, thread_id uuid NOT NULL,
  content text NOT NULL, direction text DEFAULT 'outbound',
  sequence integer NOT NULL, visibility text DEFAULT 'internal',
  data jsonb DEFAULT '{}', is_active boolean DEFAULT true,
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  person_id uuid, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(thread_id, sequence)
);

CREATE TABLE public.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, account_id uuid NOT NULL, link_type_id uuid,
  source_type text NOT NULL, source_id uuid NOT NULL,
  target_type text NOT NULL, target_id uuid NOT NULL,
  link_type text, metadata jsonb DEFAULT '{}',
  data jsonb DEFAULT '{}', design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  created_by uuid, updated_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(source_type, source_id, target_type, target_id, link_type_id)
);

CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, account_id uuid NOT NULL,
  filename text NOT NULL, file_size integer, mime_type text,
  storage_path text, storage_provider text DEFAULT 'supabase',
  metadata jsonb DEFAULT '{}', data jsonb DEFAULT '{}',
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  uploaded_by uuid, created_by uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id uuid NOT NULL, account_id uuid,
  target_type text NOT NULL, target_id uuid NOT NULL, person_id uuid NOT NULL,
  watch_type text DEFAULT 'all', notification_level text DEFAULT 'all',
  metadata jsonb DEFAULT '{}', data jsonb DEFAULT '{}',
  design_schema jsonb DEFAULT '{}', validation_schema jsonb DEFAULT '{}',
  created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(target_type, target_id, person_id)
);
