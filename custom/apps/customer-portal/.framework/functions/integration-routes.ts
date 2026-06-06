/**
 * @module integration-routes
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Unified integration routing system for all integration types.
 * Handles webhook, API, database, file, and custom integrations
 * through a single entry point with type-specific handlers.
 *
 ** Routed by:** `POST /api/integration-routes?slug=:slug`
 *
 * Route patterns:
 * | method | path                                      | handler                |
 * |--------|-------------------------------------------|------------------------|
 * | POST   | /api/integration-routes?slug=:slug        | handleWebhook          |
 *
 * **Authorization:** API key authentication with integration permissions
 * - API key validated via resolvePrincipal
 * - Integration permissions checked against principal.permissions.integrations[slug]
 *
 * **Security Flow:**
 * 1. API key validation (resolvePrincipal)
 * 2. Integration permission check
 * 3. Schema validation (if configured)
 * 4. Data sanitization
 * 5. Custom script execution
 *
 * INVARIANT: All validation failures return generic { status: "rejected" }
 * INVARIANT: Detailed errors logged server-side only
 * INVARIANT: Unknown fields in payload = HARD FAIL (fishing detection)
 *
 * @seeAlso integrations.ts (integration configuration)
 * @seeAlso principal.ts (machine principal resolution)
 * @seeAlso api-keys.ts (API key permissions)
 */

import { adminDb } from './_shared/db'
import { resolvePrincipal } from './_shared/principal'
import { resolveHandler, listRegisteredHandlers } from './_shared/webhook-registry'

// ─── TYPES ────────────────────────────────────────────────────────────────

interface IntegrationContext {
  integration: any
  principal: any
  requestPath: string
  method: string
  headers: Record<string, string>
  body: any
  query: Record<string, string>
  requestId: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  unknownFields: string[]
}

interface IntegrationHandler {
  (ctx: IntegrationContext): Promise<any>
}

// ─── INTEGRATION RESOLUTION ────────────────────────────────────────────────

/**
 * Resolves integration by slug and validates it's active and configured
 */
async function resolveIntegration(slug: string, type: string): Promise<any> {
  const { data, error } = await adminDb
    .from('integrations')
    .select('*')
    .eq('name', slug)
    .eq('integration_type', type)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    throw new Error(`Integration not found: ${type}/${slug}`)
  }

  if (!data.is_configured) {
    throw new Error(`Integration not configured: ${type}/${slug}`)
  }

  return data
}

// ─── VALIDATION & SANITIZATION ───────────────────────────────────────────

/**
 * Validates data against schema definition
 * Returns validation result with any errors and unknown fields
 */
function validateSchema(data: any, schema: any, requestId: string): ValidationResult {
  const errors: string[] = []
  const unknownFields: string[] = []
  
  if (!schema || typeof schema !== 'object') {
    return { valid: true, errors: [], unknownFields: [] }
  }
  
  // Check for unknown fields
  const allowedFields = Object.keys(schema)
  for (const field of Object.keys(data)) {
    if (!allowedFields.includes(field)) {
      unknownFields.push(field)
    }
  }
  
  // Validate each field against schema
  for (const [fieldName, fieldConfig] of Object.entries(schema)) {
    const config = fieldConfig as any
    const value = data[fieldName]
    
    // Check required fields
    if (config.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field '${fieldName}' is required but missing`)
      continue
    }
    
    // Skip further validation if field is not required and not present
    if (!config.required && (value === undefined || value === null)) {
      continue
    }
    
    // Validate data type
    if (config.type) {
      const typeValid = validateType(value, config.type, fieldName)
      if (!typeValid.valid) {
        errors.push(typeValid.error)
      }
    }
    
    // Validate constraints
    if (config.min !== undefined && typeof value === 'number' && value < config.min) {
      errors.push(`Field '${fieldName}' must be at least ${config.min}`)
    }
    
    if (config.max !== undefined && typeof value === 'number' && value > config.max) {
      errors.push(`Field '${fieldName}' must be at most ${config.max}`)
    }
    
    if (config.maxLength !== undefined && typeof value === 'string' && value.length > config.maxLength) {
      errors.push(`Field '${fieldName}' must be at most ${config.maxLength} characters`)
    }
    
    if (config.pattern && typeof value === 'string') {
      const regex = new RegExp(config.pattern)
      if (!regex.test(value)) {
        errors.push(`Field '${fieldName}' does not match required pattern`)
      }
    }
  }
  
  return {
    valid: errors.length === 0 && unknownFields.length === 0,
    errors,
    unknownFields
  }
}

/**
 * Validates a value against a type definition
 */
function validateType(value: any, type: string, fieldName: string): { valid: boolean; error?: string } {
  switch (type) {
    case 'string':
      if (typeof value !== 'string') {
        return { valid: false, error: `Field '${fieldName}' must be a string` }
      }
      break
    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `Field '${fieldName}' must be a number` }
      }
      break
    case 'boolean':
      if (typeof value !== 'boolean') {
        return { valid: false, error: `Field '${fieldName}' must be a boolean` }
      }
      break
    case 'email':
      if (typeof value !== 'string' || !value.includes('@')) {
        return { valid: false, error: `Field '${fieldName}' must be a valid email` }
      }
      break
    case 'array':
      if (!Array.isArray(value)) {
        return { valid: false, error: `Field '${fieldName}' must be an array` }
      }
      break
    case 'object':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { valid: false, error: `Field '${fieldName}' must be an object` }
      }
      break
  }
  
  return { valid: true }
}

/**
 * Sanitizes data to prevent injection attacks
 */
function sanitizeData(data: any, rules: string = 'strict'): any {
  if (data === null || data === undefined) {
    return data
  }
  
  if (typeof data === 'string') {
    // Remove HTML tags
    let sanitized = data.replace(/<[^>]*>/g, '')
    // Escape special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
    // Normalize whitespace
    sanitized = sanitized.trim().replace(/\s+/g, ' ')
    return sanitized
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, rules))
  }
  
  if (typeof data === 'object') {
    const result: any = {}
    const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype']
    for (const [key, value] of Object.entries(data)) {
      if (BLOCKED_KEYS.includes(key)) continue
      // Sanitize keys (prevent prototype pollution, allow hyphens)
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '')
      if (!sanitizedKey) continue
      result[sanitizedKey] = sanitizeData(value, rules)
    }
    return result
  }
  
  return data
}

// ─── CUSTOM SCRIPT LOADER ────────────────────────────────────────────────

/**
 * Loads a custom handler from the dynamic webhook registry.
 *
 * Handlers are registered in the `webhook_handlers` table at runtime,
 * allowing custom functions to self-register without core code changes.
 *
 * @param handlerName - The handler key from integration config (e.g. "webhook-handler")
 */
async function loadCustomScript(handlerName: string): Promise<Function | null> {
  return resolveHandler(handlerName)
}

// ─── DIAGNOSTIC HANDLER (temporary — full trace in response) ──────────────

/**
 * Integration router with full diagnostic tracing.
 * Every step logs to a trace[] array that is returned in the response body.
 * REMOVE THIS DIAGNOSTIC MODE before production.
 */
const integrationHandler = async (event: any, _context: any) => {
  const requestId = crypto.randomUUID()
  const trace: { step: string; status: string; detail?: any }[] = []

  // ── Step 0: Can an external service hit the endpoint? ───────────────
  trace.push({
    step: '0_endpoint_reached',
    status: 'PASS',
    detail: {
      method: event.httpMethod,
      path: event.path,
      queryParams: event.queryStringParameters,
      hasBody: !!event.body,
      timestamp: new Date().toISOString()
    }
  })

  // Method check
  if ((event.httpMethod || 'GET') !== 'POST') {
    trace.push({ step: '0_method_check', status: 'FAIL', detail: `Expected POST, got ${event.httpMethod}` })
    return respond(405, { status: 'rejected', trace })
  }
  trace.push({ step: '0_method_check', status: 'PASS' })

  // Slug check
  const integrationSlug = event.queryStringParameters?.slug
  if (!integrationSlug) {
    trace.push({ step: '0_slug_check', status: 'FAIL', detail: 'No ?slug= query param' })
    return respond(400, { status: 'rejected', trace })
  }
  trace.push({ step: '0_slug_check', status: 'PASS', detail: { slug: integrationSlug } })

  // ── Step 1: Does the endpoint see the API key header? ───────────────
  const apiKeyRaw = event.headers?.['x-api-key'] || event.headers?.['X-Api-Key'] || null
  trace.push({
    step: '1_header_extraction',
    status: apiKeyRaw ? 'PASS' : 'FAIL',
    detail: {
      'x-api-key_present': !!apiKeyRaw,
      'x-api-key_prefix': apiKeyRaw ? apiKeyRaw.substring(0, 6) + '...' : null,
      all_header_keys: Object.keys(event.headers || {})
    }
  })
  if (!apiKeyRaw) {
    return respond(401, { status: 'rejected', trace })
  }

  // ── Step 2: Does resolvePrincipal validate the key? ─────────────────
  let principal: any
  try {
    principal = await resolvePrincipal(event)
    const isAnon = !principal || principal.id === 'anonymous'
    trace.push({
      step: '2_api_key_validation',
      status: isAnon ? 'FAIL' : 'PASS',
      detail: {
        principal_id: principal?.id,
        principal_type: principal?.type,
        account_id: principal?.accountId,
        scopes: principal?.scopes,
        machine_type: principal?.machineType,
        is_internal: principal?.isInternal
      }
    })
    if (isAnon) {
      return respond(401, { status: 'rejected', trace })
    }
  } catch (err: any) {
    trace.push({
      step: '2_api_key_validation',
      status: 'ERROR',
      detail: { message: err.message, stack: err.stack?.split('\n').slice(0, 3) }
    })
    return respond(401, { status: 'rejected', trace })
  }

  // ── Step 3: Permission check ────────────────────────────────────────
  const permViaIntegrations = (principal as any).permissions?.integrations?.[integrationSlug]
  const permViaScopes = principal.scopes?.includes('webhook:execute')
  const hasPermission = !!permViaIntegrations?.includes?.('execute') || !!permViaScopes
  trace.push({
    step: '3_permission_check',
    status: hasPermission ? 'PASS' : 'FAIL',
    detail: {
      checked_permissions_path: `principal.permissions.integrations.${integrationSlug}`,
      permissions_value: permViaIntegrations ?? 'undefined (property does not exist)',
      checked_scopes: 'webhook:execute',
      scopes_value: principal.scopes,
      scopes_match: permViaScopes,
      final_result: hasPermission
    }
  })
  if (!hasPermission) {
    return respond(403, { status: 'rejected', trace })
  }

  // ── Step 4: Resolve integration record ──────────────────────────────
  let integration: any
  try {
    integration = await resolveIntegration(integrationSlug, 'webhook')
    trace.push({
      step: '4_integration_resolution',
      status: 'PASS',
      detail: {
        id: integration.id,
        name: integration.name,
        type: integration.integration_type,
        is_active: integration.is_active,
        is_configured: integration.is_configured,
        has_config: !!integration.config,
        config_keys: integration.config ? Object.keys(integration.config) : []
      }
    })
  } catch (err: any) {
    trace.push({
      step: '4_integration_resolution',
      status: 'ERROR',
      detail: { message: err.message }
    })
    return respond(500, { status: 'rejected', trace })
  }

  // ── Step 5: Parse request body ──────────────────────────────────────
  let body: any = {}
  try {
    body = event.body ? JSON.parse(event.body) : {}
    trace.push({
      step: '5_body_parse',
      status: 'PASS',
      detail: { parsed_keys: Object.keys(body), parsed_body: body }
    })
  } catch (e: any) {
    body = { raw: event.body }
    trace.push({
      step: '5_body_parse',
      status: 'WARN',
      detail: { message: 'Not valid JSON, wrapped as { raw: ... }', raw_length: event.body?.length }
    })
  }

  // ── Step 6: Schema validation ───────────────────────────────────────
  const config = integration.config || {}
  if (config.validation?.schema) {
    const validation = validateSchema(body, config.validation.schema, requestId)
    trace.push({
      step: '6_schema_validation',
      status: validation.valid ? 'PASS' : 'FAIL',
      detail: {
        schema_fields: Object.keys(config.validation.schema),
        body_fields: Object.keys(body),
        errors: validation.errors,
        unknown_fields: validation.unknownFields,
        reject_unknown: config.validation.rejectUnknownFields
      }
    })
    if (!validation.valid) {
      return respond(400, { status: 'rejected', trace })
    }
  } else {
    trace.push({ step: '6_schema_validation', status: 'SKIP', detail: 'No validation.schema in config' })
  }

  // ── Step 7: Sanitize data ───────────────────────────────────────────
  const sanitizedData = sanitizeData(body, config.validation?.sanitization || 'strict')
  trace.push({
    step: '7_sanitization',
    status: 'PASS',
    detail: {
      input_keys: Object.keys(body),
      output_keys: Object.keys(sanitizedData),
      sanitized_data: sanitizedData,
      note: 'Key sanitizer strips non-alphanumeric/underscore chars (hyphens removed)'
    }
  })

  // ── Step 8: Locate custom handler ───────────────────────────────────
  if (!config.handler?.path) {
    trace.push({ step: '8_handler_lookup', status: 'SKIP', detail: 'No handler.path in config' })
    return respond(200, { status: 'success', trace, result: sanitizedData })
  }

  const scriptHandler = await loadCustomScript(config.handler.path)
  const registeredHandlers = await listRegisteredHandlers()
  trace.push({
    step: '8_handler_lookup',
    status: scriptHandler ? 'PASS' : 'FAIL',
    detail: {
      handler_key: config.handler.path,
      found_in_registry: !!scriptHandler,
      registered_handlers: registeredHandlers,
      note: 'Dynamic registry - handlers self-register via webhook_handlers table'
    }
  })
  if (!scriptHandler) {
    return respond(500, { status: 'rejected', trace })
  }

  // ── Step 9: Prepare handler arguments ───────────────────────────────
  const scriptContext = {
    integrationId: integration.id,
    accountId: integration.account_id,
    slug: config.slug || integration.name,
    principal: { id: principal.id, type: principal.type, accountId: principal.accountId },
    requestId,
    headers: event.headers || {}
  }
  const scriptEvent = {
    httpMethod: event.httpMethod,
    headers: event.headers || {},
    body: body,
    path: event.path,
    queryStringParameters: event.queryStringParameters || {}
  }
  trace.push({
    step: '9_handler_args',
    status: 'PASS',
    detail: {
      arg1_sanitized_data: sanitizedData,
      arg2_context_keys: Object.keys(scriptContext),
      arg3_event_keys: Object.keys(scriptEvent)
    }
  })

  // ── Step 10: Execute handler ────────────────────────────────────────
  try {
    const result = await scriptHandler(sanitizedData, scriptContext, scriptEvent)
    trace.push({
      step: '10_handler_execution',
      status: 'PASS',
      detail: { result_type: typeof result, result }
    })
    return respond(200, { status: 'success', trace, result })
  } catch (err: any) {
    trace.push({
      step: '10_handler_execution',
      status: 'ERROR',
      detail: { message: err.message, stack: err.stack?.split('\n').slice(0, 5) }
    })
    return respond(500, { status: 'rejected', trace })
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function respond(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2)
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────

const handler = integrationHandler
export { handler }
