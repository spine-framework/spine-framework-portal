/**
 * @module src/pages/admin/TimersPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for scheduled timers. Fetches all timers via
 * `/api/timers?action=list`, applies client-side search, type filter
 * (`schedule` | `delay` | `recurring` | `cron`), and sort. Renders
 * inside `AdminListPage` with stat cards and a sortable table. Row
 * clicks navigate to `/spine-framework/admin/configs/timers/:id`.
 *
 * @seeAlso src/pages/admin/TimerDetailPage.tsx
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { Plus, Clock, CheckCircle, Calendar, RefreshCw, Settings } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { formatDateTime } from '../../lib/utils'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'

interface Timer {
  id: string
  name: string
  description?: string
  timer_type: 'schedule' | 'delay' | 'recurring' | 'cron'
  config: {
    schedule?: string
    delay_minutes?: number
    interval_minutes?: number
    cron_expression?: string
    timezone?: string
  }
  pipeline_id?: string
  pipeline_name?: string
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  last_execution?: string
  next_execution?: string
  execution_count: number
  success_count: number
  failure_count: number
}

export function TimersPage() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Fetch timers from API
  const { data: timers, loading, error, refetch } = useApi<Timer[]>(
    async ({ signal }: { signal?: AbortSignal }) => {
      try {
        console.log('Fetching timers...')
        const response = await apiFetch('/api/timers?action=list', { signal })
        console.log('Response status:', response.status)
        
        if (!response.ok) {
          console.error('Response not ok:', response.statusText)
          throw new Error(`Failed to fetch timers: ${response.statusText}`)
        }
        
        const result = await response.json()
        console.log('Raw API result:', result)
        
        // Handle both nested and direct responses
        const timers = result.data || result
        console.log('Timers after processing:', timers)
        
        return timers
      } catch (error) {
        console.error('Error in TimersPage:', error)
        throw error
      }
    },
    { immediate: true }
  )

  const timerTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'schedule', label: 'Schedule' },
    { value: 'delay', label: 'Delay' },
    { value: 'recurring', label: 'Recurring' },
    { value: 'cron', label: 'Cron' }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const filteredTimers = (timers || []).filter(timer => {
    const matchesSearch = timer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (timer.description && timer.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesType = selectedType === 'all' || timer.timer_type === selectedType
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'active' && timer.is_active) ||
                         (selectedStatus === 'inactive' && !timer.is_active)
    return matchesSearch && matchesType && matchesStatus
  })

  const getTimerIcon = (timerType: string) => {
    switch (timerType) {
      case 'schedule':
        return <Calendar className="h-5 w-5 text-blue-500" />
      case 'delay':
        return <Clock className="h-5 w-5 text-green-500" />
      case 'recurring':
        return <RefreshCw className="h-5 w-5 text-purple-500" />
      case 'cron':
        return <Settings className="h-5 w-5 text-orange-500" />
      default:
        return <Clock className="h-5 w-5 text-slate-500" />
    }
  }

  const getTimerBadgeColor = (timerType: string) => {
    switch (timerType) {
      case 'schedule':
        return 'bg-blue-100 text-blue-800'
      case 'delay':
        return 'bg-green-100 text-green-800'
      case 'recurring':
        return 'bg-purple-100 text-purple-800'
      case 'cron':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
  }

  const getSuccessRate = (timer: Timer) => {
    if (timer.execution_count === 0) return 0
    return Math.round((timer.success_count / timer.execution_count) * 100)
  }

  // Sorting logic
  const sortedTimers = [...filteredTimers].sort((a, b) => {
    const aValue = a[sortKey as keyof Timer]
    const bValue = b[sortKey as keyof Timer]

    if (aValue === undefined || aValue === null) return 1
    if (bValue === undefined || bValue === null) return -1

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    }

    if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
      return sortDirection === 'asc' 
        ? (aValue ? 1 : 0) - (bValue ? 1 : 0)
        : (bValue ? 1 : 0) - (aValue ? 1 : 0)
    }

    return 0
  })

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (timer: Timer) => {
    navigate(`/spine-framework/admin/configs/timers/${timer.id}`)
  }

  // Stats cards
  const statsCards = [
    {
      title: 'Total Timers',
      value: (timers || []).length,
      icon: Clock,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Active',
      value: (timers || []).filter(t => t.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Total Executions',
      value: (timers || []).reduce((sum, t) => sum + t.execution_count, 0),
      icon: Calendar,
      iconColor: 'text-orange-500'
    },
    {
      title: 'Success Rate',
      value: `${Math.round((timers || []).reduce((sum, t) => sum + getSuccessRate(t), 0) / Math.max((timers || []).length, 1))}%`,
      icon: CheckCircle,
      iconColor: 'text-purple-500'
    }
  ]

  const filters = [
    {
      label: 'Type',
      value: selectedType,
      options: timerTypes,
      onChange: setSelectedType
    },
    {
      label: 'Status',
      value: selectedStatus,
      options: statusOptions,
      onChange: setSelectedStatus
    }
  ]

  return (
    <AdminListPage
      title="Timers"
      description="Manage scheduled and recurring tasks"
      newButtonText="New Timer"
      newButtonHref="/spine-framework/admin/configs/timers/new"
      statsCards={statsCards}
      searchPlaceholder="Search timers..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      emptyMessage="No timers found"
      emptyIcon={Clock}
    >
      {sortedTimers.length === 0 ? (
        <div className="p-8 text-center">
          <Clock className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No timers found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Timer"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Type"
                sortKey="timer_type"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Status"
                sortKey="is_active"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Next Execution"
                sortKey="next_execution"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Executions"
                sortKey="execution_count"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Success Rate"
                sortKey="success_count"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Created"
                sortKey="created_at"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedTimers.map((timer) => (
              <tr 
                key={timer.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(timer)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-slate-900">
                      <span className="text-accent-blue hover:text-navy">
                        {timer.name}
                      </span>
                    </div>
                    {timer.description && (
                      <div className="text-sm text-slate-500">{timer.description}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <Badge variant={getTimerBadgeColor(timer.timer_type) as any}>
                      {timer.timer_type}
                    </Badge>
                    <div className="text-sm text-slate-500">
                      {timer.config.schedule || timer.config.cron_expression || 
                       `${timer.config.delay_minutes}min delay` || 
                       `${timer.config.interval_minutes}min interval`}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={getStatusBadgeColor(timer.is_active) as any}>
                    {timer.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {timer.next_execution ? formatDateTime(timer.next_execution) : 'Not scheduled'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-900">{timer.execution_count}</div>
                  <div className="text-xs text-slate-500">
                    {timer.success_count} success, {timer.failure_count} failed
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-slate-900">{getSuccessRate(timer)}%</div>
                  <div className="text-xs text-slate-500">
                    {timer.execution_count > 0 ? 'success rate' : 'no executions'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDateTime(timer.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminListPage>
  )
}
