import { createHandler } from './_shared/middleware'
import { adminDb } from './_shared/db'

/**
 * Custom Tag Management Handler
 *
 * Actions:
 * - POST ?action=create_or_get_tag - Get existing tag or create new one
 * - POST ?action=list_tags - List tags with filtering
 * - POST ?action=update_tag_usage - Increment tag usage count
 * - POST ?action=merge_tags - Merge duplicate tags
 * 
 * Provides centralized tag management for case analysis and other systems.
 */

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TAG_TYPE_ID = 'tag' // Will be looked up by slug

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TagRequest {
  slug: string
  name: string
  purpose?: string
  category: 'bug_classification' | 'knowledge_value' | 'process_type' | 'sentiment'
  applicable_to?: string[]
}

interface TagResponse {
  id: string
  slug: string
  name: string
  purpose?: string
  category: string
  applicable_to: string[]
  usage_count: number
  created_at: string
  updated_at: string
}

interface ListTagsRequest {
  category?: string
  applicable_to?: string
  limit?: number
  offset?: number
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getTagTypeId(): Promise<string> {
  const { data: tagType } = await adminDb
    .from('types')
    .select('id')
    .eq('slug', 'tag')
    .single()
  
  if (!tagType) throw new Error('Tag type not found')
  return tagType.id
}

async function findExistingTag(slug: string): Promise<TagResponse | null> {
  const { data: tag } = await adminDb
    .from('items')
    .select('*')
    .eq('type_id', await getTagTypeId())
    .eq('data->>slug', slug)
    .single()
  
  if (!tag) return null
  
  return {
    id: tag.id,
    slug: tag.data?.slug || '',
    name: tag.title,
    purpose: tag.description,
    category: tag.data?.category || '',
    applicable_to: tag.data?.applicable_to || ['ticket'],
    usage_count: tag.data?.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at
  }
}

async function createTag(
  tagData: TagRequest,
  accountId: string
): Promise<TagResponse> {
  const tagTypeId = await getTagTypeId()
  
  const { data: tag, error } = await adminDb
    .from('items')
    .insert({
      type_id: tagTypeId,
      account_id: accountId,
      title: tagData.name,
      description: tagData.purpose,
      data: {
        slug: tagData.slug,
        name: tagData.name,
        purpose: tagData.purpose,
        applicable_to: tagData.applicable_to || ['ticket'],
        category: tagData.category,
        usage_count: 1
      },
      status: 'active'
    })
    .select('*')
    .single()
  
  if (error || !tag) throw new Error(`Failed to create tag: ${error?.message}`)
  
  return {
    id: tag.id,
    slug: tag.data?.slug || '',
    name: tag.title,
    purpose: tag.description,
    category: tag.data?.category || '',
    applicable_to: tag.data?.applicable_to || ['ticket'],
    usage_count: tag.data?.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at
  }
}

async function incrementTagUsage(tagId: string): Promise<void> {
  await adminDb
    .from('items')
    .update({
      data: adminDb.sql`jsonb_set(data, '{usage_count}', COALESCE((data->>'usage_count')::int, 0) + 1)`,
      updated_at: new Date().toISOString()
    })
    .eq('id', tagId)
}

// ─── ACTIONS ───────────────────────────────────────────────────────────────────

async function handleCreateOrGetTag(
  ctx: any,
  body: TagRequest
): Promise<TagResponse> {
  const account_id = ctx.accountId as string
  
  if (!account_id) throw new Error('Account context required')
  if (!body.slug || !body.name || !body.category) {
    throw new Error('slug, name, and category are required')
  }

  // Validate slug format
  if (!/^[a-z0-9_-]+$/.test(body.slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, hyphens, and underscores')
  }

  // Try to find existing tag
  const existingTag = await findExistingTag(body.slug)
  
  if (existingTag) {
    // Increment usage count
    await incrementTagUsage(existingTag.id)
    
    // Return updated tag with incremented count
    const updatedTag = await findExistingTag(body.slug)
    if (!updatedTag) throw new Error('Failed to retrieve updated tag')
    
    return updatedTag
  }
  
  // Create new tag
  return await createTag(body, account_id)
}

async function handleListTags(
  ctx: any,
  body: ListTagsRequest
): Promise<{ tags: TagResponse[]; total: number }> {
  const { category, applicable_to, limit = 50, offset = 0 } = body
  const tagTypeId = await getTagTypeId()
  
  let query = adminDb
    .from('items')
    .select('*', { count: 'exact' })
    .eq('type_id', tagTypeId)
    .eq('status', 'active')
    .order('data->>usage_count', { ascending: false })
    .range(offset, offset + limit - 1)
  
  // Add filters
  if (category) {
    query = query.eq('data->>category', category)
  }
  
  if (applicable_to) {
    query = query.contains('data->>applicable_to', [applicable_to])
  }
  
  const { data: tags, error, count } = await query
  
  if (error) throw new Error(`Failed to list tags: ${error?.message}`)
  
  const formattedTags: TagResponse[] = (tags || []).map(tag => ({
    id: tag.id,
    slug: tag.data?.slug || '',
    name: tag.title,
    purpose: tag.description,
    category: tag.data?.category || '',
    applicable_to: tag.data?.applicable_to || ['ticket'],
    usage_count: tag.data?.usage_count || 0,
    created_at: tag.created_at,
    updated_at: tag.updated_at
  }))
  
  return {
    tags: formattedTags,
    total: count || 0
  }
}

async function handleUpdateTagUsage(
  ctx: any,
  body: { tag_id: string }
): Promise<void> {
  if (!body.tag_id) throw new Error('tag_id is required')
  
  await incrementTagUsage(body.tag_id)
}

async function handleMergeTags(
  ctx: any,
  body: { source_tag_id: string; target_tag_id: string }
): Promise<{ merged_count: number }> {
  const { source_tag_id, target_tag_id } = body
  
  if (!source_tag_id || !target_tag_id) {
    throw new Error('source_tag_id and target_tag_id are required')
  }
  
  if (source_tag_id === target_tag_id) {
    throw new Error('Source and target tags cannot be the same')
  }
  
  // Get source tag info
  const { data: sourceTag } = await adminDb
    .from('items')
    .select('data')
    .eq('id', source_tag_id)
    .single()
  
  if (!sourceTag) throw new Error('Source tag not found')
  
  // Update all references to source tag to point to target tag
  const sourceTagSlug = sourceTag.data?.slug
  
  // Update ticket analysis_tags arrays
  const { data: ticketsToUpdate } = await adminDb
    .from('items')
    .select('id, data')
    .eq('status', 'active')
    .contains('data->>case_analysis->>analysis_tags', [source_tag_id])
  
  let mergedCount = 0
  
  for (const ticket of ticketsToUpdate || []) {
    const caseAnalysis = ticket.data?.case_analysis || {}
    const analysisTags = caseAnalysis.analysis_tags || []
    
    // Replace source tag with target tag
    const updatedTags = analysisTags.map((tagId: string) => 
      tagId === source_tag_id ? target_tag_id : tagId
    )
    
    await adminDb
      .from('items')
      .update({
        data: adminDb.sql`jsonb_set(data, '{case_analysis,analysis_tags}', ${updatedTags}::jsonb)`,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticket.id)
    
    mergedCount++
  }
  
  // Increment target tag usage by source tag's usage count
  const sourceUsage = sourceTag.data?.usage_count || 0
  for (let i = 0; i < sourceUsage; i++) {
    await incrementTagUsage(target_tag_id)
  }
  
  // Delete source tag
  await adminDb
    .from('items')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', source_tag_id)
  
  return { merged_count }
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────

export const handler = createHandler(async (ctx, body) => {
  const action = ctx.query?.action

  switch (action) {
    case 'create_or_get_tag':
      return await handleCreateOrGetTag(ctx, body)
    case 'list_tags':
      return await handleListTags(ctx, body)
    case 'update_tag_usage':
      return await handleUpdateTagUsage(ctx, body)
    case 'merge_tags':
      return await handleMergeTags(ctx, body)
    default:
      throw new Error(`Unknown action: ${action}. Use create_or_get_tag, list_tags, update_tag_usage, or merge_tags.`)
  }
})
