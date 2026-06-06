-- Migration 012: RLS platform scope visibility
-- Adds OR branch: any authenticated user can see platform-scoped records.
-- This enables KB articles, course lessons, community posts to be readable
-- by all authenticated users regardless of account hierarchy.

-- items: uses current_actor_id() to match existing policy pattern
DROP POLICY IF EXISTS items_access ON public.items;
CREATE POLICY items_access ON public.items FOR ALL
  USING (
    account_id IN (SELECT public.get_accessible_accounts(public.current_actor_id()))
    OR (design_schema->>'scope' = 'platform' AND public.current_actor_id() IS NOT NULL)
    OR public.current_actor_id() IS NULL
  );

-- threads: uses auth.uid() to match existing policy pattern
DROP POLICY IF EXISTS threads_access ON public.threads;
CREATE POLICY threads_access ON public.threads FOR ALL
  USING (
    account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
    OR (design_schema->>'scope' = 'platform' AND auth.uid() IS NOT NULL)
    OR auth.uid() IS NULL
  );

-- links: uses auth.uid() to match existing policy pattern
DROP POLICY IF EXISTS links_access ON public.links;
CREATE POLICY links_access ON public.links FOR ALL
  USING (
    account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
    OR (design_schema->>'scope' = 'platform' AND auth.uid() IS NOT NULL)
    OR auth.uid() IS NULL
  );

-- attachments: uses auth.uid() to match existing policy pattern
DROP POLICY IF EXISTS attachments_access ON public.attachments;
CREATE POLICY attachments_access ON public.attachments FOR ALL
  USING (
    account_id IN (SELECT public.get_accessible_accounts(auth.uid()))
    OR (design_schema->>'scope' = 'platform' AND auth.uid() IS NOT NULL)
    OR auth.uid() IS NULL
  );

-- messages: no change — inherits visibility from thread via existing join
