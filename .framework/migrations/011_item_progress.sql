-- Migration 011: item_progress — per-person, per-item progress tracking

CREATE TABLE public.item_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id           uuid NOT NULL,
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  app_id            uuid REFERENCES public.apps(id) ON DELETE SET NULL,
  person_id         uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  item_id           uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  title             text,
  description       text,
  status            text NOT NULL DEFAULT 'not_started',
  score             integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  data              jsonb NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  design_schema     jsonb NOT NULL DEFAULT '{}',
  validation_schema jsonb NOT NULL DEFAULT '{}',
  created_by        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, item_id)
);

-- Indexes
CREATE INDEX idx_item_progress_person    ON public.item_progress(person_id);
CREATE INDEX idx_item_progress_item      ON public.item_progress(item_id);
CREATE INDEX idx_item_progress_account   ON public.item_progress(account_id);
CREATE INDEX idx_item_progress_type      ON public.item_progress(type_id);
CREATE INDEX idx_item_progress_status    ON public.item_progress(status);
CREATE INDEX idx_item_progress_data_gin  ON public.item_progress USING gin(data);
CREATE INDEX idx_item_progress_active    ON public.item_progress(account_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE public.item_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY item_progress_access ON public.item_progress FOR ALL
  USING (
    account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
    OR auth.uid() IS NULL
  );
