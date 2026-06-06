-- Migration 012: Clean Up Old Test Ticket Data
-- Removes old test tickets, threads, and messages to prepare for production case analysis

-- Step 1: Clean up old test tickets (items with type support_ticket)
-- This will cascade delete related threads and messages
DELETE FROM public.items 
WHERE type_id = (
  SELECT id FROM public.types 
  WHERE slug = 'support_ticket'
) 
AND created_at < NOW() - INTERVAL '30 days'
AND (
  title LIKE '%test%' OR 
  title LIKE '%demo%' OR 
  title LIKE '%sample%' OR
  description LIKE '%test%' OR
  description LIKE '%demo%' OR
  description LIKE '%sample%'
);

-- Step 2: Clean up orphaned threads (threads without valid target items)
DELETE FROM public.threads 
WHERE target_type = 'items'
AND target_id NOT IN (SELECT id FROM public.items);

-- Step 3: Clean up orphaned messages (messages without valid threads)
DELETE FROM public.messages 
WHERE thread_id NOT IN (SELECT id FROM public.threads);

-- Step 4: Clean up orphaned links (links without valid source or target items)
DELETE FROM public.links 
WHERE (source_type = 'items' AND source_id NOT IN (SELECT id FROM public.items))
OR (target_type = 'items' AND target_id NOT IN (SELECT id FROM public.items));

-- Step 5: Clean up old case analysis items (optional - keep for audit trail)
-- Commented out to preserve analysis history
-- DELETE FROM public.items 
-- WHERE type_id = (
--   SELECT id FROM public.types 
--   WHERE slug = 'case_analysis'
-- ) 
-- AND created_at < NOW() - INTERVAL '90 days';

-- Step 6: Update statistics
-- Note: UUID tables don't use sequences, so no sequence reset needed

-- Step 7: Log cleanup completion
DO $$
BEGIN
  RAISE NOTICE 'Test data cleanup completed. Removed old test tickets, threads, and messages.';
END $$;
