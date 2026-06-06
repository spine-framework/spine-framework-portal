import { createHandler } from './_shared/middleware'
import { processSignal } from './custom_funnel-signal'

export const handler = createHandler(async (ctx, body) => {
  const { action_type, action_value, action_description, session_id } = body || {}

  if (!action_type || typeof action_value !== 'number') {
    const err: any = new Error('action_type and action_value are required')
    err.statusCode = 400
    throw err
  }

  if (!ctx.accountId) {
    const err: any = new Error('No account context')
    err.statusCode = 401
    throw err
  }

  const payload = {
    account_id: ctx.accountId,
    person_id: ctx.principal.id,
    session_id: session_id || `portal_${ctx.principal.id}_${Date.now()}`,
    stage: 'identified',
    source: 'int',
    action_type,
    action_value,
    ...(action_description && { action_description }),
  }

  await processSignal(payload, { accountId: ctx.accountId, requestId: ctx.requestId }, {})

  return { status: 'ok' }
})
