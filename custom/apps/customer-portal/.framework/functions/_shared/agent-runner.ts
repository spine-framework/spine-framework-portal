/// <reference types="node" />
/**
 * @module agent-runner
 * @audience both
 * @layer shared-core
 * @stability stable
 *
 * AI agent inference orchestrator with RAG, tool dispatch, and confidence-based
 * escalation. All agent behavior is defined via JSONB configuration stored in
 * existing schema tables — no dedicated migrations are needed.
 *
 * Configuration resolution chain (highest to lowest priority):
 *   1. `thread.data.agent_id` → `thread.type.design_schema.default_agent_id`
 *   2. `thread.data.prompt_config_id` → `agent.metadata.default_prompt_config_id`
 *
 * Inference loop (per `runAgent` call):
 *   1. `resolveAgentConfig` — resolve agent + prompt_config from thread
 *   2. Save user message to `messages` table
 *   3. `executeAgentInference` — iterative tool-call loop (max 5 iterations):
 *      a. `buildContext` — assemble system prompt + RAG + history + tools
 *      b. `callInference` — call OpenAI-compatible API (or return mock)
 *      c. `dispatchTools` — execute any tool_calls via actions table
 *      d. Rebuild context with tool results and repeat
 *   4. Confidence check — if below threshold, `handleEscalation`
 *   5. Save agent response to `messages` table
 *   6. Emit `agent.inference.completed` audit log
 *
 * Environment variables used by `callInference`:
 *   - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_API_KEY` — LLM auth
 *   - `OPENAI_BASE_URL` / `LLM_BASE_URL` — API base URL (default: OpenAI)
 *   - `LLM_DEFAULT_MODEL` — model name fallback (default: 'gpt-4o')
 *
 * INVARIANT: if no API key is set, `callInference` returns a mock response
 *   instead of throwing — safe for local development without credentials.
 * INVARIANT: `runAgent` throws on critical failures (config missing, inference
 *   error) — callers must handle the rejection.
 * INVARIANT: `resolveAgentConfig` returns null (not throws) on missing config;
 *   `runAgent` converts this to a throw.
 *
 * @seeAlso pipeline-runner.ts (tool dispatch calls runPipeline for run_pipeline tool)
 * @seeAlso audit.ts (emitAudit for agent.inference.* events)
 * @seeAlso index.ts (runAgent, resolveAgentConfig re-exported)
 */

import { CoreContext } from './middleware'
import { adminDb } from './db'
import { emitAudit } from './audit'

// ─── TYPES ───────────────────────────────────────────────────────────────

/**
 * Resolved agent configuration bundle. Output of `resolveAgentConfig`.
 * Passed to `executeAgentInference` and `buildContext`.
 *
 * @outputSpec agent: ai_agents row (system_prompt, model_config, metadata)
 * @outputSpec promptConfig: prompt_configs row (context_template,
 *   knowledge_sources, available_tools, confidence_threshold, escalation_*)
 * @outputSpec thread: threads row with joined type record
 * @outputSpec threadType: types row (design_schema.default_agent_id)
 */
export interface AgentConfig {
  agent: any
  promptConfig: any
  thread: any
  threadType: any
}

/**
 * Structured result from a single LLM inference call.
 *
 * @outputSpec content: string — agent response text
 * @outputSpec confidence: number — 0-1 score; derived from logprobs or 0.85 default
 * @outputSpec tool_calls: ToolCall[] | undefined — tools the model wants to call
 * @outputSpec metadata: { model, usage, finish_reason } | undefined
 */
export interface InferenceResult {
  content: string
  confidence: number
  tool_calls?: ToolCall[]
  metadata?: Record<string, any>
}

/**
 * A single tool invocation requested by the LLM in an `InferenceResult`.
 *
 * @inputSpec tool: string — action.slug to look up in the actions table
 * @inputSpec params: Record<string, any> — parsed from OpenAI function call arguments
 * @inputSpec id: string — opaque tool_call ID from the LLM response
 */
export interface ToolCall {
  tool: string
  params: Record<string, any>
  id: string
}

/**
 * Result of executing a single `ToolCall`.
 *
 * @outputSpec tool: string — mirrors ToolCall.tool
 * @outputSpec result: any — handler return value on success; null on error
 * @outputSpec error: string | undefined — error message if execution failed
 * @outputSpec id: string — mirrors ToolCall.id for correlation
 */
export interface ToolResult {
  tool: string
  result: any
  error?: string
  id: string
}

// ─── PRIMARY EXPORTS ────────────────────────────────────────────────────────────

/**
 * Main entry point: run a full agent inference cycle for a user message.
 *
 * Saves the user message, runs the inference loop (with tool calls), checks
 * confidence, saves the agent response, and emits audit logs.
 *
 * @param threadId - UUID of the thread to run inference on
 * @param userMessage - Raw message text from the user
 * @param ctx - CoreContext with accountId, principal, requestId
 * @returns Promise<any> — the saved agent message record from the `messages` table
 * @throws Error — if agent config cannot be resolved, or LLM inference fails
 * @inputSpec threadId: string — valid UUID in threads table
 * @inputSpec userMessage: string — non-empty message text
 * @inputSpec ctx.accountId: string | null — used to scope DB lookups
 * @outputSpec messages row — the inserted agent reply with content and metadata
 * @sideEffects DB write: inserts 2 messages rows (user + agent)
 * @sideEffects DB write: emitAudit (agent.inference.completed or agent.inference.failed)
 * @sideEffects HTTP call: callInference (LLM API)
 * @sideEffects DB write (conditional): handleEscalation if confidence < threshold
 * @calledBy functions/ai-agents.ts handler for POST ?action=run
 * @calledBy v2-custom/ import callers
 * @calls resolveAgentConfig, saveMessage, executeAgentInference,
 *   handleEscalation, emitAudit
 * @testUnit tests/unit/agent-runner.test.ts
 * @testIntegration tests/integration/agent-runner.test.ts
 *
 * @example API handler usage
 * ```ts
 * import { runAgent } from './_shared/index'
 * const agentMsg = await runAgent(body.thread_id, body.message, ctx)
 * return agentMsg
 * ```
 */
export async function runAgent(
  threadId: string,
  userMessage: string,
  ctx: CoreContext
): Promise<any> {
  const startTime = Date.now()

  try {
    // 1. Resolve configurations (thread → agent → prompt config)
    const config = await resolveAgentConfig(threadId, ctx)
    if (!config) {
      throw new Error(`Could not resolve agent configuration for thread ${threadId}`)
    }

    const { agent, promptConfig, thread, threadType } = config

    // 2. Save user message to thread
    const userMsg = await saveMessage(threadId, userMessage, 'human', null, ctx)

    // 3. Execute agent with full context
    const agentResponse = await executeAgentInference(
      config,
      userMessage,
      ctx
    )

    // 4. Check confidence and escalate if needed
    if (agentResponse.confidence < (promptConfig.confidence_threshold || 0)) {
      await handleEscalation(
        threadId,
        agentResponse.confidence,
        promptConfig,
        ctx
      )
    }

    // 5. Save agent response
    const agentMsg = await saveMessage(
      threadId,
      agentResponse.content,
      'agent',
      {
        confidence: agentResponse.confidence,
        tool_calls: agentResponse.tool_calls,
        agent_id: agent.id,
        prompt_config_id: promptConfig.id
      },
      ctx
    )

    // 6. Emit audit log
    await emitAudit(ctx, 'agent.inference.completed', {
      type: 'agent_message',
      id: agentMsg.id,
      account_id: ctx.accountId ?? undefined
    }, {
      thread_id: threadId,
      agent_id: agent.id,
      confidence: agentResponse.confidence,
      has_tool_calls: !!agentResponse.tool_calls?.length,
      duration_ms: Date.now() - startTime
    })

    return agentMsg

  } catch (error: any) {
    // Log failure
    await emitAudit(ctx, 'agent.inference.failed', {
      type: 'agent_message',
      id: 'failed',
      account_id: ctx.accountId ?? undefined
    }, {
      thread_id: threadId,
      error: error.message
    })

    throw error
  }
}

/**
 * Resolves the agent, prompt config, thread, and thread type for a given thread.
 *
 * Resolution priority:
 *   - `agent_id`: `thread.data.agent_id` → `thread.type.design_schema.default_agent_id`
 *   - `prompt_config_id`: `thread.data.prompt_config_id` →
 *     `agent.metadata.default_prompt_config_id`
 *
 * Returns `null` (does not throw) when any required record is missing. `runAgent`
 * converts a null return to a thrown Error.
 *
 * @param threadId - UUID of the thread
 * @param ctx - CoreContext (requestId used for error logging)
 * @returns Promise<AgentConfig | null> — null if config cannot be resolved
 * @throws never — errors logged to console, returns null
 * @inputSpec threadId: string — valid UUID in threads table
 * @outputSpec AgentConfig | null
 * @sideEffects DB reads: threads (with type join), ai_agents, prompt_configs
 * @calledBy runAgent
 * @testUnit tests/unit/agent-runner.test.ts — 'resolveAgentConfig'
 */
export async function resolveAgentConfig(
  threadId: string,
  ctx: CoreContext
): Promise<AgentConfig | null> {
  // Load thread with its type
  const { data: thread, error: threadError } = await adminDb
    .from('threads')
    .select('*, type:types(*)')
    .eq('id', threadId)
    .single()

  if (threadError || !thread) {
    console.error(`Thread not found: ${threadId}`, threadError)
    return null
  }

  const threadType = thread.type
  const threadData = thread.data || {}

  // Resolve agent_id: thread.data > thread.type.design_schema.default_agent_id
  let agentId = threadData.agent_id
  if (!agentId && threadType?.design_schema?.default_agent_id) {
    agentId = threadType.design_schema.default_agent_id
  }

  if (!agentId) {
    console.error(`No agent assigned to thread ${threadId}`)
    return null
  }

  // Load agent
  const { data: agent, error: agentError } = await adminDb
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('is_active', true)
    .single()

  if (agentError || !agent) {
    console.error(`Agent not found: ${agentId}`, agentError)
    return null
  }

  const agentMetadata = agent.metadata || {}

  // Resolve prompt_config_id: thread.data > agent.metadata.default_prompt_config_id
  let promptConfigId = threadData.prompt_config_id
  if (!promptConfigId && agentMetadata.default_prompt_config_id) {
    promptConfigId = agentMetadata.default_prompt_config_id
  }

  if (!promptConfigId) {
    console.error(`No prompt config for thread ${threadId}`)
    return null
  }

  // Load prompt config
  const { data: promptConfig, error: configError } = await adminDb
    .from('prompt_configs')
    .select('*')
    .eq('id', promptConfigId)
    .eq('is_active', true)
    .single()

  if (configError || !promptConfig) {
    console.error(`Prompt config not found: ${promptConfigId}`, configError)
    return null
  }

  return { agent, promptConfig, thread, threadType }
}

// ─── INFERENCE LOOP ─────────────────────────────────────────────────────────────

/**
 * Runs the iterative inference loop: build context → call LLM → dispatch tools
 * → rebuild context → repeat (up to `maxToolIterations`).
 *
 * Returns early when the LLM response has no tool_calls. Stops on last
 * iteration with a note appended if any tool failed.
 *
 * @param config - Resolved AgentConfig
 * @param userMessage - Original user message text
 * @param ctx - CoreContext
 * @param maxToolIterations - Maximum tool-call loops (default: 5)
 * @returns Promise<InferenceResult> — final LLM response with content and confidence
 * @throws Error('Max tool iterations reached') if loop exhausted without convergence
 * @sideEffects HTTP calls: callInference (per iteration)
 * @sideEffects DB reads: messages (conversation history), embeddings (RAG)
 * @calledBy runAgent
 * @calls buildContext, callInference, dispatchTools
 */
async function executeAgentInference(
  config: AgentConfig,
  userMessage: string,
  ctx: CoreContext,
  maxToolIterations: number = 5
): Promise<InferenceResult> {
  const { agent, promptConfig, thread } = config

  // Build initial context
  let context = await buildContext(config, userMessage, [], ctx)

  for (let iteration = 0; iteration < maxToolIterations; iteration++) {
    // Call inference
    const inferenceResult = await callInference(context, agent, promptConfig, ctx)

    // If no tool calls, return immediately
    if (!inferenceResult.tool_calls || inferenceResult.tool_calls.length === 0) {
      return inferenceResult
    }

    // Execute tools
    const toolResults = await dispatchTools(inferenceResult.tool_calls, ctx)

    // Add tool results to context and re-inference
    context = await buildContext(config, userMessage, toolResults, ctx)

    // Check if any tool failed - if so, return with error info
    const hasErrors = toolResults.some(r => r.error)
    if (hasErrors && iteration === maxToolIterations - 1) {
      inferenceResult.content += '\n\n[Note: Some tools failed to execute.]'
      return inferenceResult
    }
  }

  // Max iterations reached
  throw new Error('Max tool iterations reached')
}

/**
 * Assembles the full prompt context string for a single inference call.
 *
 * Context sections (in order):
 *   1. `agent.system_prompt` (or default 'You are a helpful assistant.')
 *   2. `promptConfig.context_template` (if set)
 *   3. Retrieved knowledge via `retrieveKnowledge` (RAG, if knowledge_sources set)
 *   4. Conversation history via `getConversationHistory`
 *   5. Tool results from previous iteration (if any)
 *   6. Available tools list from `promptConfig.available_tools`
 *   7. Current user message
 *
 * @param config - AgentConfig with agent, promptConfig, thread
 * @param userMessage - Current user message
 * @param toolResults - Results from previous tool dispatch iteration
 * @param ctx - CoreContext
 * @returns Promise<string> — assembled prompt context string
 * @throws never — returns partial context on sub-call failure
 * @sideEffects DB reads: embeddings (retrieveKnowledge), messages (history)
 * @calledBy executeAgentInference (per iteration)
 * @calls retrieveKnowledge, getConversationHistory
 */
async function buildContext(
  config: AgentConfig,
  userMessage: string,
  toolResults: ToolResult[],
  ctx: CoreContext
): Promise<string> {
  const { agent, promptConfig, thread } = config

  // 1. System prompt (from agent)
  let context = `${agent.system_prompt || 'You are a helpful assistant.'}\n\n`

  // 2. Context template (from prompt config)
  if (promptConfig.context_template) {
    context += `${promptConfig.context_template}\n\n`
  }

  // 3. Retrieved knowledge (RAG)
  if (promptConfig.knowledge_sources && promptConfig.knowledge_sources.length > 0) {
    const retrievedDocs = await retrieveKnowledge(
      userMessage,
      promptConfig.knowledge_sources,
      ctx.accountId!
    )
    if (retrievedDocs.length > 0) {
      context += '## Relevant Information\n'
      retrievedDocs.forEach((doc, i) => {
        context += `[${i + 1}] ${doc.content}\n`
      })
      context += '\n'
    }
  }

  // 4. Conversation history
  const history = await getConversationHistory(thread.id, promptConfig.max_history_messages || 20)
  if (history.length > 0) {
    context += '## Conversation History\n'
    history.forEach(msg => {
      const role = msg.data?.message_type === 'human' ? 'User' : 'Assistant'
      context += `${role}: ${msg.content}\n`
    })
    context += '\n'
  }

  // 5. Tool results (if any)
  if (toolResults.length > 0) {
    context += '## Tool Results\n'
    toolResults.forEach(result => {
      if (result.error) {
        context += `Tool "${result.tool}" failed: ${result.error}\n`
      } else {
        context += `Tool "${result.tool}" result: ${JSON.stringify(result.result)}\n`
      }
    })
    context += '\n'
  }

  // 6. Available tools (if configured)
  if (promptConfig.available_tools && promptConfig.available_tools.length > 0) {
    context += '## Available Tools\n'
    promptConfig.available_tools.forEach((tool: string) => {
      context += `- ${tool}\n`
    })
    context += '\n'
  }

  // 7. Current user message
  context += `## Current Message\nUser: ${userMessage}\n\nAssistant: `

  return context
}

// ─── KNOWLEDGE & HISTORY ───────────────────────────────────────────────────────────

/**
 * Retrieves relevant documents from the `embeddings` table for RAG.
 *
 * Uses Supabase full-text search (`textSearch`) on `content`. Falls back
 * to returning an empty array on error (never throws).
 * Future: replace with vector similarity search when embedding service is wired.
 *
 * @param query - User message text to search against
 * @param knowledgeSources - Array of document UUIDs to filter the search
 * @param accountId - Account scope for the embeddings lookup
 * @returns Promise<any[]> — array of embedding rows (content, metadata)
 * @throws never — returns [] on failure
 * @sideEffects DB read: embeddings table
 * @calledBy buildContext (if promptConfig.knowledge_sources is non-empty)
 */
async function retrieveKnowledge(
  query: string,
  knowledgeSources: string[],
  accountId: string
): Promise<any[]> {
  // For now, we'll need the query embedding - this requires calling an embedding service
  // In production, this would call the same embedding model used to create embeddings
  // For now, we'll do a text search fallback

  const { data: docs, error } = await adminDb
    .from('embeddings')
    .select('*')
    .eq('account_id', accountId)
    .in('document_id', knowledgeSources)
    .textSearch('content', query, {
      type: 'websearch',
      config: 'english'
    })
    .limit(5)

  if (error) {
    console.error('Knowledge retrieval failed:', error)
    return []
  }

  return docs || []
}

/**
 * Loads the most recent N messages from a thread, ordered chronologically.
 *
 * Returns messages in ascending order (oldest first) for context assembly.
 * Returns empty array on error (never throws).
 *
 * @param threadId - UUID of the thread
 * @param limit - Maximum number of messages to return (from promptConfig.max_history_messages)
 * @returns Promise<any[]> — array of messages rows ordered oldest-first
 * @throws never — returns [] on failure
 * @sideEffects DB read: messages table
 * @calledBy buildContext
 */
async function getConversationHistory(
  threadId: string,
  limit: number
): Promise<any[]> {
  const { data: messages, error } = await adminDb
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Failed to load history:', error)
    return []
  }

  return messages?.reverse() || []
}

// ─── INFERENCE CALL ────────────────────────────────────────────────────────────

/**
 * Calls an OpenAI-compatible chat completions API with the assembled context.
 *
 * Credentials and base URL are loaded from environment variables:
 *   - `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_API_KEY`
 *   - `OPENAI_BASE_URL` / `LLM_BASE_URL` (default: 'https://api.openai.com/v1')
 *   - `LLM_DEFAULT_MODEL` (default: 'gpt-4o')
 *
 * If no API key is found, returns a mock response instead of throwing.
 * This allows local development without LLM credentials.
 *
 * Tool calls are extracted from `message.tool_calls` and mapped to `ToolCall[]`.
 * Confidence is derived from `logprobs` if available, otherwise defaults to 0.85.
 *
 * @param context - Assembled context string from buildContext
 * @param agent - Agent record with model_config (model, temperature, max_tokens, tools)
 * @param promptConfig - Prompt config record (unused here beyond model overrides)
 * @param ctx - CoreContext (requestId for logging)
 * @returns Promise<InferenceResult> — content, confidence, tool_calls, metadata
 * @throws Error('Inference failed: <status>') on non-2xx HTTP response
 * @sideEffects HTTP call to `${OPENAI_BASE_URL}/chat/completions`
 * @calledBy executeAgentInference (per iteration)
 */
async function callInference(
  context: string,
  agent: any,
  promptConfig: any,
  ctx: CoreContext
): Promise<InferenceResult> {
  const modelConfig = agent.model_config || {}
  
  // Get LLM credentials from environment (safer than DB storage)
  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  
  if (!apiKey) {
    // Fallback: return mock response for development
    console.warn('No LLM API key found in environment. Set OPENAI_API_KEY or LLM_API_KEY.')
    return {
      content: `[Mock Response] Received ${context.length} chars of context. Set OPENAI_API_KEY in .env for live inference.`,
      confidence: 0.9,
      tool_calls: undefined,
      metadata: { mock: true }
    }
  }

  const model = modelConfig.model || process.env.LLM_DEFAULT_MODEL || 'gpt-4o'
  const temperature = modelConfig.temperature ?? 0.7
  const maxTokens = modelConfig.max_tokens ?? 4000

  // Call OpenAI-compatible API
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: context.split('\n\n')[0] }, // First paragraph as system
        { role: 'user', content: context.split('\n\n').slice(1).join('\n\n') } // Rest as user
      ],
      temperature,
      max_tokens: maxTokens,
      ...(modelConfig.tools?.length ? { tools: modelConfig.tools, tool_choice: 'auto' } : {})
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Inference failed: ${response.status} ${response.statusText} - ${errorBody}`)
  }

  const result: any = await response.json()
  const message = result.choices?.[0]?.message

  // Extract confidence from logprobs if available, otherwise estimate
  const confidence = result.choices?.[0]?.logprobs?.content?.[0]?.logprob 
    ? Math.exp(result.choices[0].logprobs.content[0].logprob)
    : 0.85 // Default confidence when not provided

  return {
    content: message?.content || '',
    confidence,
    tool_calls: message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      tool: tc.function?.name,
      params: JSON.parse(tc.function?.arguments || '{}')
    })),
    metadata: { 
      model: result.model,
      usage: result.usage,
      finish_reason: result.choices?.[0]?.finish_reason
    }
  }
}

/**
 * Legacy webhook-based inference handler. Calls an arbitrary URL with the
 * config as JSON body. Returns a mock if `config.url` is not set.
 *
 * @deprecated Use `callInference` with environment-based credentials instead.
 * @throws Error on non-2xx HTTP response
 * @sideEffects HTTP call to config.url
 * @calledBy unused (kept for backward compatibility)
 */
async function executeInferenceHandler(
  config: any,
  ctx: CoreContext
): Promise<any> {
  const { url, method = 'POST', headers = {} } = config

  if (!url) {
    // Fallback: return mock response for development
    console.warn('No inference URL configured, returning mock response')
    return {
      content: `[Mock] I received your message. In production, this would call ${config.model} via webhook.`,
      confidence: 0.9
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(config)
  })

  if (!response.ok) {
    throw new Error(`Inference failed: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

// ─── TOOL DISPATCH ────────────────────────────────────────────────────────────

/**
 * Executes a batch of tool calls in sequence, returning results for each.
 *
 * For each tool call:
 *   1. Look up action by `call.tool` (action.slug) in the actions table
 *   2. Call `executeToolAction` to dispatch to the correct handler
 *   3. Push `ToolResult` with success output or error message
 *
 * Individual tool failures are captured in `ToolResult.error` and do NOT
 * halt the batch — all tool calls are attempted.
 *
 * @param toolCalls - Array of ToolCall objects from an InferenceResult
 * @param ctx - CoreContext
 * @returns Promise<ToolResult[]> — one result per input tool call
 * @throws never — per-tool errors captured in result.error
 * @sideEffects DB read: actions table (per tool call)
 * @sideEffects Calls executeToolAction (DB writes, HTTP calls per handler)
 * @calledBy executeAgentInference (after each inference call with tool_calls)
 * @calls executeToolAction
 */
async function dispatchTools(
  toolCalls: ToolCall[],
  ctx: CoreContext
): Promise<ToolResult[]> {
  const results: ToolResult[] = []

  for (const call of toolCalls) {
    try {
      // Lookup action for this tool
      const { data: action, error } = await adminDb
        .from('actions')
        .select('*')
        .eq('slug', call.tool)
        .eq('is_active', true)
        .single()

      if (error || !action) {
        results.push({
          tool: call.tool,
          id: call.id,
          result: null,
          error: `Tool "${call.tool}" not found`
        })
        continue
      }

      // Execute tool via pipeline-runner pattern
      const result = await executeToolAction(action, call.params, ctx)

      results.push({
        tool: call.tool,
        id: call.id,
        result
      })

    } catch (error: any) {
      results.push({
        tool: call.tool,
        id: call.id,
        result: null,
        error: error.message
      })
    }
  }

  return results
}

/**
 * Dispatches a single tool action to its handler based on `action.handler`.
 *
 * Supported handlers (mirrors pipeline-runner stageHandlers):
 *   - `search_knowledge` → `executeSearchKnowledge`
 *   - `query_items` → `executeQueryItems`
 *   - `create_record` → `executeCreateRecord`
 *   - `update_item` → `executeUpdateItem`
 *   - `run_pipeline` → `runPipeline` (dynamic import to avoid circular deps)
 *   - `send_notification` → `executeSendNotification`
 *
 * @param action - Action record from the actions table
 * @param params - Tool call parameters (from LLM function_call.arguments)
 * @param ctx - CoreContext
 * @returns Promise<any> — handler output
 * @throws Error('Unknown tool handler') on unrecognised action.handler
 * @calledBy dispatchTools
 */
async function executeToolAction(
  action: any,
  params: any,
  ctx: CoreContext
): Promise<any> {
  // Import pipeline-runner handlers dynamically to avoid circular deps
  const { runPipeline } = await import('./pipeline-runner')

  switch (action.handler) {
    case 'search_knowledge':
      return await executeSearchKnowledge(params, ctx)
    
    case 'query_items':
      return await executeQueryItems(params, ctx)
    
    case 'create_record':
      return await executeCreateRecord(params, ctx)
    
    case 'update_item':
      return await executeUpdateItem(params, ctx)
    
    case 'run_pipeline':
      const result = await runPipeline(params.pipeline_id, params.trigger_data || {}, ctx)
      return { success: result.status === 'completed', result }
    
    case 'send_notification':
      return await executeSendNotification(params, ctx)
    
    default:
      throw new Error(`Unknown tool handler: ${action.handler}`)
  }
}

// ─── TOOL HANDLERS ────────────────────────────────────────────────────────────

/**
 * Tool: search_knowledge — vector similarity search via `search_similar_embeddings`
 * RPC, falling back to text search on error.
 *
 * @param params.query: string — search query text
 * @param params.embedding: number[] | undefined — pre-computed embedding vector
 * @param params.limit: number (default 5)
 * @param params.threshold: number (default 0.7)
 * @returns { results[], method: 'vector'|'text_fallback' }
 * @throws never — falls back to text search on RPC failure
 * @sideEffects DB: search_similar_embeddings RPC or embeddings text search
 */
async function executeSearchKnowledge(
  params: any,
  ctx: CoreContext
): Promise<any> {
  const { query, knowledge_sources, limit = 5 } = params

  const { data: results, error } = await adminDb.rpc('search_similar_embeddings', {
    p_account_id: ctx.accountId,
    p_model_id: params.model_id || 'text-embedding-ada-002',
    p_query_embedding: params.embedding, // If pre-computed
    p_limit: limit,
    p_threshold: params.threshold || 0.7
  })

  if (error) {
    // Fallback to text search
    const { data: fallback } = await adminDb
      .from('embeddings')
      .select('*')
      .eq('account_id', ctx.accountId)
      .textSearch('content', query)
      .limit(limit)
    
    return { results: fallback || [], method: 'text_fallback' }
  }

  return { results: results || [], method: 'vector' }
}

/**
 * Tool: query_items — filtered SELECT on any table scoped to ctx.accountId.
 *
 * @param params.entity: string — table name
 * @param params.filters: Record<string, any> (default {})
 * @param params.limit: number (default 10)
 * @returns { items[] }
 * @throws Error on DB failure
 * @sideEffects DB read: params.entity table
 */
async function executeQueryItems(
  params: any,
  ctx: CoreContext
): Promise<any> {
  const { entity, filters = {}, limit = 10 } = params

  let query = adminDb
    .from(entity)
    .select('*')
    .eq('account_id', ctx.accountId)
    .limit(limit)

  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value)
  })

  const { data, error } = await query

  if (error) throw new Error(`Query failed: ${error.message}`)
  return { items: data || [] }
}

/**
 * Tool: create_record — inserts a record into any table.
 *
 * @param params.entity: string — table name
 * @param params.data: Record<string, any> — field values
 * @returns { record } — the inserted row
 * @throws Error on DB failure
 * @sideEffects DB write: params.entity table
 */
async function executeCreateRecord(
  params: any,
  ctx: CoreContext
): Promise<any> {
  const { entity, data } = params

  const { data: result, error } = await adminDb
    .from(entity)
    .insert({
      ...data,
      account_id: ctx.accountId,
      created_by: ctx.principal?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw new Error(`Create failed: ${error.message}`)
  return { record: result }
}

/**
 * Tool: update_item — updates a record by ID in any table.
 *
 * @param params.entity: string — table name
 * @param params.record_id: string — UUID of the record
 * @param params.data: Record<string, any> — fields to update
 * @returns { record } — the updated row
 * @throws Error on DB failure
 * @sideEffects DB write: params.entity table
 */
async function executeUpdateItem(
  params: any,
  ctx: CoreContext
): Promise<any> {
  const { entity, record_id, data } = params

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
  return { record: result }
}

/**
 * Tool: send_notification — inserts rows into the `watchers` table.
 *
 * @param params.message: string — notification text
 * @param params.recipients: string[] — person UUIDs to notify
 * @param params.entity_type: string | undefined
 * @param params.entity_id: string | undefined
 * @returns { notified_count }
 * @throws Error on DB failure
 * @sideEffects DB write: watchers table
 */
async function executeSendNotification(
  params: any,
  ctx: CoreContext
): Promise<any> {
  const { message, recipients = [], entity_type, entity_id } = params

  const notifications = recipients.map((recipientId: string) => ({
    account_id: ctx.accountId,
    person_id: recipientId,
    message,
    entity_type: entity_type || 'agent_message',
    entity_id: entity_id || ctx.requestId,
    is_read: false,
    created_at: new Date().toISOString()
  }))

  if (notifications.length > 0) {
    const { error } = await adminDb.from('watchers').insert(notifications)
    if (error) throw new Error(`Notification failed: ${error.message}`)
  }

  return { notified_count: notifications.length }
}

// ─── ESCALATION ────────────────────────────────────────────────────────────

/**
 * Handles confidence-based escalation when inference confidence falls below
 * `promptConfig.confidence_threshold`.
 *
 * Actions taken:
 *   1. Attempt to set `threads.data.escalation_status = 'pending'` (via jsonb_set RPC)
 *   2. Emit `agent.inference.low_confidence` audit log
 *   3. If `promptConfig.escalation_action === 'pipeline'` and
 *      `promptConfig.escalation_target` is set, run the escalation pipeline
 *      via dynamic import of `runPipeline`
 *
 * @param threadId - UUID of the thread being escalated
 * @param confidence - The confidence score that triggered escalation
 * @param promptConfig - Prompt config with escalation settings
 * @param ctx - CoreContext
 * @returns Promise<void> — always resolves
 * @throws never — DB errors are silently dropped (best-effort)
 * @sideEffects DB write: threads.data (jsonb_set for escalation_status)
 * @sideEffects DB write: emitAudit (agent.inference.low_confidence)
 * @sideEffects Calls runPipeline (if escalation_action === 'pipeline')
 * @calledBy runAgent (when agentResponse.confidence < threshold)
 */
async function handleEscalation(
  threadId: string,
  confidence: number,
  promptConfig: any,
  ctx: CoreContext
): Promise<void> {
  // Update thread escalation status
  await adminDb
    .from('threads')
    .update({
      data: adminDb.rpc('jsonb_set', {
        target: adminDb.from('threads').select('data').eq('id', threadId).single(),
        path: '{escalation_status}',
        new_value: '"pending"'
      })
    })
    .eq('id', threadId)

  // Fire trigger event
  await emitAudit(ctx, 'agent.inference.low_confidence', {
    type: 'thread',
    id: threadId,
    account_id: ctx.accountId ?? undefined
  }, {
    confidence,
    threshold: promptConfig.confidence_threshold,
    escalation_action: promptConfig.escalation_action,
    escalation_target: promptConfig.escalation_target
  })

  // If escalation pipeline configured, run it
  if (promptConfig.escalation_action === 'pipeline' && promptConfig.escalation_target) {
    const { runPipeline } = await import('./pipeline-runner')
    await runPipeline(
      promptConfig.escalation_target,
      {
        thread_id: threadId,
        confidence,
        threshold: promptConfig.confidence_threshold,
        reason: 'low_confidence'
      },
      ctx
    )
  }
}

// ─── MESSAGE PERSISTENCE ───────────────────────────────────────────────────────────

/**
 * Inserts a message row into the `messages` table for a thread.
 *
 * For human messages: `person_id` is set to `ctx.principal.id`.
 * For agent/system/tool messages: `person_id` is null.
 * The `data` JSONB field carries `message_type` and any additional metadata.
 *
 * @param threadId - UUID of the parent thread
 * @param content - Message text content
 * @param messageType - Role classifier for the message
 * @param data - Additional JSONB metadata (e.g. confidence, tool_calls, agent_id)
 * @param ctx - CoreContext with accountId and principal
 * @returns Promise<any> — the inserted messages row
 * @throws Error('Failed to save message') on DB insert failure
 * @inputSpec messageType: 'human'|'agent'|'system'|'tool_call'|'tool_result'
 * @sideEffects DB write: messages table
 * @calledBy runAgent (user message + agent response)
 */
async function saveMessage(
  threadId: string,
  content: string,
  messageType: 'human' | 'agent' | 'system' | 'tool_call' | 'tool_result',
  data: any,
  ctx: CoreContext
): Promise<any> {
  const { data: message, error } = await adminDb
    .from('messages')
    .insert({
      thread_id: threadId,
      account_id: ctx.accountId,
      person_id: messageType === 'human' ? ctx.principal?.id : null,
      content,
      content_format: 'text',
      data: {
        message_type: messageType,
        ...data
      },
      created_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save message: ${error.message}`)
  return message
}
