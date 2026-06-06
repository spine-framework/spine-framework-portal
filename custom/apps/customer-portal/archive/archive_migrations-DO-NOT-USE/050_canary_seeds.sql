-- Canary pipeline and trigger seeds for system verification
-- These records are used by the verify workflow and integration tests
-- to confirm that the automation engine is functioning correctly.
--
-- They are account-scoped to the system account (null account_id)
-- and tagged with is_canary = true so they can be identified/cleaned up.
--
-- The canary pipeline intentionally has zero stages (instant success).
-- The canary trigger fires on item_created with type_slug = 'canary'.

-- Canary pipeline: no stages, instant success, used to verify execution engine
INSERT INTO v2.pipelines (id, name, slug, description, stages, is_active, account_id, created_at, updated_at)
VALUES (
  '00000000-cana-4000-8000-000000000001'::uuid,
  '[Canary] Heartbeat',
  'canary-heartbeat',
  'System verification pipeline. Zero stages, always succeeds. Do not modify or delete.',
  '[]'::jsonb,
  true,
  null,  -- system-level, not tenant-scoped
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Canary action: a no-op function handler used to test stage dispatch
INSERT INTO v2.actions (id, name, slug, description, handler, handler_module, config, is_active, created_at, updated_at)
VALUES (
  '00000000-cana-4000-8000-000000000002'::uuid,
  '[Canary] No-op',
  'canary-noop',
  'System verification action. Returns immediately with success: true. Do not modify.',
  'agent_inference',  -- uses the mock fallback path (no webhook_url)
  'functions',
  '{"context": "canary", "mock": true}'::jsonb,
  true,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Canary pipeline with one stage: verifies stage dispatch works end-to-end
INSERT INTO v2.pipelines (id, name, slug, description, stages, is_active, account_id, created_at, updated_at)
VALUES (
  '00000000-cana-4000-8000-000000000003'::uuid,
  '[Canary] Stage Dispatch',
  'canary-stage-dispatch',
  'System verification pipeline with one no-op stage. Verifies stage execution path.',
  jsonb_build_array(
    jsonb_build_object(
      'stage_type', 'canary-noop',
      'config', jsonb_build_object('context', 'canary stage dispatch test'),
      'continue_on_error', false
    )
  ),
  true,
  null,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Comments
COMMENT ON TABLE v2.pipelines IS 'Pipeline definitions. Rows with slug prefixed canary- are system verification records.';
