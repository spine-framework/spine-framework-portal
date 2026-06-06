-- Migration 009b: Update get_account_apps RPC
-- Adds route_prefix, renderer, config, nav_items to the return type.

DROP FUNCTION IF EXISTS public.get_account_apps(uuid, boolean, boolean);
DROP FUNCTION IF EXISTS v2.get_account_apps(uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION public.get_account_apps(
  account_id uuid,
  include_system boolean DEFAULT true,
  include_inactive boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  slug text,
  name text,
  description text,
  icon text,
  color text,
  version text,
  app_type text,
  source text,
  owner_account_id uuid,
  is_active boolean,
  is_system boolean,
  min_role text,
  config jsonb,
  nav_items jsonb,
  route_prefix text,
  renderer text,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.slug,
    a.name,
    a.description,
    a.icon,
    a.color,
    a.version,
    a.app_type,
    a.source,
    a.owner_account_id,
    a.is_active,
    a.is_system,
    a.min_role,
    a.config,
    a.nav_items,
    a.route_prefix,
    a.renderer,
    a.created_at
  FROM public.apps a
  WHERE
    (include_system OR a.is_system = false)
    AND (include_inactive OR a.is_active = true)
    AND (a.is_system OR a.owner_account_id = get_account_apps.account_id)
  ORDER BY
    a.is_system DESC,
    a.app_type,
    a.name;
END;
$function$;
