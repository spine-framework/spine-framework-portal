-- Migration 008: Community Escalation Trigger
-- Timer-based trigger to escalate unanswered community posts to tickets

INSERT INTO public.triggers (id, account_id, name, trigger_type, config, is_active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM public.accounts WHERE slug = 'spine-system'),
  'Community: Unanswered to Ticket',
  'cron',
  '{
    "schedule": "0 */4 * * *",
    "function": "custom_community-escalation.checkUnanswered",
    "timezone": "UTC",
    "description": "Check for community posts >24h without answers, create tickets"
  }'::jsonb,
  true,
  now(),
  now()
);
