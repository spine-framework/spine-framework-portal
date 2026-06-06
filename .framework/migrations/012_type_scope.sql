-- Migration 012: Stamp scope on all type design_schemas
-- Must be applied BEFORE deploying admin-data.ts scope resolution code.

-- Platform-scoped types: owned by spine-system, any authenticated user can read
UPDATE public.types
SET design_schema = design_schema || '{"scope":"platform"}'::jsonb
WHERE slug IN ('kb_article', 'course_lesson', 'community_post', 'community_question');

-- Customer-scoped types: owned by the customer's account
UPDATE public.types
SET design_schema = design_schema || '{"scope":"customer"}'::jsonb
WHERE slug IN ('support_ticket');

-- Account-scoped types: owned by the calling account (default, explicit for clarity)
UPDATE public.types
SET design_schema = design_schema || '{"scope":"account"}'::jsonb
WHERE design_schema->>'scope' IS NULL;
