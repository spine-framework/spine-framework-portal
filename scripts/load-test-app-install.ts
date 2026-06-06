#!/usr/bin/env tsx

/**
 * Load Testing for App Installation System
 * Tests performance with large installations and concurrent operations
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { program } from 'commander'
import yaml from 'js-yaml'
import { performance } from 'perf_hooks'

// Fix __dirname for ES modules
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface LoadTestConfig {
  concurrentInstalls: number
  totalApps: number
  appComplexity: 'simple' | 'medium' | 'complex'
  testDuration: number // seconds
  reportInterval: number // seconds
}

interface TestResult {
  appId: string
  startTime: number
  endTime: number
  duration: number
  success: boolean
  error?: string
  steps: {
    validation: number
    packInstallation: number
    appCreation: number
    migrations: number
    verification: number
  }
}

interface LoadTestReport {
  config: LoadTestConfig
  results: TestResult[]
  summary: {
    totalTests: number
    successfulTests: number
    failedTests: number
    averageDuration: number
    minDuration: number
    maxDuration: number
    throughput: number // tests per second
    errors: Array<{ error: string; count: number }>
  }
  performance: {
    validation: { avg: number; min: number; max: number }
    packInstallation: { avg: number; min: number; max: number }
    appCreation: { avg: number; min: number; max: number }
    migrations: { avg: number; min: number; max: number }
    verification: { avg: number; min: number; max: number }
  }
}

class LoadTestRunner {
  private config: LoadTestConfig
  private results: TestResult[] = []
  private running = false
  private startTime = 0

  constructor(config: LoadTestConfig) {
    this.config = config
  }

  /**
   * Generate test app installation YAML
   */
  private generateTestApp(index: number): string {
    const complexity = this.config.appComplexity
    const baseApp = {
      app: {
        name: `Load Test App ${index}`,
        slug: `load-test-app-${index}`,
        version: "1.0.0",
        external_app_id: `load-test-${index}`,
        description: `Load testing app ${index}`,
        author: "Load Test Runner"
      },
      installation: {
        pack_installation: {
          account_id: "${TARGET_ACCOUNT_ID}",
          external_app_id: `load-test-${index}`,
          external_app_version: "1.0.0",
          install_mode: "full",
          manifest_version: 1
        },
        app_creation: [
          {
            slug: `load-test-app-${index}`,
            name: `Load Test App ${index}`,
            installed_pack_id: "${PACK_INSTALLATION_ID}",
            min_role: "member",
            nav_items: [
              {
                key: "dashboard",
                to: `/load-test-${index}`,
                label: "Dashboard",
                icon: "layout-dashboard",
                min_role: "member"
              }
            ]
          }
        ],
        migrations: [],
        verification: [
          { check: "app_definition_exists", slug: `load-test-app-${index}` }
        ]
      }
    }

    // Add complexity-based migrations
    if (complexity === 'medium') {
      baseApp.installation.migrations = [
        {
          file: `migrations/001_app_${index}_setup.sql`,
          description: `Create app ${index} item types and views`,
          rollback_file: `migrations/rollback_001_app_${index}_setup.sql`
        },
        {
          file: `migrations/002_app_${index}_data.sql`,
          description: `Seed app ${index} categories and templates`,
          dependencies: [`001_app_${index}_setup`]
        }
      ]
      baseApp.installation.verification.push(
        { check: "item_type_exists", slug: `app_${index}_item` },
        { check: "view_exists", slug: `app_${index}_dashboard` }
      )
    } else if (complexity === 'complex') {
      baseApp.installation.migrations = [
        {
          file: `migrations/001_app_${index}_setup.sql`,
          description: `Create app ${index} item types and views`,
          rollback_file: `migrations/rollback_001_app_${index}_setup.sql`
        },
        {
          file: `migrations/002_app_${index}_tables.sql`,
          description: `Create app ${index} custom tables`,
          dependencies: [`001_app_${index}_setup`]
        },
        {
          file: `migrations/003_app_${index}_data.sql`,
          description: `Seed app ${index} categories and templates`,
          dependencies: [`001_app_${index}_setup`, `002_app_${index}_tables`]
        },
        {
          file: `migrations/004_app_${index}_automations.sql`,
          description: `Create app ${index} automation rules`,
          dependencies: [`002_app_${index}_tables`, `003_app_${index}_data`]
        }
      ]
      baseApp.installation.verification.push(
        { check: "item_type_exists", slug: `app_${index}_item` },
        { check: "view_exists", slug: `app_${index}_dashboard` },
        { check: "view_exists", slug: `app_${index}_list` },
        { check: "integration_exists", integration_id: `app_${index}_integration` }
      )
      baseApp.installation.app_creation[0].nav_items.push(
        { key: "list", to: `/load-test-${index}/list`, label: "List", icon: "list", min_role: "member" },
        { key: "settings", to: `/load-test-${index}/settings`, label: "Settings", icon: "settings", min_role: "admin" }
      )
    }

    return yaml.dump(baseApp)
  }

  /**
   * Simulate app installation steps
   */
  private async simulateInstallation(appIndex: number): Promise<TestResult> {
    const result: TestResult = {
      appId: `load-test-app-${appIndex}`,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      success: false,
      steps: {
        validation: 0,
        packInstallation: 0,
        appCreation: 0,
        migrations: 0,
        verification: 0
      }
    }

    try {
      // Generate test app YAML
      const appYaml = this.generateTestApp(appIndex)
      
      // Step 1: Validation (simulate schema validation)
      const validationStart = performance.now()
      await this.simulateValidation(appYaml)
      result.steps.validation = performance.now() - validationStart

      // Step 2: Pack Installation
      const packStart = performance.now()
      await this.simulatePackInstallation(result.appId)
      result.steps.packInstallation = performance.now() - packStart

      // Step 3: App Creation
      const appStart = performance.now()
      await this.simulateAppCreation(result.appId)
      result.steps.appCreation = performance.now() - appStart

      // Step 4: Migrations
      const migrationsStart = performance.now()
      const migrationCount = this.config.appComplexity === 'simple' ? 0 : 
                           this.config.appComplexity === 'medium' ? 2 : 4
      await this.simulateMigrations(result.appId, migrationCount)
      result.steps.migrations = performance.now() - migrationsStart

      // Step 5: Verification
      const verificationStart = performance.now()
      const verificationCount = this.config.appComplexity === 'simple' ? 1 : 
                             this.config.appComplexity === 'medium' ? 3 : 5
      await this.simulateVerification(result.appId, verificationCount)
      result.steps.verification = performance.now() - verificationStart

      result.success = true
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }

    result.endTime = performance.now()
    result.duration = result.endTime - result.startTime

    return result
  }

  /**
   * Simulate validation step
   */
  private async simulateValidation(appYaml: string): Promise<void> {
    // Simulate YAML parsing and schema validation
    const complexity = this.config.appComplexity
    const delay = complexity === 'simple' ? 10 : complexity === 'medium' ? 25 : 50
    
    await this.sleep(delay)
    
    // Parse YAML to simulate actual validation work
    yaml.load(appYaml)
  }

  /**
   * Simulate pack installation
   */
  private async simulatePackInstallation(appId: string): Promise<void> {
    // Simulate database insert for installed_packs
    const complexity = this.config.appComplexity
    const delay = complexity === 'simple' ? 20 : complexity === 'medium' ? 40 : 80
    
    await this.sleep(delay)
  }

  /**
   * Simulate app creation
   */
  private async simulateAppCreation(appId: string): Promise<void> {
    // Simulate app_definitions creation
    const complexity = this.config.appComplexity
    const delay = complexity === 'simple' ? 15 : complexity === 'medium' ? 30 : 60
    
    await this.sleep(delay)
  }

  /**
   * Simulate migrations
   */
  private async simulateMigrations(appId: string, count: number): Promise<void> {
    // Simulate running SQL migrations
    for (let i = 0; i < count; i++) {
      const delay = this.config.appComplexity === 'simple' ? 10 : 
                   this.config.appComplexity === 'medium' ? 25 : 50
      await this.sleep(delay)
    }
  }

  /**
   * Simulate verification steps
   */
  private async simulateVerification(appId: string, count: number): Promise<void> {
    // Simulate verification checks
    for (let i = 0; i < count; i++) {
      await this.sleep(5)
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Run concurrent load test
   */
  async runLoadTest(): Promise<LoadTestReport> {
    console.log(`🚀 Starting load test...`)
    console.log(`Configuration:`, this.config)
    
    this.running = true
    this.startTime = performance.now()
    this.results = []

    const concurrentBatches = Math.ceil(this.config.totalApps / this.config.concurrentInstalls)
    
    for (let batch = 0; batch < concurrentBatches; batch++) {
      const startIndex = batch * this.config.concurrentInstalls
      const endIndex = Math.min(startIndex + this.config.concurrentInstalls, this.config.totalApps)
      const batchSize = endIndex - startIndex

      console.log(`📦 Running batch ${batch + 1}/${concurrentBatches} (${batchSize} apps)`)

      // Run installations concurrently
      const batchPromises = []
      for (let i = startIndex; i < endIndex; i++) {
        batchPromises.push(this.simulateInstallation(i))
      }

      const batchResults = await Promise.all(batchPromises)
      this.results.push(...batchResults)

      // Report progress
      const completed = this.results.length
      const successRate = (this.results.filter(r => r.success).length / this.results.length * 100).toFixed(1)
      console.log(`✅ Completed ${completed}/${this.config.totalApps} apps (${successRate}% success rate)`)

      // Check if we should stop due to time limit
      const elapsed = (performance.now() - this.startTime) / 1000
      if (elapsed >= this.config.testDuration) {
        console.log(`⏰ Time limit reached, stopping test`)
        break
      }
    }

    this.running = false
    return this.generateReport()
  }

  /**
   * Generate comprehensive report
   */
  private generateReport(): LoadTestReport {
    const successfulTests = this.results.filter(r => r.success)
    const failedTests = this.results.filter(r => !r.success)

    const durations = successfulTests.map(r => r.duration)
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0

    const totalElapsed = (performance.now() - this.startTime) / 1000
    const throughput = this.results.length / totalElapsed

    // Error aggregation
    const errorMap = new Map<string, number>()
    for (const test of failedTests) {
      const error = test.error || 'Unknown error'
      errorMap.set(error, (errorMap.get(error) || 0) + 1)
    }

    const errors = Array.from(errorMap.entries()).map(([error, count]) => ({ error, count }))

    // Step performance analysis
    const stepPerformance = {
      validation: this.calculateStepPerformance('validation'),
      packInstallation: this.calculateStepPerformance('packInstallation'),
      appCreation: this.calculateStepPerformance('appCreation'),
      migrations: this.calculateStepPerformance('migrations'),
      verification: this.calculateStepPerformance('verification')
    }

    return {
      config: this.config,
      results: this.results,
      summary: {
        totalTests: this.results.length,
        successfulTests: successfulTests.length,
        failedTests: failedTests.length,
        averageDuration: avgDuration,
        minDuration,
        maxDuration,
        throughput,
        errors
      },
      performance: stepPerformance
    }
  }

  /**
   * Calculate performance metrics for a specific step
   */
  private calculateStepPerformance(step: keyof TestResult['steps']) {
    const values = this.results.filter(r => r.success).map(r => r.steps[step])
    return {
      avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 0
    }
  }
}

/**
 * Pretty print report
 */
function printReport(report: LoadTestReport): void {
  console.log('\n' + '='.repeat(80))
  console.log('📊 LOAD TEST REPORT')
  console.log('='.repeat(80))

  console.log('\n🔧 Configuration:')
  console.log(`  Concurrent Installs: ${report.config.concurrentInstalls}`)
  console.log(`  Total Apps: ${report.config.totalApps}`)
  console.log(`  App Complexity: ${report.config.appComplexity}`)
  console.log(`  Test Duration: ${report.config.testDuration}s`)

  console.log('\n📈 Summary:')
  console.log(`  Total Tests: ${report.summary.totalTests}`)
  console.log(`  Successful: ${report.summary.successfulTests} (${(report.summary.successfulTests / report.summary.totalTests * 100).toFixed(1)}%)`)
  console.log(`  Failed: ${report.summary.failedTests} (${(report.summary.failedTests / report.summary.totalTests * 100).toFixed(1)}%)`)
  console.log(`  Average Duration: ${report.summary.averageDuration.toFixed(2)}ms`)
  console.log(`  Min Duration: ${report.summary.minDuration.toFixed(2)}ms`)
  console.log(`  Max Duration: ${report.summary.maxDuration.toFixed(2)}ms`)
  console.log(`  Throughput: ${report.summary.throughput.toFixed(2)} tests/second`)

  if (report.summary.errors.length > 0) {
    console.log('\n❌ Errors:')
    report.summary.errors.forEach(({ error, count }) => {
      console.log(`  ${error}: ${count}`)
    })
  }

  console.log('\n⚡ Step Performance:')
  Object.entries(report.performance).forEach(([step, perf]) => {
    console.log(`  ${step}:`)
    console.log(`    Avg: ${perf.avg.toFixed(2)}ms`)
    console.log(`    Min: ${perf.min.toFixed(2)}ms`)
    console.log(`    Max: ${perf.max.toFixed(2)}ms`)
  })

  console.log('\n' + '='.repeat(80))
}

// CLI setup
program
  .name('load-test-app-install')
  .description('Load testing for Spine app installation system')
  .version('1.0.0')
  .option('-c, --concurrent <number>', 'Number of concurrent installations', '10')
  .option('-t, --total <number>', 'Total number of apps to install', '100')
  .option('-x, --complexity <type>', 'App complexity (simple, medium, complex)', 'medium')
  .option('-d, --duration <seconds>', 'Maximum test duration in seconds', '300')
  .option('-r, --report-interval <seconds>', 'Progress report interval', '10')
  .action(async (options) => {
    const config: LoadTestConfig = {
      concurrentInstalls: parseInt(options.concurrent),
      totalApps: parseInt(options.total),
      appComplexity: options.complexity as 'simple' | 'medium' | 'complex',
      testDuration: parseInt(options.duration),
      reportInterval: parseInt(options.reportInterval)
    }

    const runner = new LoadTestRunner(config)
    const report = await runner.runLoadTest()
    printReport(report)

    // Exit with error code if there were failures
    if (report.summary.failedTests > 0) {
      process.exit(1)
    }
  })

program.parse()
