/**
 * Webhook Handler Registry
 * 
 * Static import map for all custom webhook handlers.
 * Each handler is imported at build time and registered by slug.
 *
 * To add a new handler:
 * 1. Create v2-custom/functions/custom_{name}.ts with a default export function
 * 2. Import it here and add it to the webhookHandlers map
 * 3. Set integration config handler.path = the map key
 */

import cortexHandler from './custom_cortex-handler'
import { processSignal } from './custom_funnel-signal'

export const webhookHandlers: Record<string, Function> = {
  'cortex-handler': cortexHandler,
  'funnel-signal': processSignal,
}
