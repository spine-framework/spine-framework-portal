/**
 * @module webhook-registration
 * @audience custom-developer
 * @layer shared-util
 * @stability stable
 *
 * Helper utilities for custom webhook handlers to self-register.
 * Use this in your custom Netlify functions to register as webhook handlers.
 *
 * **Usage in a custom function:**
 * ```ts
 * import { createHandler } from '../_shared/middleware'
 * import { registerWebhookHandler } from '../_shared/webhook-registration'
 * import { adminDb } from '../_shared/db'
 *
 * export const handler = createHandler(async (event, ctx) => {
 *   // Your webhook logic here
 * })
 *
 * // Self-register on first load (idempotent)
 * registerWebhookHandler({
 *   name: 'my-custom-handler',
 *   functionName: 'custom_my-webhook',
 *   description: 'Handles my custom integration events',
 *   events: ['user.created', 'item.updated'],
 *   db: adminDb
 * }).catch(console.error)
 * ```
 *
 * @seeAlso webhook-registry.ts (core lookup service)
 * @seeAlso 014_webhook_registry.sql (database table)
 */

import { adminDb } from './db'

export interface WebhookHandlerRegistration {
  /** Unique handler identifier (e.g., 'cortex-handler') */
  name: string
  
  /** Netlify function name (e.g., 'custom_cortex-handler') */
  functionName: string
  
  /** Human-readable description */
  description?: string
  
  /** Events this handler subscribes to */
  events?: string[]
  
  /** Account ID (null for system handlers) */
  accountId?: string | null
  
  /** Database client (defaults to adminDb) */
  db?: typeof adminDb
}

/**
 * Registers a webhook handler in the database registry.
 * Idempotent - safe to call multiple times.
 *
 * @param config - Handler registration configuration
 * @returns Promise that resolves when registration completes
 *
 * @example
 * ```ts
 * await registerWebhookHandler({
 *   name: 'slack-webhook',
 *   functionName: 'custom_slack-integration',
 *   description: 'Posts notifications to Slack',
 *   events: ['item.created', 'item.updated']
 * })
 * ```
 */
export async function registerWebhookHandler(
  config: WebhookHandlerRegistration
): Promise<void> {
  const db = config.db || adminDb
  
  try {
    const { error } = await db
      .from('webhook_handlers')
      .upsert({
        name: config.name,
        function_name: config.functionName,
        description: config.description || `${config.name} webhook handler`,
        events: config.events || [],
        account_id: config.accountId || null,
        is_active: true,
        is_deleted: false,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'name'
      })

    if (error) {
      console.error(`[webhook-registration] Failed to register ${config.name}:`, error)
      throw error
    }

    console.log(`[webhook-registration] Registered handler: ${config.name}`)
  } catch (err) {
    console.error(`[webhook-registration] Error registering ${config.name}:`, err)
    throw err
  }
}

/**
 * Deregisters a webhook handler (soft delete).
 *
 * @param name - Handler identifier to deregister
 * @param db - Optional database client
 */
export async function deregisterWebhookHandler(
  name: string,
  db: typeof adminDb = adminDb
): Promise<void> {
  try {
    const { error } = await db
      .from('webhook_handlers')
      .update({
        is_active: false,
        is_deleted: true,
        deleted_at: new Date().toISOString()
      })
      .eq('name', name)

    if (error) {
      console.error(`[webhook-registration] Failed to deregister ${name}:`, error)
      throw error
    }

    console.log(`[webhook-registration] Deregistered handler: ${name}`)
  } catch (err) {
    console.error(`[webhook-registration] Error deregistering ${name}:`, err)
    throw err
  }
}

/**
 * Checks if a handler is registered.
 *
 * @param name - Handler identifier to check
 * @param db - Optional database client
 * @returns True if handler exists and is active
 */
export async function isHandlerRegistered(
  name: string,
  db: typeof adminDb = adminDb
): Promise<boolean> {
  try {
    const { data, error } = await db
      .from('webhook_handlers')
      .select('name')
      .eq('name', name)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .maybeSingle()

    if (error) {
      console.error(`[webhook-registration] Error checking ${name}:`, error)
      return false
    }

    return !!data
  } catch (err) {
    console.error(`[webhook-registration] Exception checking ${name}:`, err)
    return false
  }
}
