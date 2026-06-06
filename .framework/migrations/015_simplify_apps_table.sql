-- Migration 015: Simplify App Architecture
--
-- Transforms app_definitions from metadata-heavy table to minimal installations tracker.
-- App metadata (name, nav_items, min_role) moves to manifest.json files.
-- This enables file-first app discovery with database-only tracking multi-tenancy.

-- ============================================
-- Step 1: Add new columns for manifest-driven approach
-- ============================================

ALTER TABLE public.app_definitions
  ADD COLUMN IF NOT EXISTS manifest_path TEXT,
  ADD COLUMN IF NOT EXISTS config_source VARCHAR(20) DEFAULT 'database',
  ADD COLUMN IF NOT EXISTS required_roles JSONB DEFAULT '[]'::jsonb;

-- ============================================
-- Step 2: Migrate existing data to new structure
-- ============================================

-- Migrate min_role to required_roles array (backward compatible)
UPDATE public.app_definitions
SET required_roles = CASE 
  WHEN min_role IS NOT NULL THEN jsonb_build_array(min_role)
  ELSE '[]'::jsonb
END
WHERE required_roles = '[]'::jsonb OR required_roles IS NULL;

-- Set manifest paths for existing apps
UPDATE public.app_definitions
SET manifest_path = CASE slug
  WHEN 'cortex' THEN 'custom/apps/cortex/manifest.json'
  WHEN 'customer-portal' THEN 'custom/apps/customer-portal/manifest.json'
  WHEN 'admin' THEN '.framework/src/apps/admin/manifest.json'
  ELSE NULL
END,
config_source = 'manifest'
WHERE manifest_path IS NULL;

-- ============================================
-- Step 3: Create app_installations table for multi-tenancy
-- ============================================

CREATE TABLE IF NOT EXISTS public.app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  app_slug VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  installed_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint: one installation per account per app
  UNIQUE(account_id, app_slug)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_app_installations_account 
  ON public.app_installations(account_id) 
  WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_app_installations_slug 
  ON public.app_installations(app_slug) 
  WHERE is_enabled = true;

-- ============================================
-- Step 4: Migrate existing single-tenant data
-- ============================================

-- Insert records for apps that should be available to all accounts
-- This assumes all current apps are "system apps" available to everyone
INSERT INTO public.app_installations (account_id, app_slug, is_enabled)
SELECT 
  a.id as account_id,
  ad.slug as app_slug,
  ad.is_active as is_enabled
FROM public.accounts a
CROSS JOIN public.app_definitions ad
WHERE ad.is_system = true OR ad.is_active = true
ON CONFLICT (account_id, app_slug) DO NOTHING;

-- ============================================
-- Step 5: Update RLS policies
-- ============================================

-- Enable RLS on new table
ALTER TABLE public.app_installations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see apps installed for their account
CREATE POLICY app_installations_select ON public.app_installations
  FOR SELECT
  TO authenticated
  USING (
    account_id IN (
      SELECT account_id FROM public.memberships 
      WHERE user_id = auth.uid()
    )
    OR (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'system_admin'
  );

-- Policy: System admins can manage all installations
CREATE POLICY app_installations_admin ON public.app_installations
  FOR ALL
  TO authenticated
  USING ((SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'system_admin')
  WITH CHECK ((SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'system_admin');

-- Service role bypass
CREATE POLICY app_installations_service ON public.app_installations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Step 6: Create trigger for updated_at
-- ============================================

DROP TRIGGER IF EXISTS app_installations_updated_at ON public.app_installations;
CREATE TRIGGER app_installations_updated_at
  BEFORE UPDATE ON public.app_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- Step 7: Add function to load manifest
-- ============================================

CREATE OR REPLACE FUNCTION public.get_app_manifest(app_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  manifest_path TEXT;
  manifest_content TEXT;
BEGIN
  -- Get manifest path from app_definitions
  SELECT ad.manifest_path INTO manifest_path
  FROM public.app_definitions ad
  WHERE ad.slug = app_slug;
  
  IF manifest_path IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Note: In actual implementation, this would read from filesystem
  -- For now, return placeholder indicating manifest-driven
  RETURN jsonb_build_object(
    'source', 'manifest',
    'path', manifest_path,
    'note', 'Manifest content loaded by application layer'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 8: Verification view
-- ============================================

CREATE OR REPLACE VIEW public.app_definitions_simplified AS
SELECT 
  id,
  slug,
  manifest_path,
  config_source,
  required_roles,
  is_active,
  is_system,
  ownership,
  pack_id,
  account_id,
  created_at,
  updated_at
FROM public.app_definitions;

COMMENT ON VIEW public.app_definitions_simplified IS 
'Temporary view showing the simplified app_definitions structure during migration. Full table will be renamed to app_installations after all code is updated.';

-- ============================================
-- Migration Notes
-- ============================================

COMMENT ON TABLE public.app_definitions IS 
'Transitional table during manifest migration. Will be renamed to app_installations with only: account_id, app_slug, is_enabled, installed_at. All metadata moves to manifest.json files.';

-- Next steps after this migration (manual, not in this file):
-- 1. Update backend code to read from manifest.json
-- 2. Update frontend to use required_roles array instead of min_role
-- 3. Verify all apps work with new structure
-- 4. Create migration 016 to drop deprecated columns (name, description, nav_items, min_role, etc.)
-- 5. Rename table from app_definitions to app_installations
