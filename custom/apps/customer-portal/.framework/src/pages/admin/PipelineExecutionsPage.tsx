/**
 * @module src/pages/admin/PipelineExecutionsPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Read-only log of pipeline execution history. Fetches execution records
 * via `/api/pipelines?action=executions`, applies client-side search,
 * status filter (`running` | `success` | `failed` | `cancelled`), and
 * sort. Renders inside `AdminListPage` with a sortable table showing
 * pipeline name, status, duration, and timestamps.
 *
 * @seeAlso src/pages/admin/PipelinesPage.tsx
 * @seeAlso src/pages/admin/ObservabilityDashboard.tsx
 */

import React, { useState } from 'react'
import { Play, CheckCircle, XCircle, Clock, RefreshCw, Zap } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Button } from '../../components/ui/button'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { formatDateTime } from '../../lib/utils'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'

interface PipelineExecution {
  id: string
  pipeline_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  trigger_data?: Record<string, any>
  result?: Record<string, any>
  error_message?: string
  started_at?: string
  completed_at?: string
  duration_ms?: number
  created_by?: string
  pipeline?: {
    id: string
    name: string
    trigger_type: string
  }
  triggered_by_person?: {
    id: string
    full_name: string
    email: string
  }
  created_at: string
}

export function PipelineExecutionsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortKey, setSortKey] = useState('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const { data: executions, loading, error, refetch } = useApi<PipelineExecution[]>(
    async () => {
      const response = await apiFetch('/api/pipeline-executions?action=list')
      if (!response.ok) throw new Error('Failed to fetch pipeline executions')
      const result = await response.json()
      return (result.data || result) as PipelineExecution[]
    },
    { immediate: true }
  )

  const { data: stats } = useApi<{ total: number; completed: number; failed: number; running: number }>(
    async () => {
      const response = await apiFetch('/api/pipeline-executions?action=stats')
      if (!response.ok) return null
      const result = await response.json()
      return result.data || result
    },
    { immediate: true }
  )

  const filteredExecutions = (executions || []).filter(exec => {
    const matchesSearch = exec.pipeline?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exec.error_message?.toLowerCase().includes(searchTerm.toLowerCase()) || false
    const matchesStatus = selectedStatus === 'all' || exec.status === selectedStatus
    return matchesSearch && matchesStatus
  })

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (exec: PipelineExecution) => {
    window.location.href = `/spine-framework/admin/observability/executions/${exec.id}`
  }

  const sortedExecutions = [...(filteredExecutions || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof PipelineExecution] || ''
    let bValue: any = b[sortKey as keyof PipelineExecution] || ''
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    return 0
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-700">Completed</span>
      case 'running':
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-blue-100 text-blue-700">Running</span>
      case 'pending':
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-yellow-100 text-yellow-700">Pending</span>
      case 'failed':
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-red-100 text-red-700">Failed</span>
      case 'cancelled':
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600">Cancelled</span>
      default:
        return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600">{status}</span>
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return '—'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const statsCards = [
    {
      title: 'Total Executions',
      value: stats?.total || (executions || []).length,
      icon: Zap,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Completed',
      value: stats?.completed || (executions || []).filter(e => e.status === 'completed').length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Failed',
      value: stats?.failed || (executions || []).filter(e => e.status === 'failed').length,
      icon: XCircle,
      iconColor: 'text-red-500'
    },
    {
      title: 'Running',
      value: stats?.running || (executions || []).filter(e => e.status === 'running').length,
      icon: Play,
      iconColor: 'text-blue-500'
    }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'running', label: 'Running' },
    { value: 'completed', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' }
  ]

  const filters = [
    {
      label: 'Status',
      value: selectedStatus,
      options: statusOptions,
      onChange: setSelectedStatus
    }
  ]

  return (
    <AdminListPage
      title="Pipeline Executions"
      description="Monitor and manage pipeline runs"
      statsCards={statsCards}
      searchPlaceholder="Search executions..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      error={error}
      emptyMessage="No pipeline executions found"
      emptyIcon={RefreshCw}
    >
      {sortedExecutions.length === 0 ? (
        <div className="p-8 text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No executions found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Pipeline"
                sortKey="pipeline"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Status"
                sortKey="status"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Started"
                sortKey="started_at"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Duration"
                sortKey="duration_ms"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Triggered By"
                sortKey="triggered_by"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedExecutions.map((exec) => (
              <tr 
                key={exec.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(exec)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-slate-900">
                    {exec.pipeline?.name || 'Unknown Pipeline'}
                  </div>
                  <div className="text-xs text-slate-500 font-mono">{exec.id.slice(0, 8)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(exec.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {exec.started_at ? formatDateTime(exec.started_at) : 'Not started'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDuration(exec.duration_ms)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {exec.triggered_by_person?.full_name || exec.created_by || 'System'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <span className="text-slate-400">→</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminListPage>
  )
}
