-- Migration 014: Webhook Registry
-- 
-- Creates the webhook_handlers table for dynamic handler registration.
-- This enables custom functions to self-register without core code changes,
-- replacing the static import pattern in custom_webhook-handlers.ts

-- ============================================
-- webhook_handlers: Dynamic handler registry
-- ============================================

CREATE TABLE public.webhook_handlers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Handler identifier (e.g., 'cortex-handler', 'slack-webhook')
  name VARCHAR(255) NOT NULL UNIQUE,
  
  -- Netlify function name to invoke (e.g., 'custom_cortex-handler')
  function_name VARCHAR(255) NOT NULL,
  
  -- Human-readable description
  description TEXT,
  
  -- Events this handler subscribes to (for trigger integration)
  events JSONB DEFAULT '[]'::jsonb,
  
  -- Account that owns this handler (null = system/global)
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Enable/disable without deleting
  is_active BOOLEAN DEFAULT true,
  
  -- Audit timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Soft delete support
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_webhook_handlers_name ON public.webhook_handlers(name) WHERE is_active = true AND is_deleted = false;
CREATE INDEX idx_webhook_handlers_account ON public.webhook_handlers(account_id) WHERE is_deleted = false;
CREATE INDEX idx_webhook_handlers_events ON public.webhook_handlers USING GIN(events) WHERE is_active = true;

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE public.webhook_handlers ENABLE ROW LEVEL SECURITY;

-- System admins can manage all handlers (check raw_user_meta_data for system_admin role)
CREATE POLICY webhook_handlers_system_admin ON public.webhook_handlers
  FOR ALL
  TO authenticated
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'system_admin'
  )
  WITH CHECK (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'system_admin'
  );

-- Service role bypass (for registration from functions)
CREATE POLICY webhook_handlers_service_role ON public.webhook_handlers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER webhook_handlers_updated_at
  BEFORE UPDATE ON public.webhook_handlers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- Seed: Register existing handlers (if any)
-- ============================================

-- Note: Custom handlers will self-register via their own functions.
-- This migration only creates the infrastructure.

-- Example registration (uncomment if you have existing handlers to migrate):
-- INSERT INTO public.webhook_handlers (name, function_name, description, events)
-- VALUES (
--   'example-handler',
--   'custom_example-handler',
--   'Example webhook handler for documentation',
--   '["user.created", "item.updated"]'
-- )
-- ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.webhook_handlers IS 
'Dynamic registry for webhook handlers. Custom functions self-register here to be discoverable by the integration-routes handler without static imports.';
