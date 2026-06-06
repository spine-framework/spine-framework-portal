-- Migration 007: Extend Support Ticket Schema with AI Metadata
-- UPDATE only - extends existing support_ticket type design_schema

UPDATE public.types 
SET design_schema = design_schema || '{
  "ai_metadata": {
    "triage_agent_id": {"type": "string", "label": "Triage Agent ID"},
    "triage_thread_id": {"type": "string", "label": "Triage Thread ID"},
    "confidence_threshold": {"type": "number", "label": "Confidence Threshold", "default": 0.75},
    "confidence_at_response": {"type": "number", "label": "Confidence at Response"},
    "escalation_reason": {"type": "select", "label": "Escalation Reason", "options": ["low_confidence", "thumbs_down", "customer_request", "none"]},
    "human_assignee_id": {"type": "string", "label": "Human Assignee"}
  },
  "ai_postmortem": {
    "problem_statement": {"type": "text", "label": "Problem Statement"},
    "true_root_cause": {"type": "text", "label": "True Root Cause"},
    "discovery_path": {"type": "array", "label": "Discovery Path"},
    "solution_summary": {"type": "text", "label": "Solution Summary"},
    "tags": {"type": "array", "label": "Tags"},
    "sources_used": {"type": "array", "label": "Sources Used"},
    "tools_used": {"type": "array", "label": "Tools Used"},
    "confidence_trajectory": {"type": "array", "label": "Confidence Trajectory"}
  },
  "kb_generation": {
    "proposed_kb_id": {"type": "string", "label": "Proposed KB Article ID"},
    "redacted_draft": {"type": "text", "label": "Redacted Draft"},
    "human_edits": {"type": "text", "label": "Human Edits"},
    "approved_at": {"type": "timestamp", "label": "Approved At"},
    "approved_by": {"type": "string", "label": "Approved By"}
  }
}'::jsonb,
    updated_at = now()
WHERE slug = 'support_ticket';
