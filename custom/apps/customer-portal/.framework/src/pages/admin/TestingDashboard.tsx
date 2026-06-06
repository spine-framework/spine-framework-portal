/**
 * @module src/pages/admin/TestingDashboard
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin Testing dashboard. Shows per-suite health cards (unit, integration,
 * api, ui) and a table of the 20 most recent test runs. Read-only — tests
 * are triggered by the agentic IDE, not from this UI.
 *
 * Route: /admin/testing
 *
 * @seeAlso src/pages/admin/TestRunDetailPage.tsx
 * @seeAlso functions/tests.ts (data source)
 * @seeAlso migrations_dayzero/008_test_runs.sql
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { AgentView } from '../../components/shared/AgentView'
import { FlaskConical, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { formatDateTime } from '../../lib/utils'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface SuiteStat {
  suite:        string
  total_runs:   number
  last_status:  string | null
  last_run_at:  string | null
  last_passed:  number | null
  last_failed:  number | null
  last_total:   number | null
}

interface TestRun {
  id:           string
  suite:        string
  status:       string
  started_at:   string
  finished_at:  string | null
  duration_ms:  number | null
  total:        number | null
  passed:       number | null
  failed:       number | null
  skipped:      number | null
  triggered_by: string | null
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const SUITE_LABELS: Record<string, string> = {
  unit:        'Unit',
  integration: 'Integration',
  api:         'API',
  ui:          'UI',
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const color =
    status === 'passed'  ? 'bg-green-100 text-green-800' :
    status === 'failed'  ? 'bg-red-100 text-red-800'    :
    status === 'running' ? 'bg-blue-100 text-blue-800'  :
                           'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {status}
    </span>
  )
}

function durationLabel(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── SUITE HEALTH CARD ───────────────────────────────────────────────────────

function SuiteCard({ stat }: { stat: SuiteStat }) {
  const label = SUITE_LABELS[stat.suite] ?? stat.suite
  const passRate = stat.last_total
    ? Math.round(((stat.last_passed ?? 0) / stat.last_total) * 100)
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <StatusBadge status={stat.last_status} />
      </div>
      {stat.last_run_at ? (
        <>
          <div className="text-xs text-gray-500">
            Last run {formatDateTime(stat.last_run_at)}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 font-medium">{stat.last_passed ?? 0}✓</span>
            <span className="text-red-500 font-medium">{stat.last_failed ?? 0}✗</span>
            {passRate !== null && (
              <span className="text-gray-500">{passRate}% pass</span>
            )}
          </div>
        </>
      ) : (
        <div className="text-xs text-gray-400">No runs yet</div>
      )}
      <div className="text-xs text-gray-400">{stat.total_runs} total run{stat.total_runs !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function TestingDashboard() {
  const navigate = useNavigate()

  const { data: statsData, loading: statsLoading, execute: refreshStats } = useApi(
    () => apiFetch('/.netlify/functions/tests?action=stats').then(r => r.json()),
    { immediate: true }
  )

  const { data: runsData, loading: runsLoading, execute: refreshRuns } = useApi(
    () => apiFetch('/.netlify/functions/tests?action=list&limit=20').then(r => r.json()),
    { immediate: true }
  )

  const loading = statsLoading || runsLoading

  function handleRefresh() {
    refreshStats()
    refreshRuns()
  }

  // API returns { data: { data: [...], error: null }, error: null, meta: {...} }
  const stats: SuiteStat[] = (statsData as any)?.data?.data ?? []
  const runs: TestRun[]    = (runsData as any)?.data?.data  ?? []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-gray-500" />
          <h1 className="text-xl font-semibold text-gray-900">Testing</h1>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Suite health cards */}
      {statsLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {['unit', 'integration', 'api', 'ui'].map(suite => {
            const stat = stats.find(s => s.suite === suite) ?? {
              suite, total_runs: 0, last_status: null, last_run_at: null,
              last_passed: null, last_failed: null, last_total: null
            }
            return <SuiteCard key={suite} stat={stat} />
          })}
        </div>
      )}

      {/* Recent runs table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Recent Runs</span>
        </div>

        {runsLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : runs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No test runs yet. Trigger a test suite from the IDE.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Suite</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Started</th>
                <th className="px-4 py-2 text-right">Pass</th>
                <th className="px-4 py-2 text-right">Fail</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {runs.map(run => (
                <tr
                  key={run.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/spine-framework/admin/testing/${run.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-gray-700">
                      {SUITE_LABELS[run.suite] ?? run.suite}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {formatDateTime(run.started_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                    {run.passed ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-red-500 font-medium">
                    {run.failed ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500">
                    {run.total ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400">
                    {durationLabel(run.duration_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Empty state hint */}
      {!loading && runs.length > 0 && (
        <p className="mt-3 text-xs text-gray-400 text-center">
          Click any row to view individual test case results
        </p>
      )}

      {/* Agent View — for developers and agentic IDEs */}
      {!loading && stats.length > 0 && runs.length > 0 && (
        <AgentView
          data={{ suite_stats: stats, recent_runs: runs.slice(0, 5) }}
          endpoint="/.netlify/functions/tests"
          method="GET"
          query={{ action: 'stats' }}
          title="Agent View — Test Data API"
        />
      )}
    </div>
  )
}
