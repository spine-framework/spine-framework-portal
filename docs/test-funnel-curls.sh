#!/bin/bash
# Funnel Signal API Test Script
# Usage: bash test-funnel-curls.sh

echo "========================================="
echo "Funnel Signal API Test Suite"
echo "========================================="
echo ""

# Configuration
API_BASE="https://localhost:8888"
MAR_KEY="spine_funnel_mar_test_key_001"
USE_KEY="spine_funnel_use_test_key_001"
TEST_ACCOUNT="12acec9b-8451-40e7-80d5-e80c4e2fc0de"

echo "1. Testing Marketing Signal - Page View (Light)"
echo "-----------------------------------------------"
curl -s -X POST "$API_BASE/api/integration-routes?slug=funnel-signal-mar" \
  -H "X-API-Key: $MAR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "anonymous_id": "anon_test_'$(date +%s)'",
    "session_id": "sess_test_'$(date +%s)'",
    "stage": "anonymous",
    "source": "mar",
    "action_type": "page_view",
    "action_value": 1,
    "action_description": "Test page view from curl",
    "url": "https://spine.io/docs",
    "referrer": "https://google.com"
  }' | jq . 2>/dev/null || echo "Response received (install jq for pretty printing)"

echo ""
echo ""
echo "2. Testing Marketing Signal - Pricing View (High Intent)"
echo "--------------------------------------------------------"
curl -s -X POST "$API_BASE/api/integration-routes?slug=funnel-signal-mar" \
  -H "X-API-Key: $MAR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "anonymous_id": "anon_test_'$(date +%s)'_2",
    "session_id": "sess_test_'$(date +%s)'_2",
    "stage": "anonymous",
    "source": "mar",
    "action_type": "pricing_view",
    "action_value": 5,
    "action_description": "Test pricing view - high intent",
    "url": "https://spine.io/pricing",
    "referrer": "https://spine.io/features"
  }' | jq . 2>/dev/null || echo "Response received"

echo ""
echo ""
echo "3. Testing Usage Signal - Workflow Create (High Value)"
echo "-------------------------------------------------------"
curl -s -X POST "$API_BASE/api/integration-routes?slug=funnel-signal-use" \
  -H "X-API-Key: $USE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "'$TEST_ACCOUNT'",
    "instance_id": "inst_test_'$(date +%s)'",
    "environment": "production",
    "stage": "installed",
    "source": "use",
    "action_type": "workflow_create",
    "action_value": 5,
    "action_description": "Test workflow creation"
  }' | jq . 2>/dev/null || echo "Response received"

echo ""
echo ""
echo "4. Testing Usage Signal - Dashboard View (Light)"
echo "------------------------------------------------"
curl -s -X POST "$API_BASE/api/integration-routes?slug=funnel-signal-use" \
  -H "X-API-Key: $USE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "'$TEST_ACCOUNT'",
    "instance_id": "inst_test_'$(date +%s)'_2",
    "environment": "production",
    "stage": "installed",
    "source": "use",
    "action_type": "dashboard_view",
    "action_value": 1,
    "action_description": "Test dashboard view"
  }' | jq . 2>/dev/null || echo "Response received"

echo ""
echo "========================================="
echo "Test Complete"
echo "========================================="
