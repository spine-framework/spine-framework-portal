/**
 * @module system-cron
 * @audience core-contributor
 * @layer api-handler
 * @stability stable
 *
 * Scheduled job runner invoked by an external cron service (e.g., AWS
 * EventBridge, Google Cloud Scheduler). On each tick it:
 *
 * 1. Authenticates the request via `SCHEDULER_API_KEY` or machine principal
 * 2. Fetches all schedules due via `get_due_schedules` RPC
 * 3. For each schedule: validates creator, loads action + machine principal,
 *    checks scope, executes action, records outcome
 * 4. Fetches all timers due via `get_due_timers` RPC and runs each pipeline
 * 5. Evaluates threshold alerts via `evaluateThresholds`
 * 6. Runs daily log cleanup at 00:00 UTC via `cleanupOldLogs`
 *
 * **Routed by:** `POST /.netlify/functions/system-cron`
 *
 * **Authentication:** Request must supply `SCHEDULER_API_KEY` via `?api_key`
 * or `?scheduler_key`, OR originate from an internal machine principal
 * (type='machine', machineType='internal'). Unauthorized requests receive 403.
 *
 * **Response shape:**
 * ```ts
 * {
 *   executed: number
 *   success: number
 *   failed: number
 *   skipped: number
 *   thresholds_evaluated: number
 *   thresholds_breached: number
 *   logs_cleaned: number
 *   results: Array<{ scheduleId, actionId, status, error?, durationMs }>
 * }
 * ```
 *
 * INVARIANT: Uses `adminDb` (service-role client, bypasses RLS) because
 *   machine principals must access cross-account data.
 * INVARIANT: Log cleanup only runs when the current UTC time is 00:00.
 *
 * @seeAlso timers.ts (timer configuration CRUD)
 * @seeAlso pipelines.ts (pipeline configuration CRUD)
 * @seeAlso pipeline-runner.ts (runPipeline — timer/schedule execution)
 * @seeAlso observability.ts (analytics RPCs used by evaluateThresholds)
 * @seeAlso audit.ts (emitAudit for cron lifecycle events)
 */

import { createHandler, RequestContext } from './_shared/middleware'
import { adminDb } from './_shared/db'
import { emitAudit } from './_shared/audit'
import { runPipeline } from './_shared/pipeline-runner'

const SCHEDULER_API_KEY: string | undefined = (globalThis as any).process?.env?.SCHEDULER_API_KEY || (globalThis as any).Deno?.env?.get?.('SCHEDULER_API_KEY')

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

/**
 * Netlify function entry point — the entire cron tick logic lives here.
 * Returns HTTP 200 with a results summary on success, or HTTP 403/500
 * on auth/runtime failure.
 *
 * @throws Returns 403 JSON if scheduler key is missing or invalid
 * @throws Returns 500 JSON on unhandled top-level error
 * @sideEffects DB read: get_due_schedules, validate_schedule_creator,
 *   actions, api_keys, get_due_timers
 * @sideEffects DB write: schedule_executions (INSERT), update_schedule_after_run
 *   RPC, update_timer_after_run RPC, cleanup_old_logs RPC
 * @sideEffects pipeline: runPipeline (timers + threshold responses)
 * @sideEffects audit: emitAudit for unauthorized, error, schedule.execute,
 *   threshold.breached events
 * @calledBy External cron scheduler (AWS EventBridge / Google Cloud Scheduler)
 */
export const handler = createHandler(async (ctx: RequestContext) => {
  // ============================================
  // SECURITY: Validate this is an internal request
  // ============================================
  
  // Check if request has scheduler authentication
  const requestApiKey = ctx.query?.api_key || ctx.query?.scheduler_key
  
  if (requestApiKey !== SCHEDULER_API_KEY) {
    // Also allow if the principal is a system machine (for internal invocations)
    if (ctx.principal?.type !== 'machine' || ctx.principal?.machineType !== 'internal') {
      await emitAudit(ctx, 'system_cron.unauthorized_access', {
        type: 'system',
        account_id: ctx.accountId || undefined
      }, { result: 'denied', error: 'Invalid or missing scheduler authentication' })
      
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Forbidden - Invalid scheduler authentication' })
      }
    }
  }
  
  // ============================================
  // Find and execute due schedules
  // ============================================
  
  const results: Array<{
    scheduleId: string
    actionId: string
    status: 'success' | 'failed' | 'skipped'
    error?: string
    durationMs: number
  }> = []
  
  try {
    // Get all schedules due for execution
    const { data: dueSchedules, error: schedulesError } = await adminDb.rpc('get_due_schedules', {
      p_now: new Date().toISOString()
    })
    
    if (schedulesError) {
      throw new Error(`Failed to fetch due schedules: ${schedulesError.message}`)
    }
    
    if (!dueSchedules || dueSchedules.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No schedules due for execution',
          executed: 0,
          results: []
        })
      }
    }
    
    // Execute each due schedule
    for (const schedule of dueSchedules) {
      const startTime = Date.now()
      
      try {
        // Validate schedule can run (creator still active)
        const { data: validation, error: validationError } = await adminDb.rpc('validate_schedule_creator', {
          p_schedule_id: schedule.schedule_id
        })
        
        if (validationError || !validation?.is_valid) {
          // Schedule was auto-paused by validation function
          results.push({
            scheduleId: schedule.schedule_id,
            actionId: schedule.action_id,
            status: 'skipped',
            error: validation?.error_message || 'Schedule validation failed',
            durationMs: Date.now() - startTime
          })
          continue
        }
        
        // Load the action
        const { data: action, error: actionError } = await adminDb
          .from('actions')
          .select('*')
          .eq('id', schedule.action_id)
          .single()
        
        if (actionError || !action) {
          throw new Error(`Action not found: ${schedule.action_id}`)
        }
        
        // Load the machine principal
        const { data: machine, error: machineError } = await adminDb
          .from('api_keys')
          .select('*')
          .eq('id', schedule.machine_principal_id)
          .single()
        
        if (machineError || !machine) {
          throw new Error(`Machine principal not found: ${schedule.machine_principal_id}`)
        }
        
        // Create execution context with machine principal
        const executionCtx: RequestContext = {
          requestId: ctx.requestId,
          principal: {
            id: machine.id,
            type: 'machine',
            accountId: machine.account_id,
            scopes: schedule.delegated_scopes || machine.scopes || [],
            machineType: machine.machine_type,
            isInternal: machine.is_internal,
            provenance: {
              sourceType: 'cron',
              createdBy: machine.created_by,
              invokedAt: new Date().toISOString(),
              cronId: schedule.schedule_id
            }
          },
          db: adminDb,  // Machines use adminDb (RLS checks their ID)
          accountId: machine.account_id,
          appId: null,
          requestPath: '/.netlify/functions/system-cron',
          query: {}
        }
        
        // Check machine has required scope for this action
        const requiredScope = action.required_scopes?.[0] || `${action.handler}:execute`
        const hasScope = executionCtx.principal.scopes?.includes(requiredScope) ||
                        executionCtx.principal.scopes?.includes('*:*')
        
        if (!hasScope) {
          throw new Error(`Machine lacks required scope: ${requiredScope}`)
        }
        
        // Execute the action
        const executionResult = await executeAction(executionCtx, action, schedule.config)
        
        // Record execution success
        await adminDb.from('schedule_executions').insert({
          schedule_id: schedule.schedule_id,
          account_id: schedule.account_id,
          machine_principal_id: machine.id,
          status: 'success',
          input_params: schedule.config,
          output_result: executionResult,
          duration_ms: Date.now() - startTime
        })
        
        // Update schedule state
        await adminDb.rpc('update_schedule_after_run', {
          p_schedule_id: schedule.schedule_id,
          p_success: true,
          p_error_message: null
        })
        
        // Emit audit log
        await emitAudit(executionCtx, 'schedule.execute', {
          type: 'schedule',
          id: schedule.schedule_id,
          account_id: schedule.account_id
        }, {
          action_id: action.id,
          action_handler: action.handler,
          result: 'success'
        })
        
        results.push({
          scheduleId: schedule.schedule_id,
          actionId: schedule.action_id,
          status: 'success',
          durationMs: Date.now() - startTime
        })
        
      } catch (execError: any) {
        const errorMessage = execError.message || 'Execution failed'
        
        // Record execution failure
        await adminDb.from('schedule_executions').insert({
          schedule_id: schedule.schedule_id,
          account_id: schedule.account_id,
          machine_principal_id: schedule.machine_principal_id,
          status: 'failed',
          input_params: schedule.config,
          error_message: errorMessage,
          duration_ms: Date.now() - startTime
        })
        
        // Update schedule state
        await adminDb.rpc('update_schedule_after_run', {
          p_schedule_id: schedule.schedule_id,
          p_success: false,
          p_error_message: errorMessage
        })
        
        results.push({
          scheduleId: schedule.schedule_id,
          actionId: schedule.action_id,
          status: 'failed',
          error: errorMessage,
          durationMs: Date.now() - startTime
        })
      }
    }
    
    // ============================================
    // Execute due timers (pipeline-based timers)
    // ============================================
    
    try {
      const { data: dueTimers, error: timersError } = await adminDb.rpc('get_due_timers', {
        p_now: new Date().toISOString()
      })
      
      if (!timersError && dueTimers && dueTimers.length > 0) {
        for (const timer of dueTimers) {
          const timerStartTime = Date.now()
          
          try {
            // Validate timer can run
            if (!timer.pipeline_id) {
              throw new Error(`Timer ${timer.timer_id} has no pipeline_id`)
            }
            
            // Create execution context for timer
            const timerCtx: RequestContext = {
              requestId: ctx.requestId,
              principal: {
                id: 'timer:' + timer.timer_id,
                type: 'machine' as const,
                accountId: timer.account_id,
                scopes: ['pipelines:execute'],
                machineType: 'timer',
                isInternal: true,
                provenance: {
                  sourceType: 'timer',
                  createdBy: timer.created_by,
                  invokedAt: new Date().toISOString(),
                  timerId: timer.timer_id
                }
              },
              db: adminDb,
              accountId: timer.account_id,
              appId: timer.app_id || null,
              requestPath: '/.netlify/functions/system-cron',
              query: {}
            }
            
            // Run the pipeline
            const result = await runPipeline(timer.pipeline_id, {
              timer_id: timer.timer_id,
              timer_name: timer.name,
              execution_count: timer.execution_count || 0
            }, timerCtx)
            
            // Update timer state
            await adminDb.rpc('update_timer_after_run', {
              p_timer_id: timer.timer_id,
              p_success: result.status === 'completed',
              p_error_message: result.error || null
            })
            
            results.push({
              scheduleId: timer.timer_id,
              actionId: timer.pipeline_id,
              status: result.status === 'completed' ? 'success' : 'failed',
              error: result.error,
              durationMs: Date.now() - timerStartTime
            })
            
          } catch (timerError: any) {
            // Update timer with failure
            await adminDb.rpc('update_timer_after_run', {
              p_timer_id: timer.timer_id,
              p_success: false,
              p_error_message: timerError.message
            })
            
            results.push({
              scheduleId: timer.timer_id,
              actionId: timer.pipeline_id,
              status: 'failed',
              error: timerError.message,
              durationMs: Date.now() - timerStartTime
            })
          }
        }
      }
    } catch (timerLoopError) {
      console.error('Timer execution error:', timerLoopError)
    }
    
    // ============================================
    // Evaluate threshold alerts (every minute)
    // ============================================
    let thresholdResults: any[] = []
    try {
      thresholdResults = await evaluateThresholds(ctx)
      const breachedCount = thresholdResults.filter(r => r.breached).length
      const firedCount = thresholdResults.filter(r => r.fired).length
      
      if (breachedCount > 0) {
        console.log(`Thresholds: ${breachedCount} breached, ${firedCount} pipelines fired`)
      }
    } catch (thresholdError) {
      console.error('Threshold evaluation error:', thresholdError)
    }
    
    // ============================================
    // Daily log cleanup (check if it's time)
    // ============================================
    let logsCleaned = 0
    const now = new Date()
    const currentHour = now.getUTCHours()
    const currentMinute = now.getUTCMinutes()
    
    // Run cleanup once per day at 00:00 UTC
    if (currentHour === 0 && currentMinute === 0) {
      try {
        logsCleaned = await cleanupOldLogs()
      } catch (cleanupError) {
        console.error('Log cleanup error:', cleanupError)
      }
    }
    
    // Return summary
    const successCount = results.filter(r => r.status === 'success').length
    const failedCount = results.filter(r => r.status === 'failed').length
    const skippedCount = results.filter(r => r.status === 'skipped').length
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Executed ${results.length} total (schedules + timers)`,
        executed: results.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount,
        thresholds_evaluated: thresholdResults.length,
        thresholds_breached: thresholdResults.filter(r => r.breached).length,
        logs_cleaned: logsCleaned,
        results
      })
    }
    
  } catch (error: any) {
    console.error('System cron error:', error)
    
    await emitAudit(ctx, 'system_cron.error', {
      type: 'system',
      account_id: ctx.accountId || undefined
    }, {
      result: 'failure',
      error: error.message
    })
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'System cron execution failed',
        message: error.message
      })
    }
  }
})

// ─── PRIVATE HELPERS ───────────────────────────────────────────────────────────

/**
 * Dispatches to the appropriate handler module (`functions` | `integrations`
 * | `custom`) based on `action.handler_module`. Merges action-level config
 * with schedule-specific config before invoking.
 *
 * @throws Error('Unknown handler module: <module>') on unrecognized module
 * @throws Error('Custom handlers not yet implemented: <name>')
 */
async function executeAction(
  ctx: RequestContext,
  action: any,
  config: any
): Promise<any> {
  const handlerModule = action.handler_module || 'functions'
  const handlerName = action.handler
  
  // Merge action config with schedule-specific config
  const mergedConfig = {
    ...action.config,
    ...config
  }
  
  switch (handlerModule) {
    case 'functions':
      return await executeFunctionHandler(ctx, handlerName, mergedConfig)
    
    case 'integrations':
      return await executeIntegrationHandler(ctx, handlerName, mergedConfig)
    
    case 'custom':
      // Custom handlers would be loaded from v2-custom
      throw new Error(`Custom handlers not yet implemented: ${handlerName}`)
    
    default:
      throw new Error(`Unknown handler module: ${handlerModule}`)
  }
}

/**
 * Routes to one of the built-in named handlers: `send_email`,
 * `generate_report`, `notify_watchers`, `run_pipeline`.
 * `run_pipeline` delegates to `runPipeline` from `_shared/pipeline-runner.ts`.
 *
 * @throws Error('Unknown function handler: <name>') on unrecognized name
 * @throws Error('pipeline_id is required for run_pipeline handler')
 */
async function executeFunctionHandler(
  ctx: RequestContext,
  handlerName: string,
  config: any
): Promise<any> {
  // Built-in handlers
  const handlers: Record<string, Function> = {
    'send_email': async (ctx: RequestContext, config: any) => {
      // Implementation would integrate with email service
      console.log(`[${ctx.requestId}] Sending email:`, config)
      return { sent: true, recipients: config.recipients }
    },
    
    'generate_report': async (ctx: RequestContext, config: any) => {
      // Implementation would generate and deliver report
      console.log(`[${ctx.requestId}] Generating report:`, config)
      return { generated: true, format: config.output_format }
    },
    
    'notify_watchers': async (ctx: RequestContext, config: any) => {
      // Implementation would notify item watchers
      console.log(`[${ctx.requestId}] Notifying watchers:`, config)
      return { notified: true }
    },
    
    'run_pipeline': async (ctx: RequestContext, config: any) => {
      // Execute a pipeline as part of scheduled action
      const { pipeline_id, trigger_data = {} } = config
      
      if (!pipeline_id) {
        throw new Error('pipeline_id is required for run_pipeline handler')
      }
      
      const result = await runPipeline(pipeline_id, trigger_data, ctx)
      return { 
        success: result.status === 'completed',
        execution_id: result.executionId,
        stages_completed: result.stages?.length || 0,
        duration_ms: result.durationMs
      }
    }
  }
  
  const handler = handlers[handlerName]
  if (!handler) {
    throw new Error(`Unknown function handler: ${handlerName}`)
  }
  
  return await handler(ctx, config)
}

/**
 * Placeholder for integration-based action handlers (external service calls).
 * Currently logs and returns `{ executed: true }` for all handler names.
 */
async function executeIntegrationHandler(
  ctx: RequestContext,
  handlerName: string,
  config: any
): Promise<any> {
  // Integration handlers would call external services
  // This is a placeholder for future implementation
  console.log(`[${ctx.requestId}] Integration handler: ${handlerName}`, config)
  return { executed: true, handler: handlerName }
}

/**
 * Evaluates all active `threshold_alert` items across all accounts.
 * For each threshold, queries the appropriate observability RPC
 * (`get_error_rate`, `get_latency_percentiles`, or `get_pipeline_stats`)
 * and fires the configured pipeline if the threshold is breached.
 *
 * Supported metrics: `error_rate`, `latency_p95`, `pipeline_failure_rate`
 *
 * @returns Array of `{ thresholdId, breached, fired }` results
 * @sideEffects DB read: items (threshold_alert), observability RPCs
 * @sideEffects pipeline: runPipeline when threshold breached and pipeline_id set
 * @sideEffects audit: emitAudit('threshold.breached') for each breached threshold
 * @calledBy handler (every tick)
 */
async function evaluateThresholds(ctx: RequestContext): Promise<Array<{ thresholdId: string; breached: boolean; fired: boolean }>> {
  const results: Array<{ thresholdId: string; breached: boolean; fired: boolean }> = []
  
  try {
    // Load all active threshold alerts from items table
    const { data: thresholds, error } = await adminDb
      .from('items')
      .select('*')
      .eq('type', 'threshold_alert')
      .eq('data->>is_active', 'true')
    
    if (error) {
      console.error('Failed to load thresholds:', error)
      return results
    }
    
    if (!thresholds || thresholds.length === 0) {
      return results
    }
    
    // Evaluate each threshold
    for (const threshold of thresholds) {
      try {
        const config = threshold.data || {}
        const { metric, operator, value, window_minutes, pipeline_id } = config
        
        if (!metric || !operator || value === undefined || !window_minutes) {
          console.warn(`Threshold ${threshold.id} missing required fields`)
          continue
        }
        
        // Calculate time window
        const now = new Date()
        const from = new Date(now.getTime() - window_minutes * 60 * 1000)
        
        let breached = false
        let actualValue: number = 0
        
        // Query appropriate RPC based on metric
        switch (metric) {
          case 'error_rate': {
            const { data } = await adminDb.rpc('get_error_rate', {
              p_account_id: threshold.account_id,
              p_from: from.toISOString(),
              p_to: now.toISOString()
            })
            if (data && data.length > 0) {
              actualValue = data[0].rate
              breached = operator === 'gt' ? actualValue > value : actualValue < value
            }
            break
          }
          
          case 'latency_p95': {
            const { data } = await adminDb.rpc('get_latency_percentiles', {
              p_account_id: threshold.account_id,
              p_from: from.toISOString(),
              p_to: now.toISOString()
            })
            if (data && data.length > 0) {
              actualValue = data[0].p95
              breached = operator === 'gt' ? actualValue > value : actualValue < value
            }
            break
          }
          
          case 'pipeline_failure_rate': {
            const { data } = await adminDb.rpc('get_pipeline_stats', {
              p_account_id: threshold.account_id,
              p_from: from.toISOString(),
              p_to: now.toISOString()
            })
            if (data && data.length > 0) {
              // Calculate overall failure rate across all pipelines
              const totalSuccess = data.reduce((sum: number, p: any) => sum + (parseInt(p.success_count) || 0), 0)
              const totalFailure = data.reduce((sum: number, p: any) => sum + (parseInt(p.failure_count) || 0), 0)
              const total = totalSuccess + totalFailure
              actualValue = total > 0 ? (totalFailure / total) * 100 : 0
              breached = operator === 'gt' ? actualValue > value : actualValue < value
            }
            break
          }
          
          default:
            console.warn(`Unknown metric: ${metric}`)
            continue
        }
        
        // Fire pipeline if breached and pipeline_id configured
        let fired = false
        if (breached && pipeline_id) {
          try {
            await runPipeline(pipeline_id, {
              threshold_id: threshold.id,
              metric,
              threshold_value: value,
              actual_value: actualValue,
              window_minutes,
              triggered_at: now.toISOString()
            }, ctx)
            fired = true
          } catch (pipelineError: any) {
            console.error(`Failed to fire threshold pipeline ${pipeline_id}:`, pipelineError)
          }
        }
        
        // Log threshold event if breached
        if (breached) {
          await emitAudit(ctx, 'threshold.breached', {
            type: 'threshold_alert',
            id: threshold.id,
            account_id: threshold.account_id
          }, {
            metric,
            operator,
            threshold_value: value,
            actual_value: actualValue,
            window_minutes,
            pipeline_fired: fired,
            pipeline_id
          })
        }
        
        results.push({
          thresholdId: threshold.id,
          breached,
          fired
        })
        
      } catch (thresholdError: any) {
        console.error(`Error evaluating threshold ${threshold.id}:`, thresholdError)
        results.push({
          thresholdId: threshold.id,
          breached: false,
          fired: false
        })
      }
    }
    
    return results
    
  } catch (error: any) {
    console.error('Threshold evaluation error:', error)
    return results
  }
}

/**
 * Runs the `cleanup_old_logs` RPC with 90-day retention. Called once daily
 * by the handler at 00:00 UTC.
 *
 * @returns Number of log records deleted
 * @sideEffects DB write: cleanup_old_logs RPC (cross-account DELETE)
 * @calledBy handler (daily, 00:00 UTC)
 */
async function cleanupOldLogs(): Promise<number> {
  try {
    const { data, error } = await adminDb.rpc('cleanup_old_logs', {
      p_retention_days: 90
    })
    
    if (error) {
      console.error('Log cleanup failed:', error)
      return 0
    }
    
    const deletedCount = data?.[0]?.deleted_count || 0
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} old log records`)
    }
    
    return deletedCount
  } catch (error: any) {
    console.error('Log cleanup error:', error)
    return 0
  }
}
