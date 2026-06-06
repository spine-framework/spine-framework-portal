/**
 * @module webhook-registry
 * @audience core-contributor
 * @layer shared-service
 * @stability stable
 *
 * Dynamic webhook handler registry for runtime handler resolution.
 * Replaces static imports with database-driven handler lookups.
 *
 * **Pattern:**
 * 1. Custom handlers self-register via `integrations` table or `webhook_handlers` table
 * 2. Core looks up handler by name at runtime
 * 3. Dynamic import loads the handler function
 *
 * **Benefits:**
 * - Core has zero hardcoded dependencies on custom handlers
 * - Handlers can be added/removed without core code changes
 * - Multi-tenancy: different tenants can have different handlers
 *
 * @seeAlso integration-routes.ts (uses this registry)
 * @seeAlso custom_webhook-handlers.ts (legacy static registry - being phased out)
 */

import { adminDb } from './db'

// In-memory cache for handler metadata (not the handlers themselves)
const handlerCache = new Map<string, { functionName: string; loaded: boolean }>()

/**
 * Looks up a webhook handler in the database registry.
 * Returns the function name to dynamically import.
 *
 * @param handlerName - The handler identifier (e.g., "cortex-handler")
 * @returns Handler metadata or null if not found
 */
export async function lookupHandler(handlerName: string): Promise<{ functionName: string } | null> {
  // Check cache first
  const cached = handlerCache.get(handlerName)
  if (cached) {
    return { functionName: cached.functionName }
  }

  // Query database for handler registration
  const { data, error } = await adminDb
    .from('webhook_handlers')
    .select('name, function_name, is_active')
    .eq('name', handlerName)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    console.log(`[webhook-registry] Handler not found: ${handlerName}`)
    return null
  }

  // Cache the result
  handlerCache.set(handlerName, {
    functionName: data.function_name,
    loaded: false
  })

  return { functionName: data.function_name }
}

/**
 * Loads a webhook handler function dynamically.
 * Uses dynamic import to avoid static dependencies.
 *
 * @param functionName - The Netlify function name (e.g., "custom_cortex-handler")
 * @returns The handler function or null if not found
 */
export async function loadHandler(functionName: string): Promise<Function | null> {
  try {
    // Dynamic import of the handler function
    // Functions are in the same directory after assembly
    const module = await import(`../${functionName}`)
    
    // Handler should be exported as 'handler' or default
    const handler = module.handler || module.default
    
    if (typeof handler !== 'function') {
      console.error(`[webhook-registry] Export 'handler' not found in ${functionName}`)
      return null
    }

    return handler
  } catch (err) {
    console.error(`[webhook-registry] Failed to load ${functionName}:`, err)
    return null
  }
}

/**
 * Resolves a webhook handler by name.
 * Combines lookup + load for convenience.
 *
 * @param handlerName - The handler identifier
 * @returns The handler function or null
 */
export async function resolveHandler(handlerName: string): Promise<Function | null> {
  const metadata = await lookupHandler(handlerName)
  if (!metadata) return null

  return loadHandler(metadata.functionName)
}

/**
 * Clears the handler cache. Useful for testing or after deployments.
 */
export function clearHandlerCache(): void {
  handlerCache.clear()
}

/**
 * Lists all registered handlers (for debugging/admin).
 */
export async function listRegisteredHandlers(): Promise<string[]> {
  const { data, error } = await adminDb
    .from('webhook_handlers')
    .select('name')
    .eq('is_active', true)

  if (error) {
    console.error('[webhook-registry] Failed to list handlers:', error)
    return []
  }

  return data?.map(h => h.name) || []
}
