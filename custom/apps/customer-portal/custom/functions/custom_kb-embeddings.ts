import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { chunkArticle, htmlToPlainText } from './custom_kb-chunker'

interface KBEmbeddingRequest {
  item_id: string
  vector_types: ('semantic' | 'structure' | 'code')[]
  force_regenerate?: boolean
}

interface KBEmbeddingResponse {
  success: boolean
  embeddings_created: number
  embeddings_updated: number
  errors: string[]
}

// Generate semantic embedding (full content)
function decodeHtmlContent(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Build semantic content from structured code_metadata — developer understanding focus
function buildSemanticContent(item: any): string {
  const cm = item.data?.code_metadata || {}
  const inputs = cm.inputs && Object.keys(cm.inputs).length > 0
    ? 'Parameters: ' + Object.entries(cm.inputs).map(([k, v]) => `${k} (${v})`).join(', ')
    : ''
  const deps = cm.depends_on && cm.depends_on.length > 0
    ? 'Depends on: ' + cm.depends_on.join(', ')
    : ''
  const sideEffects = cm.side_effects && cm.side_effects.length > 0
    ? 'Side effects: ' + cm.side_effects.join(', ')
    : ''

  return [
    cm.identifier || item.title || '',
    cm.macro || '',
    cm.micro || '',
    inputs,
    cm.outputs ? `Returns: ${cm.outputs}` : '',
    deps,
    sideEffects,
    `Tags: ${(item.data?.tags || []).join(', ')}`,
    cm.file_path ? `File: ${cm.file_path} lines ${cm.line_start}-${cm.line_end}` : ''
  ].filter(Boolean).join('\n')
}

// Build structure content from metadata — for filtering/faceted search
function buildStructureContent(item: any): string {
  const cm = item.data?.code_metadata || {}
  return JSON.stringify({
    identifier: cm.identifier || '',
    chunk_type: cm.chunk_type || '',
    file_path: cm.file_path || '',
    line_start: cm.line_start,
    line_end: cm.line_end,
    version: cm.version || '',
    tags: item.data?.tags || [],
    depends_on: cm.depends_on || [],
    depended_by: cm.depended_by || [],
    inputs: Object.keys(cm.inputs || {}),
    has_side_effects: (cm.side_effects || []).length > 0
  })
}

// Generate real embedding vector via OpenAI text-embedding-3-small (single input)
async function generateEmbeddingVector(content: string): Promise<string> {
  const vectors = await generateEmbeddingBatch([content])
  return vectors[0]
}

// Batch-generate embedding vectors — one API call for multiple inputs
async function generateEmbeddingBatch(inputs: string[]): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('No OPENAI_API_KEY configured — cannot generate embeddings')
  }

  if (inputs.length === 0) return []

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: inputs,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 200)}`)
  }

  const result: any = await res.json()
  // OpenAI returns embeddings sorted by index
  const sorted = (result.data || []).sort((a: any, b: any) => a.index - b.index)
  return sorted.map((d: any) => `[${d.embedding.join(',')}]`)
}

// Insert an embedding record (used during batch writes)
async function insertEmbedding(
  itemId: string,
  vectorType: string,
  chunkIndex: number,
  content: string,
  embedding: string,
  metadata: any
): Promise<void> {
  await adminDb
    .from('embeddings')
    .insert({
      account_id: '12acec9b-8451-40e7-80d5-e80c4e2fc0de', // Master account
      model_id: 'text-embedding-3-small',
      document_id: itemId,
      chunk_index: chunkIndex,
      content: content,
      embedding: embedding,
      metadata: {
        vector_type: vectorType,
        item_type: 'kb_article',
        ...metadata
      }
    })
}

// Delete all existing embeddings for a document (called before re-embedding)
async function deleteExistingEmbeddings(itemId: string): Promise<number> {
  const { data } = await adminDb
    .from('embeddings')
    .delete()
    .eq('document_id', itemId)
    .eq('metadata->>item_type', 'kb_article')
    .select('id')

  return data?.length || 0
}

// Build article-level structure content for non-code articles
function buildArticleStructureContent(item: any): string {
  return JSON.stringify({
    title: item.title || '',
    kb_type: item.data?.kb_type || '',
    category: item.data?.category || '',
    tags: item.data?.tags || [],
    audience: item.data?.audience || [],
    security_level: item.data?.security_level || '',
    priority: item.data?.priority || '',
  })
}

// Determine if an item is a code chunk (ingested) vs a manual article
function isCodeChunk(item: any): boolean {
  return !!(item.data?.code_metadata?.chunk_id || item.data?.code_metadata?.file_path)
}

// Main handler for generating KB embeddings
async function handleGenerateEmbeddings(
  itemId: string,
  vectorTypes: string[],
  forceRegenerate: boolean = false
): Promise<KBEmbeddingResponse> {
  const response: KBEmbeddingResponse = {
    success: true,
    embeddings_created: 0,
    embeddings_updated: 0,
    errors: []
  }

  try {
    // Get the KB item
    const { data: item, error: itemError } = await adminDb
      .from('items')
      .select('*')
      .eq('id', itemId)
      .eq('type_id', 'ce1e50b6-473e-4581-ba0c-e944f47cb240') // kb_article type
      .single()

    if (itemError || !item) {
      throw new Error('KB item not found')
    }

    // Check if embeddings already exist
    if (!forceRegenerate) {
      const { data: existing } = await adminDb
        .from('embeddings')
        .select('id')
        .eq('document_id', itemId)
        .eq('metadata->>item_type', 'kb_article')
        .limit(1)

      if (existing && existing.length > 0) {
        response.errors.push('Embeddings already exist (use force_regenerate to override)')
        response.success = false
        return response
      }
    }

    // Delete existing embeddings before regenerating
    const deleted = await deleteExistingEmbeddings(itemId)
    if (deleted > 0) {
      response.embeddings_updated = deleted
    }

    // ── Code chunks: legacy path (single semantic + single structure) ──
    if (isCodeChunk(item)) {
      const semanticContent = buildSemanticContent(item)
      const structureContent = buildStructureContent(item)

      const vectors = await generateEmbeddingBatch([semanticContent, structureContent])

      await Promise.all([
        insertEmbedding(itemId, 'semantic', 0, semanticContent, vectors[0], {
          kb_type: item.data?.kb_type,
          chunk_id: item.data?.code_metadata?.chunk_id,
          chunk_type: item.data?.code_metadata?.chunk_type,
          file_path: item.data?.code_metadata?.file_path,
        }),
        insertEmbedding(itemId, 'structure', 0, structureContent, vectors[1], {
          kb_type: item.data?.kb_type,
          tags: item.data?.tags,
          file_path: item.data?.code_metadata?.file_path,
          depends_on: item.data?.code_metadata?.depends_on,
        }),
      ])

      response.embeddings_created = 2
      return response
    }

    // ── Article path: chunk → batch embed → parallel write ──
    const articleContent = item.description || ''
    const chunks = chunkArticle(articleContent, {
      articleTitle: item.title || 'Untitled',
    })

    // Build all texts to embed: N semantic chunks + 1 structure
    const structureContent = buildArticleStructureContent(item)
    const allTexts = [...chunks.map(c => c.content), structureContent]

    // Single batched API call to OpenAI
    const allVectors = await generateEmbeddingBatch(allTexts)

    // Parallel DB writes
    const writePromises: Promise<void>[] = []

    // Semantic embeddings — one per chunk
    for (let i = 0; i < chunks.length; i++) {
      writePromises.push(
        insertEmbedding(itemId, 'semantic', i, chunks[i].content, allVectors[i], {
          kb_type: item.data?.kb_type,
          chunk_index: i,
          chunk_total: chunks.length,
          section_path: chunks[i].sectionPath,
        })
      )
    }

    // Structure embedding — article-level, single vector
    writePromises.push(
      insertEmbedding(itemId, 'structure', 0, structureContent, allVectors[chunks.length], {
        kb_type: item.data?.kb_type,
        tags: item.data?.tags,
        category: item.data?.category,
        audience: item.data?.audience,
      })
    )

    await Promise.all(writePromises)
    response.embeddings_created = chunks.length + 1

  } catch (error) {
    response.success = false
    response.errors = [error instanceof Error ? error.message : String(error)]
  }

  return response
}

// Generate embedding vector for a query string via OpenAI
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('No OPENAI_API_KEY configured — vector search unavailable')
  }

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 200)}`)
  }

  const result: any = await res.json()
  return result.data?.[0]?.embedding || []
}

// Platform KB account
const KB_PLATFORM_ACCOUNT_ID = '12acec9b-8451-40e7-80d5-e80c4e2fc0de'

// Search embeddings via vector similarity
async function handleSearchEmbeddings(
  query: string,
  accountId: string | null,
  vectorType: string = 'semantic',
  limit: number = 8
): Promise<any[]> {
  if (!query || query.trim().length < 2) return []

  // Generate embedding for the search query
  const queryEmbedding = await generateQueryEmbedding(query.trim())

  // Build account filter: user's account + platform KB
  const accountIds = accountId
    ? [accountId, KB_PLATFORM_ACCOUNT_ID]
    : [KB_PLATFORM_ACCOUNT_ID]

  // Call the match_embeddings RPC — fetch extra to account for chunk deduplication
  const { data: matches, error } = await adminDb.rpc('match_embeddings', {
    query_embedding: queryEmbedding,
    match_count: limit * 3,
    filter_account_ids: accountIds,
    filter_vector_type: vectorType,
    similarity_threshold: 0.15,
  })

  if (error) throw new Error(`Vector search failed: ${error.message}`)

  // Filter by similarity threshold + restricted cross-account results
  const SIMILARITY_THRESHOLD = 0.15
  const filtered = (matches || []).filter((r: any) => {
    if (r.similarity < SIMILARITY_THRESHOLD) return false
    if (r.account_id === accountId) return true
    return r.metadata?.security_level !== 'restricted'
  })

  // Deduplicate by document_id — keep only the best-matching chunk per article
  const bestByDoc = new Map<string, any>()
  for (const r of filtered) {
    const existing = bestByDoc.get(r.document_id)
    if (!existing || r.similarity > existing.similarity) {
      bestByDoc.set(r.document_id, r)
    }
  }
  const deduped = [...bestByDoc.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  // Enrich with item title from the items table
  const docIds = deduped.map((r: any) => r.document_id)
  if (docIds.length === 0) return []

  const { data: items } = await adminDb
    .from('items')
    .select('id, title, description, status, data')
    .in('id', docIds)

  const itemMap = new Map((items || []).map((i: any) => [i.id, i]))

  return deduped.map((r: any) => {
    const item = itemMap.get(r.document_id)
    return {
      id: r.document_id,
      title: item?.title || '',
      description: item?.description || '',
      status: item?.status || '',
      data: item?.data || {},
      similarity: r.similarity,
      matched_section: r.metadata?.section_path || null,
    }
  })
}

// Delete embeddings for an item
async function handleDeleteEmbeddings(itemId: string): Promise<{ deleted: number }> {
  const { data, error } = await adminDb
    .from('embeddings')
    .delete()
    .eq('document_id', itemId)
    .eq('metadata->>item_type', 'kb_article')

  if (error) throw error

  return { deleted: data?.length || 0 }
}

export const handler = createHandler(async (ctx: any, body: any) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'POST'

  switch (action) {
    case 'generate':
      if (method === 'POST') {
        const ids: string[] = body.item_ids || (body.item_id ? [body.item_id] : [])
        let totalCreated = 0, totalUpdated = 0
        const allErrors: string[] = []
        for (const id of ids) {
          const r = await handleGenerateEmbeddings(id, body.vector_types, body.force_regenerate)
          totalCreated += r.embeddings_created
          totalUpdated += r.embeddings_updated
          allErrors.push(...r.errors)
        }
        return {
          success: allErrors.length === 0 || totalCreated > 0 || totalUpdated > 0,
          embeddings_created: totalCreated,
          embeddings_updated: totalUpdated,
          errors: allErrors
        }
      }
      break
    
    case 'search':
      if (method === 'GET' || method === 'POST') {
        const q = body.query || ctx.query?.q || ''
        const acctId = body.account_id || ctx.principal?.account_id || null
        return await handleSearchEmbeddings(
          q,
          acctId,
          body.vector_type || 'semantic',
          body.limit || 8
        )
      }
      break
    
    case 'delete':
      if (method === 'DELETE' || method === 'POST') {
        return await handleDeleteEmbeddings(body.item_id)
      }
      break
    
    default:
      if (method === 'POST') {
        const ids: string[] = body.item_ids || (body.item_id ? [body.item_id] : [])
        let totalCreated = 0, totalUpdated = 0
        const allErrors: string[] = []
        for (const id of ids) {
          const r = await handleGenerateEmbeddings(id, body.vector_types, body.force_regenerate)
          totalCreated += r.embeddings_created
          totalUpdated += r.embeddings_updated
          allErrors.push(...r.errors)
        }
        return {
          success: allErrors.length === 0 || totalCreated > 0 || totalUpdated > 0,
          embeddings_created: totalCreated,
          embeddings_updated: totalUpdated,
          errors: allErrors
        }
      }
  }

  throw new Error('Invalid action or method')
})
