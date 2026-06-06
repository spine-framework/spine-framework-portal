/**
 * @module src/pages/admin/LogsPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin log viewer. Fetches system audit/activity logs via
 * `/api/admin-data?action=logs`, applies client-side search, severity
 * filter, date-range filter, and sort. Renders inside `AdminListPage`
 * with a sortable table. Useful for debugging pipeline executions,
 * auth events, and API errors.
 *
 * @seeAlso src/pages/admin/ObservabilityDashboard.tsx
 */

import React, { useState } from 'react'
import { FileText, Search, Calendar, AlertTriangle, CheckCircle, User } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Button } from '../../components/ui/button'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { formatDateTime } from '../../lib/utils'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'

interface LogEntry {
  id: string
  event_type: string
  actor_id?: string
  target_type?: string
  target_id?: string
  action?: string
  details?: Record<string, any>
  metadata?: Record<string, any>
  created_at: string
  actor?: {
    id: string
    full_name: string
    email: string
  }
}

export function LogsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEventType, setSelectedEventType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const { data: logs, loading, error, refetch } = useApi<LogEntry[]>(
    async () => {
      let url = '/api/logs?action=account'
      if (dateFrom) url += `&date_from=${dateFrom}`
      if (dateTo) url += `&date_to=${dateTo}`
      
      const response = await apiFetch(url)
      if (!response.ok) throw new Error('Failed to fetch logs')
      const result = await response.json()
      return (result.data || result) as LogEntry[]
    },
    { immediate: true }
  )

  const { data: stats } = useApi<{ total: number; by_type: Record<string, number> }>(
    async () => {
      const response = await apiFetch('/api/logs?action=stats')
      if (!response.ok) return null
      const result = await response.json()
      return result.data || result
    },
    { immediate: true }
  )

  const filteredLogs = (logs || []).filter(log => {
    const matchesSearch = !searchTerm || 
      log.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = selectedEventType === 'all' || log.event_type === selectedEventType
    return matchesSearch && matchesType
  })

  const eventTypes = Array.from(new Set((logs || []).map(l => l.event_type)))

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const sortedLogs = [...(filteredLogs || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof LogEntry] || ''
    let bValue: any = b[sortKey as keyof LogEntry] || ''
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    return 0
  })

  const getEventTypeBadge = (eventType: string) => {
    if (eventType.includes('error') || eventType.includes('failed')) {
      return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-red-100 text-red-700">{eventType}</span>
    }
    if (eventType.includes('created') || eventType.includes('success')) {
      return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-700">{eventType}</span>
    }
    if (eventType.includes('updated') || eventType.includes('modified')) {
      return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-blue-100 text-blue-700">{eventType}</span>
    }
    return <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600">{eventType}</span>
  }

  const statsCards = [
    {
      title: 'Total Events',
      value: stats?.total || (logs || []).length,
      icon: FileText,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Event Types',
      value: eventTypes.length,
      icon: Calendar,
      iconColor: 'text-purple-500'
    },
    {
      title: 'Errors',
      value: (logs || []).filter(l => l.event_type.includes('error')).length,
      icon: AlertTriangle,
      iconColor: 'text-red-500'
    },
    {
      title: 'User Actions',
      value: (logs || []).filter(l => l.actor_id).length,
      icon: User,
      iconColor: 'text-green-500'
    }
  ]

  const eventTypeOptions = [
    { value: 'all', label: 'All Events' },
    ...eventTypes.map(type => ({ value: type, label: type }))
  ]

  const filters = [
    {
      label: 'Event Type',
      value: selectedEventType,
      options: eventTypeOptions,
      onChange: setSelectedEventType
    }
  ]

  return (
    <AdminListPage
      title="System Logs"
      description="Audit trail and event history"
      statsCards={statsCards}
      searchPlaceholder="Search logs..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      error={error}
      emptyMessage="No logs found"
      emptyIcon={FileText}
    >
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex-1" />
          <Button variant="secondary" onClick={refetch} className="text-sm">
            Refresh
          </Button>
        </div>
      </div>

      {sortedLogs.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No logs found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or date filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Time"
                sortKey="created_at"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Event Type"
                sortKey="event_type"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Action"
                sortKey="action"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Target"
                sortKey="target_type"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Actor"
                sortKey="actor"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedLogs.map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getEventTypeBadge(log.event_type)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                  {log.action || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {log.target_type ? (
                    <span>
                      {log.target_type}
                      {log.target_id && <span className="text-slate-400 ml-1">({log.target_id.slice(0, 8)})</span>}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {log.actor?.full_name || log.actor_id?.slice(0, 8) || 'System'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminListPage>
  )
}
