/**
 * @module embeddings
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * CRUD and search API for the `embeddings` table. Embeddings store vector
 * representations of text chunks for RAG (retrieval-augmented generation)
 * workloads. Vector similarity search is performed via the
 * `search_similar_embeddings` Postgres RPC function.
 *
 * **Routed by:** `GET/POST/PATCH /.netlify/functions/embeddings`
 *
 * **Actions:**
 * | method | ?action         | handler           |
 * |--------|-----------------|-------------------|
 * | GET    | stats           | getStats          |
 * | POST   | batch-create    | batchCreate       |
 * | POST   | delete-document | deleteByDocument  |
 * | POST   | cleanup         | cleanup           |
 * | POST   | search-similar  | searchSimilar     |
 * | POST   | search-semantic | searchSemantic    |
 * | GET    | ?id             | get               |
 * | GET    | (default)       | list              |
 * | POST   | —               | create            |
 * | PATCH  | —               | update            |
 *
 * **Authorization:** All operations use `ctx.db` (RLS-scoped). Account context
 * required for writes. No hard-delete endpoint — use `delete-document` or
 * `cleanup` for bulk removal.
 *
 * INVARIANT: `update` only patches `content` and `metadata`.
 * INVARIANT: `searchSimilar` requires a pre-computed `query_embedding` vector.
 *   Use `searchSemantic` for text-based fallback.
 *
 * @seeAlso agent-runner.ts (executeSearchKnowledge calls search_similar_embeddings)
 * @seeAlso pipeline-runner.ts (search_knowledge stage type)
 * @seeAlso audit.ts (emitLog for embedding.* / embeddings.* events)
 */

import { createHandler } from './_shared/middleware'
import { emitLog } from './_shared/audit'
import { sanitizeRecordData } from './_shared/permissions'

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_LIST ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_LIST_1_0_0
 * @version     1.0.0
 * @hash        929d4ac3030c10ac7a31bef9cad565900a5cd11af2e130ce3e4cfc28bc65d5ab
 * @macro       Embeddings List Handler
 * @micro       Lists embeddings with filtering, pagination, and sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Array of sanitized embedding records
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB queries, permission sanitization]
 * @tags        embeddings, list, crud, pagination
 */
export const list = createHandler(async (ctx, _body) => {
  const { model_id, document_id, limit = 100, offset = 0 } = ctx.query || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  // RLS automatically filters to accessible accounts
  let query = ctx.db
    .from('embeddings')
    .select('*')
    .order('created_at', { ascending: false })

  if (model_id) {
    query = query.eq('model_id', model_id)
  }
  if (document_id) {
    query = query.eq('document_id', document_id)
  }

  const parsedOffset = parseInt(offset.toString())
  const parsedLimit = parseInt(limit.toString())

  const { data, error: err } = await query.range(
    parsedOffset,
    parsedOffset + parsedLimit - 1
  )

  if (err) throw err

  const sanitized = []
  for (const embedding of data || []) {
    sanitized.push(await sanitizeRecordData(ctx, embedding, 'embedding'))
  }

  return sanitized
})
// ─── CHUNK_END: EMBEDDINGS_LIST ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_GET ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_GET_1_0_0
 * @version     1.0.0
 * @hash        261bfd4dd3107ebfbc0a2ee3d870ac449f543699358a03d8bea27f86ba57b5bc
 * @macro       Embedding Get Handler
 * @micro       Returns single embedding record with sanitization
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     Sanitized embedding record
 * @depends-on  [createHandler, sanitizeRecordData]
 * @depended-by [Netlify function routing]
 * @side-effects [DB single row query, permission sanitization]
 * @tags        embeddings, get, crud, single-record
 */
export const get = createHandler(async (ctx, _body) => {
  const { id } = ctx.query || {}

  if (!id) {
    throw new Error('Embedding ID is required')
  }

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .select('*')
    .eq('id', id)
    .single()

  if (err) throw err

  return await sanitizeRecordData(ctx, data, 'embedding')
})
// ─── CHUNK_END: EMBEDDINGS_GET ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_CREATE_1_0_0
 * @version     1.0.0
 * @hash        26bc1b478138d27fc02ebeede1b0ede362ef43864591bc7353390d5f60ae81db
 * @macro       Embedding Create Handler
 * @micro       Creates embedding record with validation and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Embedding data including model_id, document_id, content
 * @outputs     Inserted embedding record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB insert, audit logging]
 * @tags        embeddings, create, crud, audit
 */
export const create = createHandler(async (ctx, body) => {
  const { model_id, document_id, chunk_index, content, metadata } = body

  if (!model_id || !document_id || !content) {
    throw new Error('model_id, document_id, and content are required')
  }

  if (!ctx.principal || ctx.principal.id === 'anonymous' || !ctx.accountId) {
    throw new Error('User context (person and account) required')
  }

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .insert({
      model_id,
      document_id,
      chunk_index: chunk_index || 0,
      content,
      metadata: metadata || {},
      account_id: ctx.accountId
    })
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'embedding.created', 
    { type: 'embedding', id: data.id }, 
    { after: { document_id, model_id } }
  )

  return data
})
// ─── CHUNK_END: EMBEDDINGS_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_UPDATE ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_UPDATE_1_0_0
 * @version     1.0.0
 * @hash        e543c87308991159cda8e50f85127884475004bffaedb4508117481375bfaa43
 * @macro       Embedding Update Handler
 * @micro       Updates embedding content and/or metadata with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — Embedding updates including id
 * @outputs     Updated embedding record
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB update, audit logging]
 * @tags        embeddings, update, crud, audit
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  const { id: _bodyId, content, metadata } = body || {}

  if (!id) {
    throw new Error('Embedding ID is required')
  }

  const updateFields: Record<string, any> = {}
  if (content !== undefined) updateFields.content = content
  if (metadata !== undefined) updateFields.metadata = metadata

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .update(updateFields)
    .eq('id', id)
    .select()
    .single()

  if (err) throw err

  await emitLog(ctx, 'embedding.updated', 
    { type: 'embedding', id }, 
    { after: { content_updated: !!content } }
  )

  return data
})
// ─── CHUNK_END: EMBEDDINGS_UPDATE ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_GET_STATS ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_GET_STATS_1_0_0
 * @version     1.0.0
 * @hash        176a002d14e89cffb0cb993b554c28e2258f66951901be49a4eccbe7855a2d7a
 * @macro       Embeddings Statistics Handler
 * @micro       Returns total embedding count for account with RLS scoping
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      _body: any — Request body (unused for GET)
 * @outputs     {total_embeddings: number} — Total count of embeddings
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB count query]
 * @tags        embeddings, stats, count, monitoring
 */
export const getStats = createHandler(async (ctx, _body) => {
  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const { count, error: err } = await ctx.db
    .from('embeddings')
    .select('*', { count: 'exact', head: true })

  if (err) throw err

  return { total_embeddings: count || 0 }
})
// ─── CHUNK_END: EMBEDDINGS_GET_STATS ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_BATCH_CREATE ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_BATCH_CREATE_1_0_0
 * @version     1.0.0
 * @hash        18f603dbb73e044737283100d6e4cc092597a61645905473d6c6ec1ee67a9d7f
 * @macro       Embeddings Batch Create Handler
 * @micro       Bulk inserts multiple embeddings with account stamping and audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — embeddings_data array of embedding objects
 * @outputs     Array of inserted embedding records
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [Bulk DB insert, audit logging]
 * @tags        embeddings, batch-create, bulk, audit
 */
export const batchCreate = createHandler(async (ctx, body) => {
  const { embeddings_data } = body

  if (!embeddings_data || !Array.isArray(embeddings_data)) {
    throw new Error('embeddings_data array is required')
  }

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  const rows = embeddings_data.map((e: any) => ({
    ...e,
    account_id: ctx.accountId
  }))

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .insert(rows)
    .select()

  if (err) throw err

  await emitLog(ctx, 'embeddings.batch_created', 
    { type: 'system', id: 'batch_create' }, 
    { after: { batch_size: embeddings_data.length } }
  )

  return data
})
// ─── CHUNK_END: EMBEDDINGS_BATCH_CREATE ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_DELETE_BY_DOCUMENT ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_DELETE_BY_DOCUMENT_1_0_0
 * @version     1.0.0
 * @hash        1f74f199f69f563dbc9e72c0f3906412d6315721212261c5a61da4250cb34909
 * @macro       Embeddings Document Delete Handler
 * @micro       Deletes all embeddings for a document with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — document_id to delete embeddings for
 * @outputs     {deleted_count: number} — Number of deleted embeddings
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete, audit logging]
 * @tags        embeddings, delete, document, audit
 */
export const deleteByDocument = createHandler(async (ctx, body) => {
  const { document_id } = body

  if (!document_id) {
    throw new Error('document_id is required')
  }

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .delete()
    .eq('document_id', document_id)
    .select()

  if (err) throw err

  await emitLog(ctx, 'embeddings.document_deleted', 
    { type: 'system', id: 'document_delete' }, 
    { after: { document_id, deleted_count: data?.length || 0 } }
  )

  return { deleted_count: data?.length || 0 }
})
// ─── CHUNK_END: EMBEDDINGS_DELETE_BY_DOCUMENT ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_CLEANUP ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_CLEANUP_1_0_0
 * @version     1.0.0
 * @hash        b5caa85d93d7eb232eaf7f81c63f7adc4269898397c4cc1d9186ce868a056223
 * @macro       Embeddings Cleanup Handler
 * @micro       Deletes old embeddings beyond retention period with audit logging
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — days_to_keep (default 365)
 * @outputs     {deleted_count: number} — Number of deleted embeddings
 * @depends-on  [createHandler, emitLog]
 * @depended-by [Netlify function routing]
 * @side-effects [DB delete by date, audit logging]
 * @tags        embeddings, cleanup, retention, audit
 */
export const cleanup = createHandler(async (ctx, body) => {
  const { days_to_keep } = body
  const daysToKeep = days_to_keep || 365

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysToKeep)

  const { data, error: err } = await ctx.db
    .from('embeddings')
    .delete()
    .lt('created_at', cutoff.toISOString())
    .select()

  if (err) throw err

  await emitLog(ctx, 'embeddings.cleaned', 
    { type: 'system', id: 'batch_cleanup' }, 
    { after: { days_to_keep: daysToKeep, deleted_count: data?.length || 0 } }
  )

  return { deleted_count: data?.length || 0 }
})
// ─── CHUNK_END: EMBEDDINGS_CLEANUP ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_SEARCH_SIMILAR ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_SEARCH_SIMILAR_1_0_0
 * @version     1.0.0
 * @hash        e34df64fa1db62cdef551da14b15e6f7183915562ca68763b5ebe28fe889fff7
 * @macro       Embeddings Vector Search Handler
 * @micro       Performs vector similarity search using cosine similarity via RPC
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — query_embedding vector and search parameters
 * @outputs     {results, count, model_id, threshold} — Search results with metadata
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing, agent-runner.ts]
 * @side-effects [RPC call for vector similarity search]
 * @tags        embeddings, search, vector, similarity, rpc
 */
export const searchSimilar = createHandler(async (ctx, body) => {
  const { query_embedding, model_id, limit = 10, threshold = 0.7 } = body || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!query_embedding) {
    throw new Error('query_embedding is required for similarity search')
  }

  // Call the RPC function for vector similarity search
  const { data, error: err } = await ctx.db.rpc('search_similar_embeddings', {
    p_account_id: ctx.accountId,
    p_model_id: model_id || 'text-embedding-ada-002',
    p_query_embedding: query_embedding,
    p_limit: parseInt(limit.toString()),
    p_threshold: parseFloat(threshold.toString())
  })

  if (err) throw err

  return {
    results: data || [],
    count: data?.length || 0,
    model_id: model_id || 'text-embedding-ada-002',
    threshold: parseFloat(threshold.toString())
  }
})
// ─── CHUNK_END: EMBEDDINGS_SEARCH_SIMILAR ────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_SEARCH_SEMANTIC ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_SEARCH_SEMANTIC_1_0_0
 * @version     1.0.0
 * @hash        26c9cb4da3ddfa47c34afd1c60c2568f760a97d07719a58e9ae2e3d3926e84ce
 * @macro       Embeddings Text Search Handler
 * @micro       Performs full-text search on embedding content using Postgres websearch
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: object — query string and optional filters
 * @outputs     {results, count, method, query} — Search results with metadata
 * @depends-on  [createHandler]
 * @depended-by [Netlify function routing]
 * @side-effects [DB full-text search query]
 * @tags        embeddings, search, text-search, fallback
 */
export const searchSemantic = createHandler(async (ctx, body) => {
  const { query, model_id, document_ids, limit = 10 } = body || {}

  if (!ctx.accountId) {
    throw new Error('Account context required')
  }

  if (!query) {
    throw new Error('query is required for semantic search')
  }

  let dbQuery = ctx.db
    .from('embeddings')
    .select('*')
    .eq('account_id', ctx.accountId)
    .textSearch('content', query, {
      type: 'websearch',
      config: 'english'
    })
    .limit(parseInt(limit.toString()))

  if (model_id) {
    dbQuery = dbQuery.eq('model_id', model_id)
  }

  if (document_ids && Array.isArray(document_ids) && document_ids.length > 0) {
    dbQuery = dbQuery.in('document_id', document_ids)
  }

  const { data, error: err } = await dbQuery

  if (err) throw err

  return {
    results: data || [],
    count: data?.length || 0,
    method: 'text_search',
    query
  }
})
// ─── CHUNK_END: EMBEDDINGS_SEARCH_SEMANTIC ────────────────────────────────────────────────

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

// ─── CHUNK_START: EMBEDDINGS_HANDLER ──────────────────────────────────────────────
/**
 * @chunk-id    EMBEDDINGS_HANDLER_1_0_0
 * @version     1.0.0
 * @hash        5c4c550bcf413d5975c54a1f1cbfbc4641425d663127fa55fac1616085a43644
 * @macro       Embeddings Router
 * @micro       Routes HTTP methods and actions to appropriate handlers
 * @inputs      ctx: CoreContext — Request context with principal and database
 * @inputs      body: any — Request body for POST/PATCH operations
 * @outputs     Varies — Depends on routed handler (list/get/create/update/batch-create/delete-document/cleanup/search-similar/search-semantic/stats)
 * @depends-on  [createHandler, list, get, create, update, getStats, batchCreate, deleteByDocument, cleanup, searchSimilar, searchSemantic]
 * @depended-by [Netlify function routing]
 * @side-effects [Delegates to appropriate handler]
 * @tags        embeddings, router, crud, netlify-function
 */
export const handler = createHandler(async (ctx, body) => {
  const { action } = ctx.query || {}
  const method = ctx.query?.method || 'GET'

  switch (action) {
    case 'stats':
      if (method === 'GET') {
        return await getStats(ctx, body)
      }
      break
    case 'batch-create':
      if (method === 'POST') {
        return await batchCreate(ctx, body)
      }
      break
    case 'delete-document':
      if (method === 'POST') {
        return await deleteByDocument(ctx, body)
      }
      break
    case 'cleanup':
      if (method === 'POST') {
        return await cleanup(ctx, body)
      }
      break
    case 'search-similar':
      if (method === 'POST') {
        return await searchSimilar(ctx, body)
      }
      break
    case 'search-semantic':
      if (method === 'POST') {
        return await searchSemantic(ctx, body)
      }
      break
    default:
      if (method === 'GET') {
        if (ctx.query?.id) {
          return await get(ctx, body)
        } else {
          return await list(ctx, body)
        }
      } else if (method === 'POST') {
        return await create(ctx, body)
      } else if (method === 'PATCH') {
        return await update(ctx, body)
      }
  }

  throw new Error('Invalid action or method')
})
// ─── CHUNK_END: EMBEDDINGS_HANDLER ────────────────────────────────────────────────
