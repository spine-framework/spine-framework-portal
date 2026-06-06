-- Migration 012: Unique constraint on threads per target + visibility
-- Enforces one thread per item per visibility level.
-- Allows: one 'external' thread + one 'internal' thread per ticket.
-- Prevents: duplicate discussion threads on the same item.

ALTER TABLE public.threads
  ADD CONSTRAINT threads_unique_target_visibility
  UNIQUE (target_type, target_id, visibility);
