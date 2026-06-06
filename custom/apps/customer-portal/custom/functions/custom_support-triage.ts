import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'

/**
 * Custom Support Triage Handler
 *
 * Two actions:
 *   POST ?action=new_ticket  — first message: creates ticket + thread + messages, runs AI
 *   POST ?action=reply       — follow-up message on existing ticket: posts message, runs AI
 *
 * No direct DB access from custom code — all writes go through admin-data API or
 * adminDb (service-role) where the API is not available in server context.
 *
 * AI response schema (enforced via response_format: json_object):
 * {
 *   public_response: string,
 *   confidence: number (0-1),
 *   confidence_reasoning: string,
 *   escalate: boolean,
 *   escalation_reason: 'low_confidence' | 'none',
 *   sources_used: Array<{ type, id, title, relevance }>,
 *   suggested_title: string   (turn 1 only)
 * }
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TRIAGE_AGENT_ID = '01e448df-890b-4589-857b-815eadb44d81'
const PROMPT_CONFIG_ID = 'b778253e-cd2f-49f3-be81-836c55ed7542'
const SUPPORT_TICKET_TYPE_ID = '82320862-a99c-4a84-b7ed-c2832cf519cd'
const THREAD_TYPE_ID = '3b2af95b-f464-48cc-8d2d-c985e96507da'
const MESSAGE_TYPE_ID = '8ebfdcb1-231b-4954-829f-3ef9368409ba'
const CONFIDENCE_THRESHOLD = 0.75

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TriageEnvelope {
  public_response: string
  confidence: number
  confidence_reasoning: string
  escalate: boolean
  escalation_reason: 'low_confidence' | 'none'
  sources_used: Array<{ type: string; id: string; title: string; relevance: number }>
  suggested_title?: string
}

interface TriageResult {
  ticketId: string
  threadId: string
  publicMessageId: string
  internalMessageId: string
  public_response: string
  confidence: number
  escalated: boolean
  escalation_reason: string
  suggested_title?: string
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getConversationHistory(threadId: string): Promise<any[]> {
  const { data: msgs, error } = await adminDb
    .from('messages')
    .select('content, direction, data, created_at')
    .eq('thread_id', threadId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) return []
  return msgs || []
}

async function getPriorTickets(accountId: string, personId: string): Promise<any[]> {
  const { data: tickets, error } = await adminDb
    .from('items')
    .select('id, title, description, created_at')
    .eq('type_id', SUPPORT_TICKET_TYPE_ID)
    .eq('account_id', accountId)
    .eq('created_by', personId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) return []
  return tickets || []
}

const KB_PLATFORM_ACCOUNT_ID = '12acec9b-8451-40e7-80d5-e80c4e2fc0de' // spine-system

async function searchKB(query: string, accountId: string): Promise<any[]> {
  // Search embeddings scoped to: (1) client's own KB articles, and (2) platform-wide KB articles
  // Exclude restricted items that belong to a different account
  const accountIds = [accountId]
  if (accountId !== KB_PLATFORM_ACCOUNT_ID) {
    accountIds.push(KB_PLATFORM_ACCOUNT_ID)
  }

  const { data: results, error } = await adminDb
    .from('embeddings')
    .select('document_id, content, metadata, account_id')
    .in('account_id', accountIds)
    .eq('metadata->>item_type', 'kb_article')
    .eq('metadata->>vector_type', 'semantic')
    .textSearch('content', query, { type: 'websearch', config: 'english' })
    .limit(8)

  if (error) return []

  // For cross-account (platform) results, filter out restricted items
  const filtered = (results || []).filter((r: any) => {
    if (r.account_id === accountId) return true
    return r.metadata?.security_level !== 'restricted'
  })

  return filtered.slice(0, 5)
}

async function callOpenAI(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  temperature: number
): Promise<{ envelope: TriageEnvelope; latency_ms: number; token_usage: any }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const startTime = Date.now()

  if (!apiKey) {
    const mockEnvelope: TriageEnvelope = {
      public_response: '[Mock] No OPENAI_API_KEY set. This is a mock AI response for local development.',
      confidence: 0.85,
      confidence_reasoning: 'Mock response — no API key configured.',
      escalate: false,
      escalation_reason: 'none',
      sources_used: [],
      suggested_title: 'Mock Support Ticket'
    }
    return { envelope: mockEnvelope, latency_ms: 0, token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`)
  }

  const result: any = await res.json()
  const raw = result.choices?.[0]?.message?.content || '{}'
  let envelope: TriageEnvelope

  try {
    envelope = JSON.parse(raw)
    if (typeof envelope.public_response !== 'string') throw new Error('missing public_response')
    if (typeof envelope.confidence !== 'number') throw new Error('missing confidence')
  } catch (parseErr: any) {
    envelope = {
      public_response: "We're looking into this and will have a human response shortly.",
      confidence: 0,
      confidence_reasoning: `Parse failure: ${parseErr.message}. Raw: ${raw.slice(0, 200)}`,
      escalate: true,
      escalation_reason: 'low_confidence',
      sources_used: [],
    }
  }

  return {
    envelope,
    latency_ms: Date.now() - startTime,
    token_usage: result.usage || {},
  }
}

function buildSystemPrompt(
  agentSystemPrompt: string,
  contextTemplate: string,
  kbSources: any[],
  priorTickets: any[],
  history: any[]
): string {
  let prompt = agentSystemPrompt + '\n\n'
  prompt += contextTemplate + '\n\n'

  if (kbSources.length > 0) {
    prompt += '## Knowledge Base Articles\n'
    kbSources.forEach((doc, i) => {
      prompt += `[KB${i + 1}] ${doc.content?.slice(0, 500)}\n`
    })
    prompt += '\n'
  }

  if (priorTickets.length > 0) {
    prompt += "## Customer's Prior Tickets\n"
    priorTickets.forEach((t) => {
      prompt += `- ${t.title}: ${t.description?.slice(0, 200) || 'No description'}\n`
    })
    prompt += '\n'
  }

  if (history.length > 0) {
    prompt += '## Conversation So Far\n'
    history.forEach((m) => {
      const role = m.direction === 'inbound' ? 'Customer' : 'Assistant'
      prompt += `${role}: ${m.content}\n`
    })
    prompt += '\n'
  }

  prompt += `\nYou MUST respond with a single valid JSON object matching EXACTLY this schema. No markdown, no code fences, no extra text:\n`
  prompt += `{
  "public_response": "<your response to the customer>",
  "confidence": <0.0-1.0>,
  "confidence_reasoning": "<one sentence explaining your confidence score>",
  "escalate": <true|false>,
  "escalation_reason": "<low_confidence|none>",
  "sources_used": [{"type": "kb_article|prior_ticket", "id": "<id>", "title": "<title>", "relevance": <0.0-1.0>}],
  "suggested_title": "<3-8 word case title — ONLY include on the first turn>"
}`

  return prompt
}

// ─── SCHEMA LOADER ──────────────────────────────────────────────────────────

async function loadTypeSchemas() {
  const { data: types } = await adminDb
    .from('types')
    .select('id, design_schema, validation_schema')
    .in('id', [SUPPORT_TICKET_TYPE_ID, THREAD_TYPE_ID, MESSAGE_TYPE_ID])
  const byId = Object.fromEntries((types || []).map((t: any) => [t.id, t]))
  return {
    ticketSchema: byId[SUPPORT_TICKET_TYPE_ID]?.design_schema || {},
    ticketValidation: byId[SUPPORT_TICKET_TYPE_ID]?.validation_schema || {},
    threadSchema: byId[THREAD_TYPE_ID]?.design_schema || {},
    threadValidation: byId[THREAD_TYPE_ID]?.validation_schema || {},
    messageSchema: byId[MESSAGE_TYPE_ID]?.design_schema || {},
    messageValidation: byId[MESSAGE_TYPE_ID]?.validation_schema || {},
  }
}

// ─── ACTION: NEW TICKET ───────────────────────────────────────────────────────

async function handleNewTicket(ctx: any, body: any): Promise<TriageResult> {
  const { message } = body
  const account_id = ctx.accountId as string
  const person_id = ctx.principal?.id as string
  if (!message) throw new Error('message is required')
  if (!account_id || !person_id) throw new Error('User context (account + person) required')

  // Load agent + prompt config + type schemas
  const [{ data: agent }, { data: promptConfig }, schemas] = await Promise.all([
    adminDb.from('ai_agents').select('*').eq('id', TRIAGE_AGENT_ID).single(),
    adminDb.from('prompt_configs').select('*').eq('id', PROMPT_CONFIG_ID).single(),
    loadTypeSchemas(),
  ])
  if (!agent || !promptConfig) throw new Error('Triage agent configuration not found')

  const modelConfig = agent.model_config || {}
  const model = modelConfig.model || process.env.LLM_DEFAULT_MODEL || 'gpt-4o'
  const temperature = modelConfig.temperature ?? 0.7

  // CALL A: Run AI (before ticket exists — no history yet)
  const kbSources = await searchKB(message, account_id)
  const priorTickets = await getPriorTickets(account_id, person_id)
  const systemPrompt = buildSystemPrompt(
    agent.system_prompt,
    promptConfig.context_template.replace('{{user_message}}', message),
    kbSources,
    priorTickets,
    []
  )

  const promptMessages = [{ role: 'user' as const, content: message }]
  const { envelope, latency_ms, token_usage } = await callOpenAI(systemPrompt, promptMessages, model, temperature)

  const escalate = envelope.escalate || envelope.confidence < (promptConfig.confidence_threshold || CONFIDENCE_THRESHOLD)
  const suggestedTitle = envelope.suggested_title || message.slice(0, 80)

  // CALL A continued: Create ticket via adminDb
  const { data: ticket, error: ticketError } = await adminDb
    .from('items')
    .insert({
      type_id: SUPPORT_TICKET_TYPE_ID,
      account_id,
      created_by: person_id,
      title: suggestedTitle,
      description: message,
      status: escalate ? 'human_assigned' : 'ai_responding',
      design_schema: schemas.ticketSchema,
      validation_schema: schemas.ticketValidation,
      data: {
        status: escalate ? 'human_assigned' : 'ai_responding',
        aim_triage_agent_id: TRIAGE_AGENT_ID,
        aim_confidence_threshold: promptConfig.confidence_threshold || CONFIDENCE_THRESHOLD,
        aim_confidence_at_response: envelope.confidence,
        aim_escalation_reason: escalate ? envelope.escalation_reason : 'none',
      },
    })
    .select('id')
    .single()

  if (ticketError || !ticket) throw new Error(`Failed to create ticket: ${ticketError?.message}`)
  const ticketId = ticket.id

  // Create external thread with agent routing in data
  const { data: thread, error: threadError } = await adminDb
    .from('threads')
    .insert({
      type_id: THREAD_TYPE_ID,
      account_id,
      target_type: 'items',
      target_id: ticketId,
      visibility: 'external',
      status: 'active',
      design_schema: schemas.threadSchema,
      validation_schema: schemas.threadValidation,
      data: {
        agent_id: TRIAGE_AGENT_ID,
        prompt_config_id: PROMPT_CONFIG_ID,
      },
    })
    .select('id')
    .single()

  if (threadError || !thread) throw new Error(`Failed to create thread: ${threadError?.message}`)
  const threadId = thread.id

  // Post customer's inbound message (public)
  const nextSeq = 1
  const { data: customerMsg, error: custMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id: threadId,
      account_id,
      person_id,
      content: message,
      direction: 'inbound',
      visibility: 'public',
      sequence: nextSeq,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: { message_type: 'human' },
    })
    .select('id')
    .single()

  if (custMsgErr || !customerMsg) throw new Error(`Failed to save customer message: ${custMsgErr?.message}`)

  // Post AI public response (outbound, public)
  const publicContent = escalate
    ? "We're looking into this and will have a human response shortly."
    : envelope.public_response

  const { data: publicMsg, error: pubMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id: threadId,
      account_id,
      content: publicContent,
      direction: 'outbound',
      visibility: 'public',
      sequence: nextSeq + 1,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: {
        message_type: 'agent',
        agent_id: TRIAGE_AGENT_ID,
        confidence: envelope.confidence,
        escalated: escalate,
      },
    })
    .select('id')
    .single()

  if (pubMsgErr || !publicMsg) throw new Error(`Failed to save public AI message: ${pubMsgErr?.message}`)

  // Post internal AI note (outbound, internal) — full audit data
  const internalPayload = {
    turn: 1,
    prompt_sent: [{ role: 'system', content: systemPrompt }, ...promptMessages],
    kb_sources_retrieved: kbSources.map((s) => ({ id: s.document_id, content: s.content?.slice(0, 100), relevance: null })),
    prior_tickets_retrieved: priorTickets.map((t) => ({ id: t.id, title: t.title })),
    ai_raw_response: envelope,
    confidence: envelope.confidence,
    confidence_reasoning: envelope.confidence_reasoning,
    escalation_decision: escalate ? envelope.escalation_reason : 'none',
    model,
    temperature,
    latency_ms,
    token_usage,
    suggested_title: suggestedTitle,
  }

  const { data: internalMsg, error: intMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id: threadId,
      account_id,
      content: `[AI Internal] Turn 1 — Confidence: ${envelope.confidence.toFixed(2)} — ${envelope.confidence_reasoning}`,
      direction: 'outbound',
      visibility: 'internal',
      sequence: nextSeq + 2,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: {
        message_type: 'agent_internal',
        ai_internal: internalPayload,
      },
    })
    .select('id')
    .single()

  if (intMsgErr || !internalMsg) throw new Error(`Failed to save internal AI message: ${intMsgErr?.message}`)

  return {
    ticketId,
    threadId,
    publicMessageId: publicMsg.id,
    internalMessageId: internalMsg.id,
    public_response: publicContent,
    confidence: envelope.confidence,
    escalated: escalate,
    escalation_reason: escalate ? envelope.escalation_reason : 'none',
    suggested_title: suggestedTitle,
  }
}

// ─── ACTION: REPLY (multi-turn) ───────────────────────────────────────────────

async function handleReply(ctx: any, body: any): Promise<TriageResult> {
  const { message, thread_id, ticket_id } = body
  const account_id = ctx.accountId as string
  const person_id = ctx.principal?.id as string
  if (!message || !thread_id || !ticket_id) throw new Error('message, thread_id, and ticket_id are required')
  if (!account_id || !person_id) throw new Error('User context (account + person) required')

  // Load agent + prompt config + type schemas
  const [{ data: agent }, { data: promptConfig }, schemas] = await Promise.all([
    adminDb.from('ai_agents').select('*').eq('id', TRIAGE_AGENT_ID).single(),
    adminDb.from('prompt_configs').select('*').eq('id', PROMPT_CONFIG_ID).single(),
    loadTypeSchemas(),
  ])
  if (!agent || !promptConfig) throw new Error('Triage agent configuration not found')

  const modelConfig = agent.model_config || {}
  const model = modelConfig.model || process.env.LLM_DEFAULT_MODEL || 'gpt-4o'
  const temperature = modelConfig.temperature ?? 0.7

  // Load existing conversation history (public messages only)
  const history = await getConversationHistory(thread_id)
  const turnNumber = history.filter((m) => m.direction === 'inbound').length + 1

  // Get current message count for sequencing
  const { count: msgCount } = await adminDb
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', thread_id)
  const nextSeq = (msgCount || 0) + 1

  // Post customer message first (so it shows immediately)
  const { data: customerMsg, error: custMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id,
      account_id,
      person_id,
      content: message,
      direction: 'inbound',
      visibility: 'public',
      sequence: nextSeq,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: { message_type: 'human' },
    })
    .select('id')
    .single()

  if (custMsgErr || !customerMsg) throw new Error(`Failed to save customer message: ${custMsgErr?.message}`)

  // Run AI with full history context
  const kbSources = await searchKB(message, account_id)
  const priorTickets = await getPriorTickets(account_id, person_id)
  const systemPrompt = buildSystemPrompt(
    agent.system_prompt,
    promptConfig.context_template.replace('{{user_message}}', message),
    kbSources,
    priorTickets,
    history
  )

  const promptMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history.map((m) => ({
      role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const { envelope, latency_ms, token_usage } = await callOpenAI(systemPrompt, promptMessages, model, temperature)

  const escalate = envelope.escalate || envelope.confidence < (promptConfig.confidence_threshold || CONFIDENCE_THRESHOLD)
  const publicContent = escalate
    ? "We're looking into this and will have a human response shortly."
    : envelope.public_response

  // Post AI public response
  const { data: publicMsg, error: pubMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id,
      account_id,
      content: publicContent,
      direction: 'outbound',
      visibility: 'public',
      sequence: nextSeq + 1,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: {
        message_type: 'agent',
        agent_id: TRIAGE_AGENT_ID,
        confidence: envelope.confidence,
        escalated: escalate,
      },
    })
    .select('id')
    .single()

  if (pubMsgErr || !publicMsg) throw new Error(`Failed to save public AI message: ${pubMsgErr?.message}`)

  // Post internal note
  const internalPayload = {
    turn: turnNumber,
    prompt_sent: [{ role: 'system', content: systemPrompt }, ...promptMessages],
    kb_sources_retrieved: kbSources.map((s) => ({ id: s.document_id, content: s.content?.slice(0, 100), relevance: null })),
    prior_tickets_retrieved: priorTickets.map((t) => ({ id: t.id, title: t.title })),
    ai_raw_response: envelope,
    confidence: envelope.confidence,
    confidence_reasoning: envelope.confidence_reasoning,
    escalation_decision: escalate ? envelope.escalation_reason : 'none',
    model,
    temperature,
    latency_ms,
    token_usage,
  }

  const { data: internalMsg, error: intMsgErr } = await adminDb
    .from('messages')
    .insert({
      type_id: MESSAGE_TYPE_ID,
      thread_id,
      account_id,
      content: `[AI Internal] Turn ${turnNumber} — Confidence: ${envelope.confidence.toFixed(2)} — ${envelope.confidence_reasoning}`,
      direction: 'outbound',
      visibility: 'internal',
      sequence: nextSeq + 2,
      design_schema: schemas.messageSchema,
      validation_schema: schemas.messageValidation,
      data: {
        message_type: 'agent_internal',
        ai_internal: internalPayload,
      },
    })
    .select('id')
    .single()

  if (intMsgErr || !internalMsg) throw new Error(`Failed to save internal AI message: ${intMsgErr?.message}`)

  // Update ticket status if escalated
  if (escalate) {
    const { data: currentTicket } = await adminDb
      .from('items')
      .select('data')
      .eq('id', ticket_id)
      .single()

    await adminDb
      .from('items')
      .update({
        status: 'human_assigned',
        data: {
          ...(currentTicket?.data || {}),
          status: 'human_assigned',
          aim_confidence_at_response: envelope.confidence,
          aim_escalation_reason: envelope.escalation_reason,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticket_id)
  }

  return {
    ticketId: ticket_id,
    threadId: thread_id,
    publicMessageId: publicMsg.id,
    internalMessageId: internalMsg.id,
    public_response: publicContent,
    confidence: envelope.confidence,
    escalated: escalate,
    escalation_reason: escalate ? envelope.escalation_reason : 'none',
  }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const handler = createHandler(async (ctx, body) => {
  const action = ctx.query?.action

  switch (action) {
    case 'new_ticket':
      return await handleNewTicket(ctx, body)
    case 'reply':
      return await handleReply(ctx, body)
    default:
      throw new Error(`Unknown action: ${action}. Use 'new_ticket' or 'reply'.`)
  }
})
