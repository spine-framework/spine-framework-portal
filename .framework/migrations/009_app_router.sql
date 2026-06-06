-- Migration 009: App Router columns
-- Adds route_prefix and renderer to apps table for data-driven multi-app routing.
-- Also seeds the admin app record.

-- Add columns
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS route_prefix text,
  ADD COLUMN IF NOT EXISTS renderer text NOT NULL DEFAULT 'generic';

-- Add check constraint on renderer
ALTER TABLE public.apps
  ADD CONSTRAINT chk_apps_renderer CHECK (renderer IN ('generic', 'custom', 'none'));

-- Default route_prefix from slug for existing rows
UPDATE public.apps SET route_prefix = '/' || slug WHERE route_prefix IS NULL;

-- Unique constraint: no two active apps can share a route_prefix
CREATE UNIQUE INDEX IF NOT EXISTS idx_apps_route_prefix
  ON public.apps(route_prefix) WHERE is_active = true AND route_prefix IS NOT NULL;

-- Update spine-core to renderer='none' (backend-only, no frontend route)
UPDATE public.apps
  SET renderer = 'none', route_prefix = NULL
  WHERE slug = 'spine-core';

-- Seed the admin app
INSERT INTO public.apps (
  id, slug, name, description, icon, color, version,
  app_type, source, config, nav_items, min_role,
  is_active, is_system, route_prefix, renderer
)
VALUES (
  gen_random_uuid(),
  'admin',
  'Admin',
  'Spine system administration interface',
  'settings',
  'slate',
  '1.0.0',
  'system',
  'builtin',
  '{}'::jsonb,
  '[]'::jsonb,
  'system_admin',
  true,
  true,
  '/admin',
  'custom'
)
ON CONFLICT (slug) DO UPDATE SET
  route_prefix = EXCLUDED.route_prefix,
  renderer = EXCLUDED.renderer,
  min_role = EXCLUDED.min_role,
  is_system = EXCLUDED.is_system,
  app_type = EXCLUDED.app_type;
