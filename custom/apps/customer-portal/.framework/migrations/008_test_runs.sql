-- Day-Zero Migration 008: Test Infrastructure Tables
-- Stores test run history and per-case results for the admin Testing dashboard.

CREATE TABLE IF NOT EXISTS public.test_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite        text NOT NULL,          -- 'unit' | 'integration' | 'api' | 'ui'
  status       text NOT NULL,          -- 'running' | 'passed' | 'failed' | 'error'
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer,
  total        integer,
  passed       integer,
  failed       integer,
  skipped      integer,
  triggered_by text DEFAULT 'agent',
  account_id   uuid REFERENCES public.accounts(id)
);

CREATE TABLE IF NOT EXISTS public.test_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
  suite       text NOT NULL,
  file        text,
  describe    text,
  name        text NOT NULL,
  status      text NOT NULL,           -- 'passed' | 'failed' | 'skipped'
  duration_ms integer,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON public.test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_suite ON public.test_runs(suite);
CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON public.test_runs(started_at DESC);
