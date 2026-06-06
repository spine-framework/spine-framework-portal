-- Migration 010: Dogfood Apps — CRM, Customer Portal, Marketplace
-- Creates the three dogfood apps and seeds all their item types.
-- All types use app_id scoping so they are isolated per app.

-- ============================================
-- 1. App Records
-- ============================================

INSERT INTO public.apps (id, slug, name, description, version, is_system, is_active, app_type, source, renderer, route_prefix, min_role, owner_account_id)
VALUES
  (
    gen_random_uuid(),
    'crm',
    'Spine CRM',
    'Internal CRM for sales, marketing, and customer success',
    '1.0.0',
    false,
    true,
    'custom',
    'custom',
    'custom',
    '/crm',
    'member',
    (SELECT id FROM public.accounts WHERE slug = 'spine-system')
  ),
  (
    gen_random_uuid(),
    'customer-portal',
    'Customer Portal',
    'Customer-facing portal: AI support, community, knowledge base, and learning',
    '1.0.0',
    false,
    true,
    'custom',
    'custom',
    'generic',
    '/portal',
    'member',
    (SELECT id FROM public.accounts WHERE slug = 'spine-system')
  ),
  (
    gen_random_uuid(),
    'marketplace',
    'Spine Marketplace',
    'Public feed of Spine apps — official and community-submitted',
    '1.0.0',
    false,
    true,
    'custom',
    'custom',
    'generic',
    '/marketplace',
    'member',
    (SELECT id FROM public.accounts WHERE slug = 'spine-system')
  );

-- ============================================
-- 2. CRM Item Types
-- ============================================

INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'crm'),
    'item',
    'deal',
    'Deal',
    'Sales opportunity with stage, value, and close date',
    'briefcase',
    '#3B82F6',
    '{
      "fields": {
        "stage": {"type": "select", "label": "Stage", "required": true, "options": ["prospecting","qualification","proposal","negotiation","closed_won","closed_lost"]},
        "value": {"type": "number", "label": "Deal Value (USD)", "required": false},
        "close_date": {"type": "date", "label": "Expected Close Date", "required": false},
        "owner_person_id": {"type": "string", "label": "Deal Owner", "required": false},
        "account_id": {"type": "string", "label": "Company", "required": false},
        "probability": {"type": "number", "label": "Probability %", "required": false},
        "source": {"type": "select", "label": "Lead Source", "required": false, "options": ["inbound","outbound","referral","event","paid","organic"]}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'crm'),
    'item',
    'site_visit',
    'Site Visit',
    'Website visit tracking event',
    'eye',
    '#8B5CF6',
    '{
      "fields": {
        "url": {"type": "string", "label": "Page URL", "required": true},
        "duration_seconds": {"type": "number", "label": "Duration (seconds)", "required": false},
        "source": {"type": "string", "label": "Traffic Source", "required": false},
        "utm_campaign": {"type": "string", "label": "UTM Campaign", "required": false},
        "utm_medium": {"type": "string", "label": "UTM Medium", "required": false},
        "utm_source": {"type": "string", "label": "UTM Source", "required": false},
        "referrer": {"type": "string", "label": "Referrer URL", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'crm'),
    'item',
    'marketing_touch',
    'Marketing Touch',
    'Marketing touchpoint: channel, campaign, content, conversion',
    'megaphone',
    '#F59E0B',
    '{
      "fields": {
        "channel": {"type": "select", "label": "Channel", "required": true, "options": ["email","social","paid_search","organic_search","direct","event","referral"]},
        "campaign": {"type": "string", "label": "Campaign Name", "required": false},
        "content": {"type": "string", "label": "Content/Asset", "required": false},
        "converted": {"type": "boolean", "label": "Converted", "required": false},
        "deal_id": {"type": "string", "label": "Related Deal", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'crm'),
    'item',
    'csm_health',
    'CSM Health Record',
    'Customer success health check: temperature, churn risk, adoption, NPS',
    'heart-pulse',
    '#10B981',
    '{
      "fields": {
        "temperature": {"type": "select", "label": "Health Temperature", "required": true, "options": ["green","yellow","red"]},
        "churn_risk_score": {"type": "number", "label": "Churn Risk Score (0-100)", "required": false},
        "adoption_score": {"type": "number", "label": "Adoption Score (0-100)", "required": false},
        "nps_score": {"type": "number", "label": "NPS Score (-100 to 100)", "required": false},
        "account_id": {"type": "string", "label": "Customer Account", "required": true},
        "notes": {"type": "text", "label": "CSM Notes", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  );

-- ============================================
-- 3. Customer Portal Item Types
-- ============================================

INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'customer-portal'),
    'item',
    'support_ticket',
    'Support Ticket',
    'Customer support request with AI-first escalation chain',
    'ticket',
    '#EF4444',
    '{
      "fields": {
        "status": {"type": "select", "label": "Status", "required": true, "options": ["open","ai_responding","community_escalated","human_assigned","resolved","closed"]},
        "priority": {"type": "select", "label": "Priority", "required": true, "options": ["low","medium","high","urgent"]},
        "tier": {"type": "select", "label": "Support Tier", "required": false, "options": ["core","custom","enterprise"]},
        "assigned_agent_id": {"type": "string", "label": "Assigned Agent", "required": false},
        "integrity_status": {"type": "select", "label": "Integrity Status", "required": false, "options": ["clean","modified","unknown"]}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'customer-portal'),
    'item',
    'community_post',
    'Community Post',
    'Community discussion post with voting and accepted answers',
    'message-circle',
    '#6366F1',
    '{
      "fields": {
        "category": {"type": "select", "label": "Category", "required": true, "options": ["general","help","showcase","announcement","feedback"]},
        "votes": {"type": "number", "label": "Vote Count", "required": false},
        "accepted_answer_id": {"type": "string", "label": "Accepted Answer", "required": false},
        "is_answered": {"type": "boolean", "label": "Answered", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'customer-portal'),
    'item',
    'kb_article',
    'Knowledge Base Article',
    'Help documentation and knowledge base article',
    'book-open',
    '#0EA5E9',
    '{
      "fields": {
        "slug": {"type": "string", "label": "URL Slug", "required": true},
        "tags": {"type": "array", "label": "Tags", "required": false},
        "helpful_count": {"type": "number", "label": "Helpful Count", "required": false},
        "not_helpful_count": {"type": "number", "label": "Not Helpful Count", "required": false},
        "content_markdown": {"type": "text", "label": "Article Content (Markdown)", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'customer-portal'),
    'item',
    'course_lesson',
    'Course Lesson',
    'Learning content unit — part of a course sequence',
    'graduation-cap',
    '#F97316',
    '{
      "fields": {
        "course_slug": {"type": "string", "label": "Course", "required": true},
        "sequence": {"type": "number", "label": "Lesson Order", "required": true},
        "content_type": {"type": "select", "label": "Content Type", "required": true, "options": ["video","text","quiz","exercise"]},
        "duration_minutes": {"type": "number", "label": "Duration (minutes)", "required": false},
        "content_url": {"type": "string", "label": "Content URL / Attachment ID", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'customer-portal'),
    'item',
    'integrity_report',
    'Integrity Report',
    'Spine core integrity check result from a customer deploy',
    'shield-check',
    '#84CC16',
    '{
      "fields": {
        "core_hash": {"type": "string", "label": "Core Hash (SHA-256)", "required": true},
        "manifest_hash": {"type": "string", "label": "Manifest Hash", "required": true},
        "status": {"type": "select", "label": "Status", "required": true, "options": ["clean","modified","unknown"]},
        "deploy_id": {"type": "string", "label": "Deploy ID", "required": false},
        "deploy_url": {"type": "string", "label": "Deploy URL", "required": false},
        "modified_files": {"type": "array", "label": "Modified Files", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  );

-- ============================================
-- 4. Marketplace Item Types
-- ============================================

INSERT INTO public.types (id, app_id, kind, slug, name, description, icon, color, design_schema, validation_schema, ownership, is_active)
VALUES
  (
    gen_random_uuid(),
    (SELECT id FROM public.apps WHERE slug = 'marketplace'),
    'item',
    'marketplace_app',
    'Marketplace App',
    'Spine app listing in the marketplace',
    'package',
    '#8B5CF6',
    '{
      "fields": {
        "status": {"type": "select", "label": "Listing Status", "required": true, "options": ["draft","submitted","approved","rejected","archived"]},
        "category": {"type": "select", "label": "Category", "required": true, "options": ["crm","support","productivity","analytics","integration","ai","devtools","other"]},
        "npm_package": {"type": "string", "label": "npm Package Name", "required": false},
        "git_url": {"type": "string", "label": "Git Repository URL", "required": false},
        "spine_version_min": {"type": "string", "label": "Minimum Spine Version", "required": false},
        "screenshots": {"type": "array", "label": "Screenshot URLs", "required": false},
        "install_count": {"type": "number", "label": "Install Count", "required": false},
        "rating": {"type": "number", "label": "Average Rating (1-5)", "required": false},
        "install_instructions": {"type": "object", "label": "Install Instructions (JSON)", "required": false}
      }
    }'::jsonb,
    '{}'::jsonb,
    'tenant',
    true
  );

-- ============================================
-- 5. Update nav_items for Customer Portal (generic app)
-- ============================================

UPDATE public.apps SET nav_items = '[
  {"id": "tickets", "label": "Support", "icon": "ticket", "path": "tickets", "type_slug": "support_ticket", "view": "default_list"},
  {"id": "community", "label": "Community", "icon": "message-circle", "path": "community", "type_slug": "community_post", "view": "default_list"},
  {"id": "knowledge-base", "label": "Knowledge Base", "icon": "book-open", "path": "kb", "type_slug": "kb_article", "view": "default_list"},
  {"id": "courses", "label": "Courses", "icon": "graduation-cap", "path": "courses", "type_slug": "course_lesson", "view": "default_list"},
  {"id": "integrity", "label": "Integrity Reports", "icon": "shield-check", "path": "integrity", "type_slug": "integrity_report", "view": "default_list"}
]'::jsonb
WHERE slug = 'customer-portal';

-- ============================================
-- 6. Update nav_items for Marketplace (generic app)
-- ============================================

UPDATE public.apps SET nav_items = '[
  {"id": "browse", "label": "Browse Apps", "icon": "package", "path": "browse", "type_slug": "marketplace_app", "view": "default_list"},
  {"id": "my-apps", "label": "My Submissions", "icon": "user", "path": "my-apps", "type_slug": "marketplace_app", "view": "default_list"}
]'::jsonb
WHERE slug = 'marketplace';
