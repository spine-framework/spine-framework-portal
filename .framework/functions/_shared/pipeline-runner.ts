/**
 * @module pipeline-runner
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * Sequential pipeline execution engine. A pipeline is a named list of stages
 * (`PipelineStage[]`) stored in `pipelines.stages`. Each stage references an
 * `action` record by `stage_type` slug. Stages run sequentially; a failed stage
 * halts execution unless `stage.continue_on_error` is set.
 *
 * Every execution creates a `pipeline_executions` row (status: running →
 * completed | failed) and emits an audit log on completion or failure.
 *
 * Built-in stage handlers (no external config required):
 *   - `update_item`      — update a record by ID
 *   - `create_record`    — insert a new record
 *   - `http_request`     — fetch any HTTP endpoint
 *   - `send_notification`— insert watchers notification rows
 *   - `run_pipeline`     — trigger a nested pipeline (self-recursion blocked)
 *   - `search_knowledge` — full-text + fallback search on embeddings table
 *   - `query_items`      — filtered query on any table
 *   - `agent_inference`  — call an external LLM webhook or return a mock
 *
 * INVARIANT: `adminDb` (service role) is used for all DB writes — stage
 *   execution runs as the pipeline's machine principal, not the end user.
 * INVARIANT: `run_pipeline` handler blocks self-referential execution
 *   (`config._pipelineId === pipeline_id`) to prevent infinite loops.
 * INVARIANT: `runPipeline` never throws — failures are captured in the
 *   returned `ExecutionResult` with `status: 'failed'`.
 *
 * @seeAlso trigger-engine.ts (calls runPipeline when a trigger fires)
 * @seeAlso agent-runner.ts (calls runPipeline for agentic tool calls)
 * @seeAlso audit.ts (emitAudit called on pipeline.completed / pipeline.failed)
 * @seeAlso index.ts (runPipeline re-exported for v2-custom/ and CLI)
 */

import { CoreContext } from './middleware'
import { adminDb } from './db'
import { emitAudit } from './audit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v: string | undefined | null): v is string { return !!v && UUID_RE.test(v) }

// ─── TYPES ──────────────────────────────────────────────────────────────

/**
 * Result of a single pipeline stage execution.
 *
 * @outputSpec stageIndex: number — 0-based position in the pipeline's stages array
 * @outputSpec stageType: string — action slug (e.g. 'update_item', 'http_request')
 * @outputSpec status: 'success' | 'failed' | 'skipped'
 * @outputSpec output: any | undefined — handler return value on success
 * @outputSpec error: string | undefined — error message on failure
 * @outputSpec durationMs: number — wall-clock time for this stage
 */
export interface StageResult {
  stageIndex: number
  stageType: string
  status: 'success' | 'failed' | 'skipped'
  output?: any
  error?: string
  durationMs: number
}

/**
 * Top-level result of a `runPipeline` call. Stored in `pipeline_executions.result`.
 *
 * @outputSpec executionId: string — UUID of the pipeline_executions row
 * @outputSpec pipelineId: string — UUID of the pipeline that was run
 * @outputSpec status: 'completed' | 'failed' | 'cancelled'
 * @outputSpec stages: StageResult[] — per-stage results in execution order
 * @outputSpec durationMs: number — total wall-clock time
 * @outputSpec error: string | undefined — top-level error message on failure
 */
export interface ExecutionResult {
  executionId: string
  pipelineId: string
  status: 'completed' | 'failed' | 'cancelled'
  stages: StageResult[]
  durationMs: number
  error?: string
}

/**
 * Single stage definition as stored in `pipelines.stages` JSONB array.
 *
 * @inputSpec stage_type: string — action.slug to look up the handler
 * @inputSpec config: Record<string, any> | undefined — merged with action defaults
 * @inputSpec continue_on_error: boolean | undefined — if true, failure doesn’t halt
 */
interface PipelineStage {
  stage_type: string
  config?: Record<string, any>
  continue_on_error?: boolean
}

// ─── PRIMARY EXPORT ────────────────────────────────────────────────────────────

/**
 * Executes a pipeline by ID, running its stages sequentially.
 *
 * Execution lifecycle:
 *   1. Load pipeline record (`pipelines` table, `is_active = true`)
 *   2. Insert `pipeline_executions` row with `status: 'running'`
 *   3. For each stage: load action → merge config → call `executeStage`
 *   4. On stage failure: push failed StageResult; stop unless `continue_on_error`
 *   5. Update `pipeline_executions` to `completed` or `failed`
 *   6. Emit `pipeline.completed` or `pipeline.failed` audit log
 *   7. Return `ExecutionResult` (never throws; failures are in result.status)
 *
 * @param pipelineId - UUID of the pipeline to run (must be active)
 * @param triggerData - Arbitrary context passed to each stage as `_triggerData`
 * @param ctx - CoreContext with principal and accountId for audit and stage writes
 * @returns Promise<ExecutionResult> — always resolves; never throws
 * @throws Error('Pipeline not found or inactive') — only if pipeline lookup fails
 *   before execution begins (throws before creating the execution row)
 * @throws Error('Failed to create execution') — if execution row insert fails
 * @inputSpec pipelineId: string — valid UUID of a pipeline in pipelines table
 * @inputSpec triggerData: any — JSON-serializable; stored in trigger_data column
 * @inputSpec ctx.accountId: string | null — stamped on execution row
 * @inputSpec ctx.principal.id: string — stamped as created_by on execution row
 * @outputSpec ExecutionResult with status, stages, durationMs
 * @sideEffects DB write: inserts pipeline_executions row; updates it on completion
 * @sideEffects DB write: emitAudit to logs table
 * @calledBy trigger-engine.ts (on trigger fire)
 * @calledBy agent-runner.ts (tool call dispatch)
 * @calledBy stageHandlers.run_pipeline (nested execution)
 * @calledBy v2-custom/ import callers and CLI
 * @calls executeStage, adminDb, emitAudit
 * @testUnit tests/unit/pipeline-runner.test.ts
 * @testIntegration tests/integration/pipeline-runner.test.ts
 *
 * @example API handler trigger
 * ```ts
 * import { runPipeline } from './_shared/index'
 * const result = await runPipeline(body.pipeline_id, body.data, ctx)
 * if (result.status === 'failed') return error(result.error!, 500)
 * return result
 * ```
 *
 * @example Import usage (v2-custom/)
 * ```ts
 * import { runPipeline, SYSTEM_PRINCIPAL, adminDb, CoreContext } from '../_shared/index'
 * const ctx: CoreContext = { principal: SYSTEM_PRINCIPAL, accountId: MY_ACCOUNT, db: adminDb, requestId: crypto.randomUUID() }
 * const result = await runPipeline('pipeline-uuid', { source: 'import' }, ctx)
 * ```
 */
export async function runPipeline(
  pipelineId: string,
  triggerData: any,
  ctx: CoreContext
): Promise<ExecutionResult> {
  const startTime = Date.now()

  // Load pipeline definition
  const { data: pipeline, error: pipelineError } = await adminDb
    .from('pipelines')
    .select('*')
    .eq('id', pipelineId)
    .eq('is_active', true)
    .single()

  if (pipelineError || !pipeline) {
    throw new Error(`Pipeline not found or inactive: ${pipelineId}`)
  }

  // Create execution record
  const { data: execution, error: execError } = await adminDb
    .from('pipeline_executions')
    .insert({
      pipeline_id: pipelineId,
      status: 'running',
      trigger_data: triggerData || {},
      account_id: ctx.accountId,
      created_by: isUuid(ctx.principal?.id) ? ctx.principal?.id : null,
      started_at: new Date().toISOString()
    })
    .select()
    .single()

  if (execError || !execution) {
    throw new Error(`Failed to create execution: ${execError?.message}`)
  }

  const executionId = execution.id
  const stageResults: StageResult[] = []
  const stages: PipelineStage[] = pipeline.stages || []

  try {
    // Execute each stage sequentially
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const stageStartTime = Date.now()

      try {
        // Load action for this stage type
        const { data: action, error: actionError } = await adminDb
          .from('actions')
          .select('*')
          .eq('slug', stage.stage_type)
          .eq('is_active', true)
          .single()

        if (actionError || !action) {
          throw new Error(`Action not found for stage type: ${stage.stage_type}`)
        }

        // Merge stage config with action defaults
        const mergedConfig = {
          ...action.config,
          ...stage.config,
          _pipelineId: pipelineId,
          _executionId: executionId,
          _stageIndex: i,
          _triggerData: triggerData
        }

        // Execute the stage
        const output = await executeStage(ctx, action, mergedConfig)

        stageResults.push({
          stageIndex: i,
          stageType: stage.stage_type,
          status: 'success',
          output,
          durationMs: Date.now() - stageStartTime
        })

      } catch (stageError: any) {
        const errorMessage = stageError.message || 'Stage execution failed'
        
        stageResults.push({
          stageIndex: i,
          stageType: stage.stage_type,
          status: 'failed',
          error: errorMessage,
          durationMs: Date.now() - stageStartTime
        })

        // Stop unless continue_on_error is set
        if (!stage.continue_on_error) {
          throw new Error(`Stage ${i} (${stage.stage_type}) failed: ${errorMessage}`)
        }
      }
    }

    // Complete successfully
    const durationMs = Date.now() - startTime
    
    await adminDb
      .from('pipeline_executions')
      .update({
        status: 'completed',
        result: { stages: stageResults },
        completed_at: new Date().toISOString(),
        duration_ms: durationMs
      })
      .eq('id', executionId)

    await emitAudit(ctx, 'pipeline.completed', {
      type: 'pipeline_execution',
      id: executionId,
      account_id: ctx.accountId ?? undefined
    }, {
      pipeline_id: pipelineId,
      duration_ms: durationMs,
      stages_completed: stageResults.length
    })

    return {
      executionId,
      pipelineId,
      status: 'completed',
      stages: stageResults,
      durationMs
    }

  } catch (error: any) {
    // Complete with failure
    const durationMs = Date.now() - startTime
    
    await adminDb
      .from('pipeline_executions')
      .update({
        status: 'failed',
        result: { stages: stageResults },
        error_message: error.message,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs
      })
      .eq('id', executionId)

    await emitAudit(ctx, 'pipeline.failed', {
      type: 'pipeline_execution',
      id: executionId,
      account_id: ctx.accountId ?? undefined
    }, {
      pipeline_id: pipelineId,
      error: error.message,
      stages_completed: stageResults.length
    })

    return {
      executionId,
      pipelineId,
      status: 'failed',
      stages: stageResults,
      durationMs,
      error: error.message
    }
  }
}

// ─── STAGE DISPATCH ────────────────────────────────────────────────────────────

/**
 * Dispatches a single stage to the correct handler module.
 *
 * Routes based on `action.handler_module`:
 *   - `'functions'`    → `executeFunctionHandler` (built-in stageHandlers)
 *   - `'integrations'` → `executeIntegrationHandler` (loads integration by slug)
 *   - `'webhook'`      → `executeWebhookHandler` (calls action.config.url)
 *
 * @param ctx - CoreContext
 * @param action - Action record from the `actions` table
 * @param config - Merged stage + action config with `_pipelineId`, `_executionId`,
 *   `_stageIndex`, `_triggerData` injected by runPipeline
 * @returns Promise<any> — handler output
 * @throws Error('Unknown handler module') on unrecognised module string
 * @inputSpec action.handler_module: 'functions' | 'integrations' | 'webhook'
 * @inputSpec action.handler: string — handler name or integration slug
 * @sideEffects depends on handler module (DB writes, HTTP calls)
 * @calledBy runPipeline (per-stage loop)
 * @calls executeFunctionHandler | executeIntegrationHandler | executeWebhookHandler
 */
async function executeStage(
  ctx: CoreContext,
  action: any,
  config: any
): Promise<any> {
  const handlerModule = action.handler_module || 'functions'
  const handlerName = action.handler

  switch (handlerModule) {
    case 'functions':
      return await executeFunctionHandler(ctx, handlerName, config)
    
    case 'integrations':
      return await executeIntegrationHandler(ctx, handlerName, config)
    
    case 'webhook':
      return await executeWebhookHandler(ctx, action, config)
    
    default:
      throw new Error(`Unknown handler module: ${handlerModule}`)
  }
}

// ─── BUILT-IN STAGE HANDLERS ─────────────────────────────────────────────────────────

/**
 * Map of built-in stage handler functions keyed by action slug.
 *
 * Each handler receives `(ctx: CoreContext, config: any)` and returns a
 * JSON-serializable result or throws on failure. Registered handlers:
 *
 * | Slug                | Required config keys              | Returns                        |
 * |---------------------|-----------------------------------|--------------------------------|
 * | `update_item`       | `entity`, `record_id`, `data`     | `{ success, record }`          |
 * | `create_record`     | `entity`, `data`                  | `{ success, record }`          |
 * | `http_request`      | `url`                             | `{ success, status, body }`    |
 * | `send_notification` | `message`, `recipients[]`         | `{ success, notified_count }`  |
 * | `run_pipeline`      | `pipeline_id`                     | `{ success, nested_result }`   |
 * | `search_knowledge`  | `query`                           | `{ results[], count, method }` |
 * | `query_items`       | `entity`                          | `{ items[], count }`           |
 * | `agent_inference`   | `context`                         | `{ content, confidence, ... }` |
 *
 * @sideEffects DB writes for update_item, create_record, send_notification
 * @sideEffects HTTP calls for http_request, agent_inference (webhook_url)
 * @calledBy executeFunctionHandler
 */
const stageHandlers: Record<string, Function> = {
  'update_item': async (ctx: CoreContext, config: any) => {
    const { entity, record_id, data } = config
    
    if (!entity || !record_id) {
      throw new Error('entity and record_id are required for update_item')
    }

    const { data: result, error } = await adminDb
      .from(entity)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
        updated_by: ctx.principal?.id
      })
      .eq('id', record_id)
      .select()
      .single()

    if (error) throw new Error(`Update failed: ${error.message}`)
    return { success: true, record: result }
  },

  'create_record': async (ctx: CoreContext, config: any) => {
    const { entity, data } = config
    
    if (!entity || !data) {
      throw new Error('entity and data are required for create_record')
    }

    const { data: result, error } = await adminDb
      .from(entity)
      .insert({
        ...data,
        account_id: ctx.accountId,
        created_by: isUuid(ctx.principal?.id) ? ctx.principal?.id : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw new Error(`Create failed: ${error.message}`)
    return { success: true, record: result }
  },

  'http_request': async (ctx: CoreContext, config: any) => {
    const { method = 'GET', url, headers = {}, body } = config
    
    if (!url) {
      throw new Error('url is required for http_request')
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }

    if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    const responseBody = await response.json().catch(() => null)

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseBody
    }
  },

  'send_notification': async (ctx: CoreContext, config: any) => {
    const { message, entity_type, entity_id, recipients = [] } = config
    
    // Create watcher notifications
    const notifications = recipients.map((recipientId: string) => ({
      account_id: ctx.accountId,
      person_id: recipientId,
      message,
      entity_type: entity_type || 'pipeline_execution',
      entity_id: entity_id || ctx.requestId,
      is_read: false,
      created_at: new Date().toISOString()
    }))

    if (notifications.length > 0) {
      const { error } = await adminDb
        .from('watchers')
        .insert(notifications)

      if (error) throw new Error(`Notification failed: ${error.message}`)
    }

    return { success: true, notified_count: notifications.length }
  },

  'run_pipeline': async (ctx: CoreContext, config: any) => {
    const { pipeline_id, trigger_data = {} } = config
    
    if (!pipeline_id) {
      throw new Error('pipeline_id is required for run_pipeline')
    }

    // Prevent infinite recursion
    if (config._pipelineId === pipeline_id) {
      throw new Error('Recursive pipeline execution prevented')
    }

    const result = await runPipeline(pipeline_id, trigger_data, ctx)
    return { 
      success: result.status === 'completed',
      execution_id: result.executionId,
      nested_result: result 
    }
  },

  'search_knowledge': async (ctx: CoreContext, config: any) => {
    const { query, knowledge_sources, model_id, limit = 5, threshold = 0.7 } = config
    
    if (!query) {
      throw new Error('query is required for search_knowledge')
    }

    // Text search fallback (when no embedding provided)
    let dbQuery = adminDb
      .from('embeddings')
      .select('*')
      .eq('account_id', ctx.accountId)
      .limit(limit)

    if (knowledge_sources && knowledge_sources.length > 0) {
      dbQuery = dbQuery.in('document_id', knowledge_sources)
    }

    if (model_id) {
      dbQuery = dbQuery.eq('model_id', model_id)
    }

    // Try text search first
    const { data: textResults, error: textError } = await dbQuery
      .textSearch('content', query, { type: 'websearch', config: 'english' })

    if (!textError && textResults && textResults.length > 0) {
      return {
        results: textResults,
        count: textResults.length,
        method: 'text_search',
        query
      }
    }

    // Fallback to ilike search
    const { data: fallbackResults, error: fallbackError } = await dbQuery
      .ilike('content', `%${query}%`)

    if (fallbackError) {
      throw new Error(`Knowledge search failed: ${fallbackError.message}`)
    }

    return {
      results: fallbackResults || [],
      count: fallbackResults?.length || 0,
      method: 'fallback_ilike',
      query
    }
  },

  'query_items': async (ctx: CoreContext, config: any) => {
    const { entity, filters = {}, query, limit = 10 } = config
    
    if (!entity) {
      throw new Error('entity is required for query_items')
    }

    let dbQuery = adminDb
      .from(entity)
      .select('*')
      .eq('account_id', ctx.accountId)
      .limit(parseInt(limit.toString()))

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      dbQuery = dbQuery.eq(key, value)
    })

    // Add text search if query provided
    if (query) {
      dbQuery = dbQuery.textSearch('data', query, { type: 'websearch', config: 'english' })
    }

    const { data, error } = await dbQuery

    if (error) throw new Error(`Query failed: ${error.message}`)
    return { items: data || [], count: data?.length || 0 }
  },

  'agent_inference': async (ctx: CoreContext, config: any) => {
    const { context, model, temperature, max_tokens, webhook_url, headers = {} } = config
    
    if (!context) {
      throw new Error('context is required for agent_inference')
    }

    // If webhook_url provided, call external LLM service
    if (webhook_url) {
      const response = await fetch(webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          context,
          model: model || 'gpt-4o',
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 4000
        })
      })

      if (!response.ok) {
        throw new Error(`Inference failed: ${response.status} ${response.statusText}`)
      }

      const result: any = await response.json()
      return {
        content: result.content || result.message || '',
        confidence: result.confidence || 0.8,
        tool_calls: result.tool_calls,
        metadata: result.metadata,
        model: model || 'gpt-4o'
      }
    }

    // Fallback: return mock for development/testing
    return {
      content: `[Mock Response] Received ${context.length} chars of context. In production, configure webhook_url in action config.`,
      confidence: 0.9,
      tool_calls: null,
      metadata: { mock: true },
      model: model || 'gpt-4o'
    }
  }
}

// ─── MODULE DISPATCHERS ────────────────────────────────────────────────────────────

/**
 * Looks up a built-in handler by name and calls it.
 *
 * @throws Error('Unknown function handler: <name>') if not in stageHandlers map
 * @calledBy executeStage (functions module)
 * @calls stageHandlers[handlerName]
 */
async function executeFunctionHandler(
  ctx: CoreContext,
  handlerName: string,
  config: any
): Promise<any> {
  const handler = stageHandlers[handlerName]
  
  if (!handler) {
    throw new Error(`Unknown function handler: ${handlerName}`)
  }

  return await handler(ctx, config)
}

/**
 * Loads an integration record by slug and executes it.
 *
 * Currently a stub — logs the call and returns the integration ID.
 * Future: delegate to integration-specific executor based on integration type.
 *
 * @throws Error('Integration not found') if no active integration matches slug
 * @sideEffects DB read: integrations table
 * @calledBy executeStage (integrations module)
 */
async function executeIntegrationHandler(
  ctx: CoreContext,
  handlerName: string,
  config: any
): Promise<any> {
  // Load integration configuration
  const { data: integration, error } = await adminDb
    .from('integrations')
    .select('*')
    .eq('slug', handlerName)
    .eq('is_active', true)
    .single()

  if (error || !integration) {
    throw new Error(`Integration not found: ${handlerName}`)
  }

  // Execute based on integration type
  // This is a placeholder for actual integration logic
  console.log(`[${ctx.requestId}] Integration handler: ${handlerName}`, config)
  
  return { 
    success: true, 
    handler: handlerName,
    integration_id: integration.id
  }
}

/**
 * POSTs the merged stage config as JSON to the webhook URL from action.config.url.
 *
 * Returns `{ success, status, body }` based on the HTTP response. Does not
 * throw on non-2xx responses — `success: false` is returned instead.
 *
 * @throws Error('Webhook URL not configured') if action.config.url is missing
 * @sideEffects HTTP call to action.config.url
 * @calledBy executeStage (webhook module)
 */
async function executeWebhookHandler(
  ctx: CoreContext,
  action: any,
  config: any
): Promise<any> {
  const { url, method = 'POST', headers = {} } = action.config || {}
  
  if (!url) {
    throw new Error('Webhook URL not configured in action')
  }

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(config)
  }

  const response = await fetch(url, fetchOptions)
  const body = await response.json().catch(() => null)

  return {
    success: response.ok,
    status: response.status,
    body
  }
}
