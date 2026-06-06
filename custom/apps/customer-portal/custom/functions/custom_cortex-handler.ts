/**
 * Cortex Webhook Handler
 * 
 * Convention: custom_*.ts files are assembled into /functions/
 * and loaded by integration-routes via: import('./custom_cortex-handler')
 *
 * Receives: (sanitizedData, context, event)
 * Returns: plain text or object
 */
export default async function cortexHandler(
  data: Record<string, any>,
  ctx: {
    integrationId: string
    accountId: string
    slug: string
    principal: { id: string; type: string; accountId: string }
    requestId: string
    headers: Record<string, string>
  },
  event: {
    httpMethod: string
    headers: Record<string, string>
    body: any
    path: string
    queryStringParameters: Record<string, string>
  }
): Promise<string> {
  console.log(`[${ctx.requestId}] Cortex handler received:`, {
    testText: data['test-text'],
    integrationId: ctx.integrationId,
    accountId: ctx.accountId
  })

  return data['test-text']
}
