# Funnel Signal API Documentation

## Overview

The Funnel Signal API ingests prospect and customer activity data from two sources:
- **Marketing (mar)**: Anonymous visitor activity from spine.io website
- **Usage (use)**: Authenticated user activity from Spine Portal

**Endpoint:** `POST /api/integration-routes?slug={integration}`

**Authentication:** API Key in `X-API-Key` header

---

## Integration Endpoints

| Environment | Integration Slug | API Key Prefix |
|-------------|------------------|----------------|
| Marketing | `funnel-signal-mar` | `spine_fun` |
| Usage | `funnel-signal-use` | `spine_fun` |

---

## Marketing Signals (funnel-signal-mar)

Used for anonymous visitor tracking on spine.io and marketing properties.

### Endpoint
```
POST /api/integration-routes?slug=funnel-signal-mar
```

### Headers
```
X-API-Key: spine_funnel_mar_test_key_001
Content-Type: application/json
```

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `anonymous_id` | string | No | UUID generated for this anonymous visitor (persisted in localStorage) |
| `person_id` | string | No | UUID of known person (if identified) |
| `account_id` | string | No | UUID of known account (if identified) |
| `session_id` | string | **Yes** | UUID for this browsing session (regenerates on 30min inactivity) |
| `stage` | string | **Yes** | Lifecycle stage: `anonymous`, `identified`, `installed` |
| `source` | string | **Yes** | Signal origin: `mar` (marketing site) |
| `action_type` | string | **Yes** | Activity identifier (e.g., `page_view`, `pricing_view`, `docs_read`) |
| `action_value` | integer | **Yes** | Engagement weight: `1` (light), `2` (medium), `5` (high) |
| `action_description` | string | No | Human-readable description |
| `occurred_at` | string (ISO8601) | No | When action happened (defaults to now) |
| `url` | string | No | Full page URL |
| `referrer` | string | No | Referrer URL (document.referrer) |
| `user_agent` | string | No | Browser user agent |
| `utm_source` | string | No | UTM campaign source |
| `utm_medium` | string | No | UTM campaign medium |
| `utm_campaign` | string | No | UTM campaign name |

### Action Value Guide

| Value | Type | Examples |
|-------|------|----------|
| `1` | Light | page_view, scroll, hover |
| `2` | Medium | time_on_page > 2min, scroll_depth > 50% |
| `5` | High | pricing_view, demo_request, docs_section_complete |

### Sample Marketing Calls

#### 1. Page View (Anonymous Visitor)
```json
{
  "anonymous_id": "anon_abc123",
  "session_id": "sess_xyz789",
  "stage": "anonymous",
  "source": "mar",
  "action_type": "page_view",
  "action_value": 1,
  "action_description": "Visited /blog/agentic-workflows",
  "url": "https://spine.io/blog/agentic-workflows",
  "referrer": "https://linkedin.com/posts/ai-workflows",
  "utm_source": "linkedin",
  "utm_medium": "social",
  "utm_campaign": "agentic_launch"
}
```

#### 2. Pricing Page View (High Intent)
```json
{
  "anonymous_id": "anon_abc123",
  "session_id": "sess_xyz789",
  "stage": "anonymous",
  "source": "mar",
  "action_type": "pricing_view",
  "action_value": 5,
  "action_description": "Viewed pricing page for 45 seconds",
  "url": "https://spine.io/pricing",
  "referrer": "https://spine.io/blog/agentic-workflows"
}
```

#### 3. Identified User Activity
```json
{
  "anonymous_id": "anon_abc123",
  "person_id": "per_456def",
  "account_id": "acc_789ghi",
  "session_id": "sess_xyz789",
  "stage": "identified",
  "source": "mar",
  "action_type": "docs_read",
  "action_value": 2,
  "action_description": "Read integration guide for 5 minutes",
  "url": "https://docs.spine.io/integrations/webhooks"
}
```

---

## Usage Signals (funnel-signal-use)

Used for authenticated user activity within the Spine Portal.

### Endpoint
```
POST /api/integration-routes?slug=funnel-signal-use
```

### Headers
```
X-API-Key: spine_funnel_use_test_key_001
Content-Type: application/json
```

### Request Body Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `anonymous_id` | string | No | Legacy anonymous ID (if transitioning) |
| `person_id` | string | No | UUID of authenticated person |
| `account_id` | string | **Yes** | UUID of the account/tenant |
| `session_id` | string | No | Portal session ID |
| `instance_id` | string | **Yes** | Spine instance identifier |
| `environment` | string | No | Deployment: `dev`, `staging`, `production` |
| `stage` | string | **Yes** | Lifecycle stage: `anonymous`, `identified`, `installed` |
| `source` | string | **Yes** | Signal origin: `use` (portal usage) |
| `action_type` | string | **Yes** | Activity identifier (e.g., `workflow_create`, `agent_run`) |
| `action_value` | integer | **Yes** | Engagement weight: `1` (light), `2` (medium), `5` (high) |
| `action_description` | string | No | Human-readable description |
| `occurred_at` | string (ISO8601) | No | When action happened (defaults to now) |

### Action Value Guide for Usage

| Value | Type | Examples |
|-------|------|----------|
| `1` | Light | page_navigate, view_dashboard, list_items |
| `2` | Medium | edit_config, invite_user, create_view |
| `5` | High | workflow_create, agent_run, integration_connect, billing_upgrade |

### Sample Usage Calls

#### 1. Workflow Creation (High Value)
```json
{
  "account_id": "acc_789ghi",
  "person_id": "per_456def",
  "instance_id": "inst_prod_123",
  "environment": "production",
  "stage": "installed",
  "source": "use",
  "action_type": "workflow_create",
  "action_value": 5,
  "action_description": "Created new automation workflow: Customer Onboarding"
}
```

#### 2. Agent Run (High Value)
```json
{
  "account_id": "acc_789ghi",
  "person_id": "per_456def",
  "instance_id": "inst_prod_123",
  "environment": "production",
  "stage": "installed",
  "source": "use",
  "action_type": "agent_run",
  "action_value": 5,
  "action_description": "Executed Cortex agent for data analysis"
}
```

#### 3. Dashboard View (Light)
```json
{
  "account_id": "acc_789ghi",
  "instance_id": "inst_prod_123",
  "environment": "production",
  "stage": "installed",
  "source": "use",
  "action_type": "dashboard_view",
  "action_value": 1,
  "action_description": "Viewed funnel analytics dashboard"
}
```

---

## Response Format

### Success Response (200)
```json
{
  "status": "success",
  "signal_id": "0923f7a2-3ccd-4499-986f-28c6fd0597d9",
  "rating": 4,
  "raw_score": 10.0,
  "account_updated": true,
  "session_created": false,
  "queue_entry": {
    "id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e"
  }
}
```

### Error Response (400/500)
```json
{
  "status": "rejected",
  "trace": [
    {
      "step": "6_schema_validation",
      "status": "FAIL",
      "detail": {
        "errors": ["Field 'action_value' must be one of: 1, 2, 5"]
      }
    }
  ]
}
```

### Field Descriptions in Response

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `success`, `error`, or `rejected` |
| `signal_id` | UUID | ID of created funnel_signal item |
| `rating` | integer | Calculated 1-5 rating based on score formula |
| `raw_score` | float | Raw calculated score (action_value × engagement ÷ recency) |
| `account_updated` | boolean | Whether linked account was updated with new rating |
| `session_created` | boolean | Whether new anonymous session was created |
| `queue_entry` | object | Opportunity queue entry if rating >= 4 (high engagement) |

---

## Scoring Formula

The raw score is calculated as:

```
Raw Score = Action Value × Engagement Type ÷ Recency Divisor

Where:
- Action Value: 1, 2, or 5
- Engagement Type: 1 (first_visit), 2 (deep_session), 5 (return_visit)
- Recency Divisor: 1 (fresh < 7 days), 2 (cooling 7-30 days), 5 (stale 30-90 days)

Final Rating:
- 1-2: Cold
- 3-4: Warm  
- 5: Hot
```

---

## Test curl Commands

### Test Marketing Signal (Page View)
```bash
curl -X POST https://api.spine.io/api/integration-routes?slug=funnel-signal-mar \
  -H "X-API-Key: spine_funnel_mar_test_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "anonymous_id": "anon_test_001",
    "session_id": "sess_test_001",
    "stage": "anonymous",
    "source": "mar",
    "action_type": "page_view",
    "action_value": 1,
    "action_description": "Test page view from documentation",
    "url": "https://spine.io/docs/funnel-intelligence",
    "referrer": "https://google.com/search?q=spine+funnel"
  }'
```

### Test Marketing Signal (High Intent - Pricing View)
```bash
curl -X POST https://api.spine.io/api/integration-routes?slug=funnel-signal-mar \
  -H "X-API-Key: spine_funnel_mar_test_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "anonymous_id": "anon_test_002",
    "session_id": "sess_test_002",
    "stage": "anonymous",
    "source": "mar",
    "action_type": "pricing_view",
    "action_value": 5,
    "action_description": "Test pricing page view - high intent signal",
    "url": "https://spine.io/pricing",
    "referrer": "https://spine.io/features"
  }'
```

### Test Usage Signal (Workflow Creation)
```bash
curl -X POST https://api.spine.io/api/integration-routes?slug=funnel-signal-use \
  -H "X-API-Key: spine_funnel_use_test_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "12acec9b-8451-40e7-80d5-e80c4e2fc0de",
    "person_id": "cab578c2-c295-476a-a8c5-dca3445aa4ac",
    "instance_id": "inst_test_001",
    "environment": "production",
    "stage": "installed",
    "source": "use",
    "action_type": "workflow_create",
    "action_value": 5,
    "action_description": "Test workflow creation - high value activity"
  }'
```

### Test Usage Signal (Dashboard View)
```bash
curl -X POST https://api.spine.io/api/integration-routes?slug=funnel-signal-use \
  -H "X-API-Key: spine_funnel_use_test_key_001" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "12acec9b-8451-40e7-80d5-e80c4e2fc0de",
    "instance_id": "inst_test_001",
    "environment": "production",
    "stage": "installed",
    "source": "use",
    "action_type": "dashboard_view",
    "action_value": 1,
    "action_description": "Test dashboard view - light activity"
  }'
```

---

## JavaScript Tracker Implementation

### Minimal Tracker Code
```javascript
// spine-funnel-tracker.js
(function() {
  const API_KEY = 'spine_funnel_mar_test_key_001';
  const API_URL = 'https://api.spine.io/api/integration-routes?slug=funnel-signal-mar';
  
  // Generate or retrieve IDs
  function getAnonymousId() {
    let id = localStorage.getItem('spine_anon_id');
    if (!id) {
      id = 'anon_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('spine_anon_id', id);
    }
    return id;
  }
  
  function getSessionId() {
    let id = sessionStorage.getItem('spine_session_id');
    if (!id) {
      id = 'sess_' + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('spine_session_id', id);
    }
    return id;
  }
  
  // Send signal
  async function sendSignal(actionType, actionValue, description) {
    const payload = {
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(),
      stage: 'anonymous',
      source: 'mar',
      action_type: actionType,
      action_value: actionValue,
      action_description: description,
      url: window.location.href,
      referrer: document.referrer
    };
    
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('[Funnel] Failed to send signal:', e);
    }
  }
  
  // Auto-track page views
  sendSignal('page_view', 1, `Viewed ${window.location.pathname}`);
  
  // Expose for manual tracking
  window.spineFunnel = { track: sendSignal };
})();
```

### Usage in HTML
```html
<script src="/spine-funnel-tracker.js" async></script>

<!-- Manual tracking for high-value actions -->
<button onclick="spineFunnel.track('demo_request', 5, 'Clicked demo button')">
  Request Demo
</button>
```

---

## Notes

1. **Idempotency:** Sending the same signal multiple times creates duplicate records. The scoring engine uses "best signal wins" logic per stage.

2. **Privacy:** Anonymous sessions are retained for 90 days then purged. No PII should be sent in `action_description`.

3. **Rate Limiting:** API keys have default rate limits. Batch high-frequency events client-side if needed.

4. **Attribution:** First-touch referrer is locked at session creation and preserved through identity stitching.

5. **Scoring Updates:** Account ratings are recalculated daily at 11:59 PM UTC for score decay.
