import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'

/**
 * Custom Case Analysis Handler
 *
 * Action: POST ?action=analyze_ticket
 * 
 * Analyzes resolved support tickets to extract insights, identify root causes, 
 * and suggest improvements. Creates case_analysis items and manages tags.
 *
 * Process:
 * 1. Fetch ticket data, threads, and messages
 * 2. Run AI analysis with structured prompt
 * 3. Process tag suggestions (check existence, create if needed)
 * 4. Create case_analysis item with results
 * 5. Update ticket with analysis summary and tags
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ANALYSIS_AGENT_ID = 'case_analysis_agent' // Will be looked up by name
const PROMPT_CONFIG_ID = 'case_analysis_prompt' // Will be looked up by slug
const SUPPORT_TICKET_TYPE_ID = '82320862-a99c-4a84-b7ed-c2832cf519cd' // From existing triage
const CASE_ANALYSIS_TYPE_ID = 'case_analysis' // Will be looked up by slug
const TAG_TYPE_ID = 'tag' // Will be looked up by slug

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface AnalysisRequest {
  ticket_id: string
}

interface AnalysisResult {
  ticketId: string
  caseAnalysisId: string
  analysisData: any
  createdTags: string[]
  confidence: number
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getTicketData(ticketId: string): Promise<any> {
  const { data: ticket, error } = await adminDb
    .from('items')
    .select('*')
    .eq('id', ticketId)
    .eq('type_id', SUPPORT_TICKET_TYPE_ID)
    .single()
  
  if (error || !ticket) throw new Error(`Ticket not found: ${error?.message}`)
  return ticket
}

async function getConversationHistory(ticketId: string): Promise<any[]> {
  // Get threads for this ticket
  const { data: threads, error: threadError } = await adminDb
    .from('threads')
    .select('id')
    .eq('target_type', 'items')
    .eq('target_id', ticketId)
  
  if (threadError || !threads || threads.length === 0) return []
  
  const threadId = threads[0].id
  
  // Get messages for this thread
  const { data: messages, error: msgError } = await adminDb
    .from('messages')
    .select('content, direction, data, created_at, person_id')
    .eq('thread_id', threadId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: true })
    .limit(50)
  
  if (msgError) return []
  return messages || []
}

async function getAgentAndPrompt(): Promise<{ agent: any; promptConfig: any }> {
  const [{ data: agent }, { data: promptConfig }] = await Promise.all([
    adminDb.from('ai_agents').select('*').eq('name', 'Case Resolution Analysis Agent').single(),
    adminDb.from('prompt_configs').select('*').eq('slug', 'case_analysis_prompt').single()
  ])
  
  if (!agent || !promptConfig) {
    throw new Error('Case analysis agent or prompt configuration not found')
  }
  
  return { agent, promptConfig }
}

async function callOpenAI(
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string,
  temperature: number
): Promise<{ envelope: any; latency_ms: number; token_usage: any }> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const startTime = Date.now()

  if (!apiKey) {
    const mockEnvelope = {
      reported_issue: 'Mock reported issue - no API key configured',
      true_problem: 'Mock true problem - no API key configured',
      diagnostic_steps: ['Mock step 1', 'Mock step 2'],
      solution_steps: ['Mock solution step 1', 'Mock solution step 2'],
      final_solution: 'Mock final solution - no API key configured',
      customer_temperature: 'neutral',
      time_to_resolution: 60,
      escalation_required: false,
      back_and_forth_count: 2,
      sentiment_progression: ['neutral', 'neutral', 'neutral'],
      automation_potential: 'medium',
      kb_candidate: false,
      suggested_tags: [],
      confidence_score: 0.5,
      analysis_summary: 'Mock analysis - no API key configured'
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
  let envelope: any

  try {
    envelope = JSON.parse(raw)
  } catch (parseErr: any) {
    envelope = {
      reported_issue: 'Parse failure',
      true_problem: 'Parse failure',
      diagnostic_steps: ['Parse failure'],
      solution_steps: ['Parse failure'],
      final_solution: `Parse failure: ${parseErr.message}`,
      customer_temperature: 'neutral',
      time_to_resolution: 0,
      escalation_required: true,
      back_and_forth_count: 0,
      sentiment_progression: ['neutral'],
      automation_potential: 'low',
      kb_candidate: false,
      suggested_tags: [],
      confidence_score: 0,
      analysis_summary: `Parse failure: ${parseErr.message}. Raw: ${raw.slice(0, 200)}`
    }
  }

  return {
    envelope,
    latency_ms: Date.now() - startTime,
    token_usage: result.usage || {},
  }
}

async function getOrCreateTag(tagData: any, accountId: string): Promise<string> {
  const { slug, name, purpose, category, applicable_to } = tagData
  
  // Check if tag already exists
  const { data: existingTag } = await adminDb
    .from('items')
    .select('id')
    .eq('type_id', TAG_TYPE_ID)
    .eq('data->>slug', slug)
    .single()
  
  if (existingTag) {
    // Increment usage count
    await adminDb
      .from('items')
      .update({
        data: adminDb.sql`jsonb_set(data, '{usage_count}', COALESCE((data->>'usage_count')::int, 0) + 1)`,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingTag.id)
    
    return existingTag.id
  }
  
  // Get tag type ID
  const { data: tagType } = await adminDb
    .from('types')
    .select('id')
    .eq('slug', 'tag')
    .single()
  
  if (!tagType) throw new Error('Tag type not found')
  
  // Create new tag
  const { data: newTag, error } = await adminDb
    .from('items')
    .insert({
      type_id: tagType.id,
      account_id: accountId,
      title: name,
      description: purpose,
      data: {
        slug,
        name,
        purpose,
        applicable_to: applicable_to || ['ticket'],
        category,
        usage_count: 1
      },
      status: 'active'
    })
    .select('id')
    .single()
  
  if (error || !newTag) throw new Error(`Failed to create tag: ${error?.message}`)
  return newTag.id
}

async function createCaseAnalysis(
  ticketId: string,
  analysisData: any,
  confidence: number,
  agentId: string,
  accountId: string
): Promise<string> {
  // Get case_analysis type ID
  const { data: caseAnalysisType } = await adminDb
    .from('types')
    .select('id')
    .eq('slug', 'case_analysis')
    .single()
  
  if (!caseAnalysisType) throw new Error('Case analysis type not found')
  
  const { data: caseAnalysis, error } = await adminDb
    .from('items')
    .insert({
      type_id: caseAnalysisType.id,
      account_id: accountId,
      title: `Analysis for Ticket ${ticketId.slice(0, 8)}`,
      data: {
        ticket_id: ticketId,
        analysis_data: analysisData,
        confidence_score: confidence,
        analysis_timestamp: new Date().toISOString(),
        ai_agent_id: agentId
      },
      status: 'completed'
    })
    .select('id')
    .single()
  
  if (error || !caseAnalysis) throw new Error(`Failed to create case analysis: ${error?.message}`)
  
  // Create entity link from case analysis to ticket
  await createEntityLink(
    caseAnalysis.id,
    'items',
    ticketId,
    'items',
    'analyzed_by',
    accountId
  )
  
  return caseAnalysis.id
}

async function createEntityLink(
  sourceId: string,
  sourceType: string,
  targetId: string,
  targetType: string,
  linkTypeSlug: string,
  accountId: string
): Promise<void> {
  // Get link type ID
  const { data: linkType } = await adminDb
    .from('link_types')
    .select('id')
    .eq('slug', linkTypeSlug)
    .single()
  
  if (!linkType) throw new Error(`Link type '${linkTypeSlug}' not found`)
  
  // Get link type ID for the links table
  const { data: linkItemType } = await adminDb
    .from('types')
    .select('id')
    .eq('slug', 'link')
    .single()
  
  if (!linkItemType) throw new Error('Link type not found')
  
  // Check if link already exists
  const { data: existingLink } = await adminDb
    .from('links')
    .select('id')
    .eq('source_id', sourceId)
    .eq('source_type', sourceType)
    .eq('target_id', targetId)
    .eq('target_type', targetType)
    .eq('link_type_id', linkType.id)
    .single()
  
  if (existingLink) return // Link already exists
  
  // Create the link
  const { error } = await adminDb
    .from('links')
    .insert({
      type_id: linkItemType.id, // Required field
      link_type_id: linkType.id,
      account_id: accountId,
      source_type: sourceType,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      link_type: linkTypeSlug,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  
  if (error) throw new Error(`Failed to create entity link: ${error?.message}`)
}

async function createTagLinks(
  ticketId: string,
  tagIds: string[],
  accountId: string
): Promise<void> {
  for (const tagId of tagIds) {
    await createEntityLink(
      ticketId,
      'items',
      tagId,
      'items',
      'tagged_with',
      accountId
    )
  }
}

async function updateTicketWithAnalysis(
  ticketId: string,
  analysisData: any,
  tagIds: string[]
): Promise<void> {
  // Get current ticket data
  const { data: ticket, error: fetchError } = await adminDb
    .from('items')
    .select('data')
    .eq('id', ticketId)
    .single()

  if (fetchError || !ticket) {
    throw new Error(`Ticket not found: ${ticketId}`)
  }

  // Map analysis data to ca_ prefixed field names to match design schema
  const mappedAnalysisData = {
    ca_reported_issue: analysisData.reported_issue,
    ca_true_problem: analysisData.true_problem,
    ca_final_solution: analysisData.final_solution,
    ca_diagnostic_steps: analysisData.diagnostic_steps,
    ca_solution_steps: analysisData.solution_steps,
    ca_analysis_tags: tagIds,
    ca_time_to_resolution: analysisData.time_to_resolution,
    ca_back_and_forth_count: analysisData.back_and_forth_count,
    ca_escalation_required: analysisData.escalation_required,
    ca_automation_potential: analysisData.automation_potential,
    ca_customer_temperature: analysisData.customer_temperature,
    ca_kb_candidate: analysisData.kb_candidate,
    ca_sentiment_progression: analysisData.sentiment_progression,
    analysis_timestamp: new Date().toISOString()
  }

  // Update ticket with analysis data using simple object merge
  const { error } = await adminDb
    .from('items')
    .update({
      data: {
        ...ticket.data,
        ...mappedAnalysisData
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', ticketId)

  if (error) {
    throw new Error(`Failed to update ticket with analysis: ${error.message}`)
  }
}

// ─── ACTION: ANALYZE TICKET ─────────────────────────────────────────────────────

async function handleAnalyzeTicket(ctx: any, body: AnalysisRequest): Promise<AnalysisResult> {
  const { ticket_id } = body
  const account_id = ctx.accountId as string
  
  if (!ticket_id) throw new Error('ticket_id is required')
  if (!account_id) throw new Error('Account context required')

  // Load ticket and conversation data
  const [ticket, conversationHistory, { agent, promptConfig }] = await Promise.all([
    getTicketData(ticket_id),
    getConversationHistory(ticket_id),
    getAgentAndPrompt()
  ])

  // Verify ticket is resolved
  if (ticket.status !== 'resolved') {
    throw new Error('Ticket must be resolved before analysis')
  }

  const modelConfig = agent.model_config || {}
  const model = modelConfig.model || process.env.LLM_DEFAULT_MODEL || 'gpt-4o'
  const temperature = modelConfig.temperature ?? 0.3

  // Build analysis prompt
  const contextTemplate = promptConfig.context_template
    .replace('{{ticket_title}}', ticket.title || '')
    .replace('{{ticket_description}}', ticket.description || '')
    .replace('{{created_at}}', ticket.created_at || '')
    .replace('{{resolved_at}}', ticket.updated_at || '')
    .replace('{{status}}', ticket.data?.status || ticket.status || '')
    .replace('{{priority}}', ticket.data?.priority || 'medium')

  const conversationText = conversationHistory.map(msg => {
    const role = msg.direction === 'inbound' ? 'Customer' : 'Agent'
    return `${role}: ${msg.content}`
  }).join('\n')

  const fullPrompt = contextTemplate.replace('{{conversation_history}}', conversationText)

  // Run AI analysis
  const promptMessages = [{ role: 'user' as const, content: fullPrompt }]
  const { envelope, latency_ms, token_usage } = await callOpenAI(
    agent.system_prompt,
    promptMessages,
    model,
    temperature
  )

  // Process suggested tags
  const suggestedTags = envelope.suggested_tags || []
  const createdTagIds: string[] = []
  
  for (const tagData of suggestedTags) {
    try {
      const tagId = await getOrCreateTag(tagData, account_id)
      createdTagIds.push(tagId)
    } catch (err) {
      console.error(`Failed to create tag ${tagData.slug}:`, err)
    }
  }

  // Create case analysis record
  const caseAnalysisId = await createCaseAnalysis(
    ticket_id,
    envelope,
    envelope.confidence_score || 0.5,
    agent.id,
    account_id
  )

  // Update ticket with analysis data
  await updateTicketWithAnalysis(ticket_id, envelope, createdTagIds)
  
  // Create entity links for tags
  if (createdTagIds.length > 0) {
    await createTagLinks(ticket_id, createdTagIds, account_id)
  }

  return {
    ticketId: ticket_id,
    caseAnalysisId,
    analysisData: envelope,
    createdTags: createdTagIds,
    confidence: envelope.confidence_score || 0.5
  }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const handler = createHandler(async (ctx, body) => {
  const action = ctx.query?.action

  switch (action) {
    case 'analyze_ticket':
      return await handleAnalyzeTicket(ctx, body)
    default:
      throw new Error(`Unknown action: ${action}. Use 'analyze_ticket'.`)
  }
})
