/**
 * Cortex Webhook Handler
 * 
 * Returns "Serenity" for valid requests
 * Receives sanitized data and full context from integration-routes
 */

export default async function handler(
  data: any,
  ctx: {
    integrationId: string
    accountId: string
    slug: string
    principal: any
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
  // Log the received data for debugging
  console.log(`[${ctx.requestId}] Cortex handler received:`, {
    testText: data['test-text'],
    integrationId: ctx.integrationId,
    accountId: ctx.accountId
  })

  // Return Serenity as plain text
  return 'Serenity'
}
