-- Migration 005: Functions for RLS and Account Hierarchy

CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION public.get_accessible_accounts(actor_id uuid)
RETURNS TABLE (account_id uuid) AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.people p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = actor_id AND r.slug = 'system_admin'
  ) THEN
    RETURN QUERY SELECT a.id FROM public.accounts a;
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE account_tree AS (
    SELECT p.account_id as id FROM public.people p WHERE p.id = actor_id
    UNION ALL
    SELECT ap.descendant_id
    FROM public.account_paths ap
    JOIN account_tree at ON ap.ancestor_id = at.id
  )
  SELECT id FROM account_tree;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid AS $$
DECLARE
  v_auth_id UUID;
  v_person_id UUID;
BEGIN
  v_auth_id := auth.uid();
  
  -- Look up internal person ID from auth_uid
  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_uid = v_auth_id::text AND p.is_active = true
  LIMIT 1;
  
  RETURN v_person_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.person_is_system_admin(person_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.people p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = person_uuid AND r.slug = 'system_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE TABLE public.account_paths (
  ancestor_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  depth integer NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id),
  CHECK (ancestor_id != descendant_id),
  CHECK (depth >= 1)
);

CREATE INDEX idx_account_paths_ancestor ON public.account_paths(ancestor_id);
CREATE INDEX idx_account_paths_descendant ON public.account_paths(descendant_id);

CREATE OR REPLACE FUNCTION public.update_account_paths()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      INSERT INTO public.account_paths (ancestor_id, descendant_id, depth)
      SELECT ancestor_id, NEW.id, depth + 1 FROM public.account_paths WHERE descendant_id = NEW.parent_id;
      INSERT INTO public.account_paths (ancestor_id, descendant_id, depth) VALUES (NEW.parent_id, NEW.id, 1);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    DELETE FROM public.account_paths WHERE descendant_id = NEW.id;
    IF NEW.parent_id IS NOT NULL THEN
      INSERT INTO public.account_paths (ancestor_id, descendant_id, depth)
      SELECT ancestor_id, NEW.id, depth + 1 FROM public.account_paths WHERE descendant_id = NEW.parent_id;
      INSERT INTO public.account_paths (ancestor_id, descendant_id, depth) VALUES (NEW.parent_id, NEW.id, 1);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.account_paths WHERE descendant_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER account_paths_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.update_account_paths();
