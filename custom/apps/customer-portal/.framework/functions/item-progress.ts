/**
 * @module item-progress
 * @audience both
 * @layer api-handler
 * @stability stable
 *
 * CRUD + upsert API for the `item_progress` table. Tracks per-person, per-item
 * progress state for courses, tasks, onboarding, and any item-based pipeline.
 *
 * Routed by: GET/POST/PATCH /.netlify/functions/item-progress
 *
 * INVARIANT: (person_id, item_id) is unique — state, not a log.
 * INVARIANT: status transitions are forward-only unless force: true.
 * INVARIANT: score must be 0–100 or null.
 */

import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { emitLog } from './_shared/audit'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const PIPELINE_DEFAULT = ['not_started', 'in_progress', 'completed']

function getPipeline(typeRecord: any): string[] {
  return typeRecord?.design_schema?.pipeline ?? PIPELINE_DEFAULT
}

function isValidTransition(pipeline: string[], from: string, to: string): boolean {
  const fromIdx = pipeline.indexOf(from)
  const toIdx = pipeline.indexOf(to)
  if (fromIdx === -1 || toIdx === -1) return true
  return toIdx >= fromIdx
}

function composeTitle(itemTitle: string | null, personName: string | null): string | null {
  if (!itemTitle && !personName) return null
  if (!personName) return itemTitle
  if (!itemTitle) return personName
  return `${itemTitle} — ${personName}`
}

function composeDescription(status: string, score: number | null, attempts: number | null): string {
  const parts: string[] = []
  const label = status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started'
  parts.push(label)
  if (score !== null && score !== undefined) parts.push(`score ${score}`)
  if (attempts !== null && attempts !== undefined && attempts > 0) parts.push(`${attempts} attempt${attempts === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

// ─── HANDLERS ─────────────────────────────────────────────────────────────────

/**
 * Lists progress records for the authenticated principal.
 * Query params: person_id, item_id, item_ids (comma-sep), status, limit, offset
 */
export const list = createHandler(async (ctx) => {
  const { person_id, item_id, item_ids, status, limit = '100', offset = '0' } = ctx.query || {}

  let query = ctx.db
    .from('item_progress')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (person_id) query = query.eq('person_id', person_id)
  if (item_id)   query = query.eq('item_id', item_id)
  if (item_ids)  query = query.in('item_id', item_ids.split(',').map((s: string) => s.trim()))
  if (status)    query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data
})

/**
 * Gets a single item_progress record by id.
 */
export const get = createHandler(async (ctx) => {
  const id = ctx.query?.id
  if (!id) throw new Error('Progress record ID is required')

  const { data, error } = await ctx.db
    .from('item_progress')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) throw new Error('Progress record not found')
  return data
})

/**
 * Upserts a progress record for (person_id, item_id).
 * Auto-composes title and description. Enforces pipeline transitions.
 * Sets started_at / completed_at timestamps in data. Increments attempts.
 *
 * Body: person_id*, item_id*, type_id*, account_id*, status, score, data,
 *       title, description, app_id, force (bypass direction check)
 */
export const upsert = createHandler(async (ctx, body) => {
  const { person_id, item_id, type_id, account_id, app_id, force } = body || {}
  let { status, score, data: dataPayload, title, description } = body || {}

  if (!person_id || !item_id || !type_id || !account_id) {
    throw new Error('person_id, item_id, type_id, and account_id are required')
  }

  // Fetch type record for pipeline
  const { data: typeRecord } = await adminDb
    .from('types')
    .select('design_schema')
    .eq('id', type_id)
    .single()

  const pipeline = getPipeline(typeRecord)

  // Fetch existing record (if any)
  const { data: existing } = await ctx.db
    .from('item_progress')
    .select('*')
    .eq('person_id', person_id)
    .eq('item_id', item_id)
    .maybeSingle()

  const currentStatus = existing?.status ?? 'not_started'
  const targetStatus  = status ?? currentStatus

  // Validate pipeline transition
  if (status && existing && !force && !isValidTransition(pipeline, currentStatus, targetStatus)) {
    throw new Error(`Invalid status transition: ${currentStatus} → ${targetStatus}. Use force: true to override.`)
  }

  // Merge data payload with timestamps and attempts
  const now = new Date().toISOString()
  const existingData = existing?.data ?? {}
  const attempts = (existingData.attempts ?? 0) + (status && status !== currentStatus ? 1 : 0)
  const mergedData: any = {
    ...existingData,
    ...(dataPayload || {}),
    attempts,
  }
  if (targetStatus === 'in_progress' && !existingData.started_at) mergedData.started_at = now
  if (targetStatus === 'completed' && !existingData.completed_at) mergedData.completed_at = now

  // Auto-compose title/description if not provided
  if (!title) {
    const [{ data: itemRow }, { data: personRow }] = await Promise.all([
      adminDb.from('items').select('title').eq('id', item_id).single(),
      adminDb.from('people').select('full_name').eq('id', person_id).single(),
    ])
    title = composeTitle(itemRow?.title ?? null, personRow?.full_name ?? null) ?? undefined
  }
  if (!description) {
    description = composeDescription(targetStatus, score ?? existing?.score ?? null, mergedData.attempts)
  }

  const payload: any = {
    type_id,
    account_id,
    app_id: app_id ?? existing?.app_id ?? null,
    person_id,
    item_id,
    title: title ?? existing?.title ?? null,
    description,
    status: targetStatus,
    score: score !== undefined ? score : (existing?.score ?? null),
    data: mergedData,
    is_active: true,
    updated_at: now,
  }

  if (!existing) {
    payload.created_by = ctx.principal?.id ?? null
    payload.created_at = now
  } else {
    payload.updated_by = ctx.principal?.id ?? null
  }

  const { data: result, error } = await ctx.db
    .from('item_progress')
    .upsert(payload, { onConflict: 'person_id,item_id' })
    .select()
    .single()

  if (error) throw error

  await emitLog(ctx, 'item_progress.upserted',
    { type: 'item_progress', id: result.id },
    { before: existing ?? null, after: result }
  )

  return result
})

/**
 * Partially updates an existing item_progress record.
 * Body: id (required), plus any updatable fields.
 * Enforces forward-only status transitions unless force: true.
 */
export const update = createHandler(async (ctx, body) => {
  const id = body?.id || ctx.query?.id
  if (!id) throw new Error('Progress record ID is required')

  const { id: _id, force, ...updates } = body || {}

  const { data: existing, error: fetchErr } = await ctx.db
    .from('item_progress')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) throw new Error('Progress record not found')

  if (updates.status && updates.status !== existing.status) {
    const { data: typeRecord } = await adminDb
      .from('types')
      .select('design_schema')
      .eq('id', existing.type_id)
      .single()

    const pipeline = getPipeline(typeRecord)
    if (!force && !isValidTransition(pipeline, existing.status, updates.status)) {
      throw new Error(`Invalid status transition: ${existing.status} → ${updates.status}. Use force: true to override.`)
    }

    const now = new Date().toISOString()
    const mergedData = { ...existing.data, ...(updates.data || {}) }
    if (updates.status === 'in_progress' && !existing.data?.started_at) mergedData.started_at = now
    if (updates.status === 'completed'   && !existing.data?.completed_at) mergedData.completed_at = now
    updates.data = mergedData

    if (!updates.description) {
      updates.description = composeDescription(
        updates.status,
        updates.score ?? existing.score,
        mergedData.attempts ?? null
      )
    }
  }

  const { data: result, error } = await ctx.db
    .from('item_progress')
    .update({ ...updates, updated_by: ctx.principal?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  await emitLog(ctx, 'item_progress.updated',
    { type: 'item_progress', id },
    { before: existing, after: result }
  )

  return result
})

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const handler = createHandler(async (ctx, body) => {
  const method = ctx.query?.method || 'GET'
  const id = ctx.query?.id

  if (method === 'GET')   return id ? get(ctx, body) : list(ctx, body)
  if (method === 'POST')  return upsert(ctx, body)
  if (method === 'PATCH') return update(ctx, body)

  throw new Error(`Method ${method} not supported`)
})
