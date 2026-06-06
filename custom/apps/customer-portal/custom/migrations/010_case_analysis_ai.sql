-- Migration 010: Case Analysis AI Agent and Prompt Configuration
-- Creates AI agent and prompt config for case resolution analysis

-- Step 1: Create case analysis AI agent
INSERT INTO public.ai_agents (id, app_id, name, description, agent_type, system_prompt, model_config, ownership, is_system, is_active, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'Case Resolution Analysis Agent',
    'AI agent specialized in analyzing resolved support tickets to extract insights, identify root causes, and suggest improvements',
    'analysis',
    'You are a specialized support operations analyst. Your task is to analyze resolved support tickets and extract comprehensive insights that will help improve the support process, product quality, and customer experience.

For each resolved ticket, you will receive:
- The original ticket description and title
- The complete conversation history (customer messages and agent responses)
- Any internal notes or metadata

Your analysis should be thorough and structured. Focus on:
1. What the customer reported vs what the actual problem was
2. How the problem was diagnosed and solved
3. Customer sentiment throughout the conversation
4. Process efficiency and improvement opportunities
5. Knowledge gaps and automation potential
6. Tags that would help categorize and find similar cases

Always be objective, constructive, and focused on actionable insights. Your analysis will be used to improve support processes, product documentation, and customer experience.',
    '{"model": "gpt-4o", "temperature": 0.3, "max_tokens": 2000}',
    'tenant',
    false,
    true,
    now(),
    now()
  );

-- Step 2: Create case analysis prompt configuration
INSERT INTO public.prompt_configs (id, app_id, slug, name, context_template, model, temperature, max_tokens, output_mode, ownership, is_system, is_active, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'cortex'),
    'case_analysis_prompt',
    'Case Analysis Prompt',
    'Please analyze this resolved support ticket and provide structured insights.

## Ticket Information
Title: {{ticket_title}}
Description: {{ticket_description}}
Created: {{created_at}}
Resolved: {{resolved_at}}
Status: {{status}}
Priority: {{priority}}

## Conversation History
{{conversation_history}}

## Analysis Instructions
Please provide a comprehensive analysis in the following JSON format:

{
  "reported_issue": "What the customer initially reported in their own words",
  "true_problem": "The actual underlying problem that was identified",
  "diagnostic_steps": ["Step 1: How the problem was diagnosed", "Step 2: Additional troubleshooting", "Step 3: Root cause identification"],
  "solution_steps": ["Step 1: Immediate fix applied", "Step 2: Reference to tools/KB articles used", "Step 3: Final resolution"],
  "final_solution": "Summary of the final solution implemented",
  "customer_temperature": "positive|neutral|negative|frustrated",
  "time_to_resolution": <minutes_from_creation_to_resolution>,
  "escalation_required": <true|false>,
  "back_and_forth_count": <number_of_message_exchanges>,
  "sentiment_progression": ["initial_sentiment", "mid_conversation_sentiment", "final_sentiment"],
  "automation_potential": "high|medium|low",
  "kb_candidate": <true|false>,
  "suggested_tags": [
    {
      "slug": "tag-slug",
      "name": "Human Readable Tag Name",
      "category": "bug_classification|knowledge_value|process_type|sentiment",
      "purpose": "Why this tag is relevant",
      "applicable_to": ["ticket", "kb", "account"]
    }
  ],
  "confidence_score": <0.0-1.0>,
  "analysis_summary": "Brief summary of key insights and recommendations"
}

## Tag Categories
- bug_classification: core-code, app-code, app-data, 3pl
- knowledge_value: kb-candidate, internal-only, process-improvement
- process_type: escalation-required, self-service-possible, training-needed
- sentiment: positive, neutral, negative, frustrated

Focus on actionable insights that can improve support processes, product quality, and customer experience.',
    'gpt-4o',
    0.3,
    2000,
    'json_object',
    'tenant',
    false,
    true,
    now(),
    now()
  );
