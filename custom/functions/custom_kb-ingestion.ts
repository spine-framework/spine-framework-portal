import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { create as adminCreate, update as adminUpdate } from './admin-data'


interface ParsedChunk {
  identifier: string
  chunk_id: string
  version: string
  hash: string
  macro: string
  micro: string
  inputs: Record<string, string>
  outputs: string
  depends_on: string[]
  depended_by: string[]
  side_effects: string[]
  tags: string[]
  code: string
  metadata: {
    chunk_id: string
    file_path: string
    line_start: number
    line_end: number
    chunk_type: 'function' | 'class' | 'interface' | 'config' | 'object'
    purpose: string
    hash: string
    dependencies: string[]
    dependents: string[]
    source: {
      source_type: 'core'
      ref: string
      line_start: number
      line_end: number
    }
  }
}

interface IngestionRequest {
  chunks: ParsedChunk[]
  force_update?: boolean
}

interface IngestionResponse {
  success: boolean
  items_created: number
  items_updated: number
  embeddings_generated: number
  errors: string[]
  skipped: string[]
  item_ids: string[]
}

// Build a human-readable HTML description for developer consumption
function buildDescriptionHtml(chunk: ParsedChunk, cleanCode: string): string {
  const sections: string[] = []

  // Purpose — always present
  sections.push(`<p><strong>Purpose</strong><br/>${chunk.macro}</p>`)

  if (chunk.micro && chunk.micro !== chunk.macro) {
    sections.push(`<p>${chunk.micro}</p>`)
  }

  // Parameters
  if (chunk.inputs && Object.keys(chunk.inputs).length > 0) {
    const rows = Object.entries(chunk.inputs)
      .map(([name, desc]) => `<code>${name}</code> — ${desc}`)
      .join('<br/>')
    sections.push(`<p><strong>Parameters</strong><br/>${rows}</p>`)
  }

  // Returns
  if (chunk.outputs) {
    sections.push(`<p><strong>Returns</strong><br/>${chunk.outputs}</p>`)
  }

  // Dependencies
  if (chunk.depends_on && chunk.depends_on.length > 0) {
    const depList = chunk.depends_on.map(d => `<code>${d}</code>`).join(', ')
    sections.push(`<p><strong>Dependencies</strong><br/>${depList}</p>`)
  }

  // Side Effects
  if (chunk.side_effects && chunk.side_effects.length > 0) {
    const effectList = chunk.side_effects.join('<br/>')
    sections.push(`<p><strong>Side Effects</strong><br/>${effectList}</p>`)
  }

  // Source location
  sections.push(`<p><strong>Source</strong><br/><code>${chunk.metadata.file_path}</code> lines ${chunk.metadata.line_start}–${chunk.metadata.line_end}</p>`)

  // Code block
  const escapedCode = cleanCode.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  sections.push(`<pre><code>${escapedCode}</code></pre>`)

  return sections.join('\n')
}

// Convert parsed chunk to KB article data
function chunkToKBArticle(chunk: ParsedChunk): any {
  const title = chunk.identifier.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

  // Extract clean code (remove docblock if present)
  let cleanCode = chunk.code
  const docblockMatch = chunk.code.match(/^\/\*\*[\s\S]*?\*\/\s*/)
  if (docblockMatch) {
    cleanCode = chunk.code.substring(docblockMatch[0].length)
  }

  const descriptionHtml = buildDescriptionHtml(chunk, cleanCode)

  const searchKeywords = [
    chunk.identifier,
    chunk.macro,
    chunk.micro,
    ...chunk.tags,
    chunk.metadata.chunk_type,
    'typescript'
  ].filter(Boolean)

  return {
    type_id: 'ce1e50b6-473e-4581-ba0c-e944f47cb240', // kb_article type
    title,
    status: 'published',
    description: descriptionHtml,
    data: {
      kb_type: 'code_chunk',
      priority: 'medium',
      audience: ['developer', 'ai_system'],
      tags: [...chunk.tags, chunk.metadata.chunk_type, 'typescript', 'core'],
      search_keywords: searchKeywords,
      category: 'technical',
      security_level: 'internal',
      source_info: {
        source_type: 'automated_ingestion',
        author: 'chunk-parser-v1.0',
        ingestion_timestamp: new Date().toISOString(),
        original_source: chunk.metadata.file_path
      },
      code_metadata: {
        chunk_id: chunk.chunk_id,
        identifier: chunk.identifier,
        version: chunk.version,
        hash: chunk.hash,
        macro: chunk.macro,
        micro: chunk.micro,
        inputs: chunk.inputs,
        outputs: chunk.outputs,
        depends_on: chunk.depends_on,
        depended_by: chunk.depended_by,
        side_effects: chunk.side_effects,
        file_path: chunk.metadata.file_path,
        line_start: chunk.metadata.line_start,
        line_end: chunk.metadata.line_end,
        chunk_type: chunk.metadata.chunk_type,
        language: 'typescript',
        code: cleanCode.trim()
      },
      related_articles: []
    },
    is_active: true,
    created_by: 'c230fe01-edf4-4e03-b455-c9cbac22b699' // System Admin
  }
}

// Check if chunk already exists
async function findExistingChunk(ctx: any, chunkId: string): Promise<any | null> {
  const { data } = await ctx.db
    .from('items')
    .select('*')
    .eq('type_id', 'ce1e50b6-473e-4581-ba0c-e944f47cb240')
    .filter('data->>kb_type', 'eq', 'code_chunk')
    .filter('data->code_metadata->>chunk_id', 'eq', chunkId)
    .maybeSingle()
  
  return data
}

// Create or update KB article item using standard Spine handlers
async function upsertKBArticle(ctx: any, chunk: ParsedChunk, forceUpdate: boolean = false): Promise<{ created: boolean; id: string }> {
  const existing = await findExistingChunk(ctx, chunk.chunk_id)
  const kbData = chunkToKBArticle(chunk)
  
  if (existing) {
    if (!forceUpdate) {
      throw new Error(`Chunk ${chunk.chunk_id} already exists (use force_update to override)`)
    }
    
    // Update existing item via direct admin-data import (ctx passed through — nested call, no HTTP)
    const ctxWithQuery = { ...ctx, query: { ...ctx.query, entity: 'items', id: existing.id } }
    await adminUpdate(ctxWithQuery, {
      title: kbData.title,
      status: kbData.status,
      description: kbData.description,
      data: kbData.data,
      is_active: kbData.is_active
    })
    
    return { created: false, id: existing.id }
  } else {
    // Create new item via direct admin-data import (ctx passed through — nested call, no HTTP)
    const result: any = await adminCreate(ctx, {
      entity: 'items',
      type_id: kbData.type_id,
      title: kbData.title,
      status: kbData.status,
      description: kbData.description,
      data: kbData.data,
      is_active: kbData.is_active
    })
    
    const id = result?.id
    if (!id) throw new Error('Failed to create KB article: no ID returned')
    return { created: true, id }
  }
}

// Build plain-text semantic content for embedding — developer understanding focus
function buildSemanticContent(chunk: ParsedChunk): string {
  const inputSummary = chunk.inputs && Object.keys(chunk.inputs).length > 0
    ? 'Parameters: ' + Object.entries(chunk.inputs).map(([k, v]) => `${k} (${v})`).join(', ')
    : ''
  const sideEffects = chunk.side_effects && chunk.side_effects.length > 0
    ? 'Side effects: ' + chunk.side_effects.join(', ')
    : ''
  const deps = chunk.depends_on && chunk.depends_on.length > 0
    ? 'Depends on: ' + chunk.depends_on.join(', ')
    : ''

  return [
    chunk.identifier,
    chunk.macro,
    chunk.micro,
    inputSummary,
    chunk.outputs ? `Returns: ${chunk.outputs}` : '',
    deps,
    sideEffects,
    `Tags: ${chunk.tags.join(', ')}`,
    `File: ${chunk.metadata.file_path} lines ${chunk.metadata.line_start}-${chunk.metadata.line_end}`
  ].filter(Boolean).join('\n')
}

// Generate embeddings for a KB item — semantic (understanding) + structure (metadata)
async function generateEmbeddings(ctx: any, itemId: string, chunk: ParsedChunk): Promise<void> {
  const embeddingTypes = ['semantic', 'structure']

  for (const vectorType of embeddingTypes) {
    let content = ''
    let metadata: any = {
      vector_type: vectorType,
      item_type: 'kb_article',
      chunk_id: chunk.chunk_id,
      version: chunk.version,
      kb_type: 'code_chunk'
    }

    switch (vectorType) {
      case 'semantic':
        content = buildSemanticContent(chunk)
        metadata.chunk_type = chunk.metadata.chunk_type
        metadata.file_path = chunk.metadata.file_path
        break

      case 'structure':
        content = JSON.stringify({
          identifier: chunk.identifier,
          chunk_type: chunk.metadata.chunk_type,
          file_path: chunk.metadata.file_path,
          line_start: chunk.metadata.line_start,
          line_end: chunk.metadata.line_end,
          version: chunk.version,
          tags: chunk.tags,
          depends_on: chunk.depends_on,
          depended_by: chunk.depended_by,
          inputs: Object.keys(chunk.inputs || {}),
          has_side_effects: (chunk.side_effects || []).length > 0
        })
        metadata.tags = chunk.tags
        metadata.file_path = chunk.metadata.file_path
        metadata.depends_on = chunk.depends_on
        break
    }

    try {
      const embeddingVector = await generateEmbeddingVector(content)
      await ctx.db.from('embeddings').insert({
        model_id: 'text-embedding-3-small',
        document_id: itemId,
        chunk_index: vectorType === 'semantic' ? 0 : 1,
        content,
        embedding: embeddingVector,
        metadata
      })
    } catch (error) {
      console.error(`Failed to generate ${vectorType} embedding for ${chunk.chunk_id}:`, error)
    }
  }
}

// Generate real embedding vector via OpenAI text-embedding-3-small
async function generateEmbeddingVector(content: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  if (!apiKey) {
    throw new Error('No OPENAI_API_KEY configured — cannot generate embeddings')
  }

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: content,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI embeddings error ${res.status}: ${err.slice(0, 200)}`)
  }

  const result: any = await res.json()
  return result.data?.[0]?.embedding || []
}

// Main ingestion handler
async function handleIngestChunks(ctx: any, chunks: ParsedChunk[], forceUpdate: boolean = false): Promise<IngestionResponse> {
  const response: IngestionResponse = {
    success: true,
    items_created: 0,
    items_updated: 0,
    embeddings_generated: 0,
    errors: [],
    skipped: [],
    item_ids: []
  }
  
  for (const chunk of chunks) {
    try {
      // Validate chunk
      if (!chunk.chunk_id || !chunk.code || !chunk.metadata) {
        response.errors.push(`Invalid chunk data for ${chunk.identifier}`)
        continue
      }
      
      // Create/update KB article
      const { created, id } = await upsertKBArticle(ctx, chunk, forceUpdate)
      
      if (created) {
        response.items_created++
      } else {
        response.items_updated++
      }
      response.item_ids.push(id)
      
      // Generate embeddings
      await generateEmbeddings(ctx, id, chunk)
      response.embeddings_generated++
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`KB ingestion error for ${chunk.identifier}:`, error)
      
      if (errorMessage.includes('already exists')) {
        response.skipped.push(`${chunk.identifier}: ${errorMessage}`)
      } else {
        response.errors.push(`${chunk.identifier}: ${errorMessage}`)
      }
    }
  }
  
  // Determine overall success
  if (response.errors.length > 0 && response.items_created === 0 && response.items_updated === 0) {
    response.success = false
  }
  
  return response
}

export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'POST'

  switch (action) {
    case 'ingest':
      if (method === 'POST') {
        return await handleIngestChunks(ctx, body.chunks, body.force_update)
      }
      break
    
    case 'status':
      if (method === 'GET' || method === 'POST') {
        const existing = await findExistingChunk(ctx, body.chunk_id)
        
        if (!existing) {
          return { found: false }
        }
        
        // Get embedding count
        const { data: embeddings } = await adminDb
          .from('embeddings')
          .select('metadata->>vector_type')
          .eq('document_id', existing.id)
        
        return {
          found: true,
          item: existing,
          embeddings: embeddings?.length || 0,
          vector_types: embeddings?.map(e => e.metadata?.vector_type) || []
        }
      }
      break
    
    case 'delete':
      if (method === 'DELETE' || method === 'POST') {
        const existing = await findExistingChunk(ctx, body.chunk_id)
        
        if (!existing) {
          throw new Error('Chunk not found')
        }
        
        // Delete embeddings first
        await adminDb
          .from('embeddings')
          .delete()
          .eq('document_id', existing.id)
        
        // Delete the item
        await adminDb
          .from('items')
          .delete()
          .eq('id', existing.id)
        
        return { deleted: true }
      }
      break
    
    default:
      if (method === 'POST') {
        return await handleIngestChunks(ctx, body.chunks, body.force_update)
      }
  }

  throw new Error('Invalid action or method')
})
