/**
 * @module testing
 * @audience custom-developer
 * @layer shared-util
 * @stability evolving
 *
 * Testing utilities for custom code developers.
 * Use these to test your custom functions without full deployment.
 *
 * **Usage in custom function tests:**
 * ```ts
 * import { makeTestContext, mockPrincipal, cleanup } from '@core/testing'
 *
 * describe('My Custom Handler', () => {
 *   it('should process items', async () => {
 *     const ctx = makeTestContext({
 *       principal: mockPrincipal({ roles: ['member'] }),
 *       accountId: 'test-account'
 *     })
 *
 *     const result = await myHandler(mockEvent, ctx)
 *     expect(result.status).toBe('success')
 *
 *     cleanup()
 *   })
 * })
 * ```
 *
 * @seeAlso .framework/tests/unit/core-isolation.test.ts (examples)
 */

import { adminDb } from './db'

export interface TestContext {
  db: typeof adminDb
  principal: TestPrincipal
  logger: TestLogger
  accountId: string
}

export interface TestPrincipal {
  id: string
  account_id: string
  roles: string[]
  permissions: Record<string, any>
  email?: string
}

export interface TestLogger {
  info: (msg: string, meta?: any) => void
  warn: (msg: string, meta?: any) => void
  error: (msg: string, meta?: any) => void
  debug: (msg: string, meta?: any) => void
}

/**
 * Creates a mock principal for testing.
 *
 * @param overrides - Override default principal properties
 * @returns Mock principal object
 *
 * @example
 * ```ts
 * const admin = mockPrincipal({
 *   roles: ['system_admin'],
 *   permissions: { all: true }
 * })
 * ```
 */
export function mockPrincipal(overrides: Partial<TestPrincipal> = {}): TestPrincipal {
  return {
    id: 'test-user-id',
    account_id: 'test-account-id',
    roles: ['member'],
    permissions: {},
    email: 'test@example.com',
    ...overrides
  }
}

/**
 * Creates a mock logger that captures logs for assertions.
 *
 * @returns TestLogger with log capture
 *
 * @example
 * ```ts
 * const logger = mockLogger()
 * await myFunction(logger)
 * expect(logger.getLogs()).toContain('Processing started')
 * ```
 */
export function mockLogger(): TestLogger & { getLogs: () => string[] } {
  const logs: string[] = []

  return {
    info: (msg: string, meta?: any) => {
      logs.push(`INFO: ${msg}`)
      if (meta) console.log('INFO:', msg, meta)
    },
    warn: (msg: string, meta?: any) => {
      logs.push(`WARN: ${msg}`)
      if (meta) console.warn('WARN:', msg, meta)
    },
    error: (msg: string, meta?: any) => {
      logs.push(`ERROR: ${msg}`)
      if (meta) console.error('ERROR:', msg, meta)
    },
    debug: (msg: string, meta?: any) => {
      logs.push(`DEBUG: ${msg}`)
      if (meta) console.debug('DEBUG:', msg, meta)
    },
    getLogs: () => [...logs]
  }
}

/**
 * Creates a test context for handler testing.
 *
 * @param options - Test context configuration
 * @returns TestContext ready for handler
 *
 * @example
 * ```ts
 * const ctx = makeTestContext({
 *   principal: mockPrincipal({ roles: ['operator'] }),
 *   accountId: 'my-account'
 * })
 *
 * const result = await handler(mockEvent, ctx)
 * ```
 */
export function makeTestContext(options: {
  principal?: TestPrincipal
  accountId?: string
  logger?: TestLogger
} = {}): TestContext {
  return {
    db: adminDb,
    principal: options.principal || mockPrincipal(),
    logger: options.logger || mockLogger(),
    accountId: options.accountId || options.principal?.account_id || 'test-account'
  }
}

/**
 * Creates a mock API Gateway event.
 *
 * @param overrides - Override default event properties
 * @returns Mock event object
 *
 * @example
 * ```ts
 * const event = mockEvent({
 *   httpMethod: 'POST',
 *   body: JSON.stringify({ item_id: '123' })
 * })
 * ```
 */
export function mockEvent(overrides: any = {}): any {
  return {
    httpMethod: 'GET',
    path: '/api/test',
    headers: {},
    queryStringParameters: {},
    body: null,
    ...overrides
  }
}

/**
 * Creates a mock Netlify function context.
 *
 * @returns Mock context object
 */
export function mockNetlifyContext(): any {
  return {
    awsRequestId: 'test-request-id',
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'test-function',
    memoryLimitInMB: '1024',
    invokedFunctionArn: 'arn:aws:lambda:test',
    getRemainingTimeInMillis: () => 30000
  }
}

/**
 * Cleanup function for tests.
 * Clears caches and resets state.
 */
export function cleanup(): void {
  // Clear any caches or state that might persist between tests
  // This is a placeholder - actual implementation would clear specific state
  console.log('Test cleanup completed')
}

/**
 * Setup helper for test files.
 * Returns utilities commonly needed in tests.
 *
 * @example
 * ```ts
 * import { setupTests } from '@core/testing'
 *
 * const { makeTestContext, mockPrincipal, cleanup } = setupTests()
 *
 * describe('My Tests', () => {
 *   afterEach(cleanup)
 *   // ... tests
 * })
 * ```
 */
export function setupTests() {
  return {
    makeTestContext,
    mockPrincipal,
    mockLogger,
    mockEvent,
    mockNetlifyContext,
    cleanup
  }
}

/**
 * Asserts that a handler response matches expected structure.
 *
 * @param response - Handler response
 * @param expectedStatus - Expected status code
 */
export function expectSuccessResponse(
  response: { statusCode?: number; body?: string },
  expectedStatus: number = 200
): void {
  expect(response.statusCode).toBe(expectedStatus)
  
  if (response.body) {
    const body = JSON.parse(response.body)
    expect(body.error).toBeUndefined()
  }
}

/**
 * Asserts that a handler returned an error.
 *
 * @param response - Handler response
 * @param expectedStatus - Expected error status code
 */
export function expectErrorResponse(
  response: { statusCode?: number; body?: string },
  expectedStatus: number = 400
): void {
  expect(response.statusCode).toBe(expectedStatus)
  
  if (response.body) {
    const body = JSON.parse(response.body)
    expect(body.error || body.message).toBeDefined()
  }
}
