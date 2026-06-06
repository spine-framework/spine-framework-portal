/**
 * @module src/pages/admin/PipelinesPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for automation pipelines. Fetches all pipelines via
 * `/api/pipelines?action=list`, applies client-side search, status filter,
 * trigger-type filter, and sort. Renders inside `AdminListPage` with stat
 * cards and a sortable table. Row clicks navigate to
 * `/spine-framework/admin/configs/pipelines/:id`.
 *
 * @seeAlso src/pages/admin/PipelineDetailPage.tsx
 */

import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { Plus, Search, Filter, Play, Pause, Pencil, Trash2, Settings, Calendar, User, RefreshCw, CheckCircle, Clock, Cog } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { formatDateTime } from '../../lib/utils'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'

interface Pipeline {
  id: string
  name: string
  description?: string
  trigger_type: string
  trigger_config: Record<string, any>
  stages: Array<{
    name: string
    type: string
    config: Record<string, any>
    order: number
  }>
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  execution_count: number
  last_execution?: string
  next_execution?: string
}

interface PipelineExecution {
  id: string
  pipeline_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string
  completed_at?: string
  trigger_data: Record<string, any>
  result?: Record<string, any>
  error?: string
}

export function PipelinesPage() {
  console.log('PipelinesPage rendering...')
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTrigger, setSelectedTrigger] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null)
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Fetch pipelines from API
  const { data: pipelines, loading, error, refetch } = useApi<Pipeline[]>(
    async ({ signal }: { signal?: AbortSignal }) => {
      try {
        console.log('Fetching pipelines...')
        
        // Check authentication using the same method as apiFetch
        const { supabase } = await import('../../lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Supabase session exists:', !!session)
        console.log('Supabase access token exists:', !!session?.access_token)
        console.log('Supabase access token length:', session?.access_token?.length || 0)
        
        // Also check localStorage for comparison
        const localToken = localStorage.getItem('access_token')
        console.log('localStorage token exists:', !!localToken)
        console.log('localStorage token length:', localToken?.length || 0)
        
        const response = await apiFetch('/api/pipelines?action=list', { signal })
        console.log('Response status:', response.status)
        console.log('Response headers:', Object.fromEntries(response.headers.entries()))
        
        if (!response.ok) {
          console.error('Response not ok:', response.statusText)
          throw new Error(`Failed to fetch pipelines: ${response.statusText}`)
        }
        
        const result = await response.json()
        console.log('Raw API result:', result)
        console.log('Result data type:', typeof result.data)
        console.log('Result data is array:', Array.isArray(result.data))
        console.log('Result data length:', result.data?.length || 'N/A')
        
        // Handle both nested and direct responses
        const pipelines = result.data || result
        console.log('Pipelines after processing:', pipelines)
        console.log('Pipelines is array:', Array.isArray(pipelines))
        console.log('Pipelines length:', pipelines.length)
        
        return pipelines
      } catch (error) {
        console.error('Error in PipelinesPage:', error)
        throw error
      }
    },
    { immediate: true }
  )

  const triggerOptions = [
    { value: 'all', label: 'All Triggers' },
    { value: 'schedule', label: 'Schedule' },
    { value: 'webhook', label: 'Webhook' },
    { value: 'event', label: 'Event' },
    { value: 'manual', label: 'Manual' },
  ]

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ]

  const filteredPipelines = (pipelines || []).filter(pipeline => {
    const matchesSearch = pipeline.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (pipeline.description && pipeline.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesStatus = selectedStatus === 'all' || pipeline.is_active === (selectedStatus === 'active')
    const matchesTrigger = selectedTrigger === 'all' || pipeline.trigger_type === selectedTrigger
    return matchesSearch && matchesStatus && matchesTrigger
  })

  const sortedPipelines = [...filteredPipelines].sort((a, b) => {
    const aValue = a[sortKey as keyof Pipeline]
    const bValue = b[sortKey as keyof Pipeline]
    
    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue as string)
        : (bValue as string).localeCompare(aValue)
    }
    
    if (typeof aValue === 'number') {
      return sortDirection === 'asc' ? aValue - (bValue as number) : (bValue as number) - aValue
    }
    
    return 0
  })

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case 'schedule':
        return <Calendar className="h-5 w-5 text-blue-500" />
      case 'webhook':
        return <RefreshCw className="h-5 w-5 text-green-500" />
      case 'user_created':
        return <User className="h-5 w-5 text-purple-500" />
      default:
        return <Settings className="h-5 w-5 text-slate-500" />
    }
  }

  const getTriggerBadgeColor = (triggerType: string) => {
    switch (triggerType) {
      case 'schedule':
        return 'bg-blue-100 text-blue-800'
      case 'webhook':
        return 'bg-green-100 text-green-800'
      case 'user_created':
        return 'bg-purple-100 text-purple-800'
      case 'item_created':
        return 'bg-orange-100 text-orange-800'
      case 'item_updated':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
  }

  const handleTogglePipeline = (pipeline: Pipeline) => {
    console.log('Toggle pipeline:', pipeline.id)
  }

  const handleExecutePipeline = (pipeline: Pipeline) => {
    console.log('Execute pipeline:', pipeline.id)
  }

  const handleViewExecutions = (pipeline: Pipeline) => {
    navigate(`/spine-framework/admin/configs/pipelines/${pipeline.id}/executions`)
  }

  const handleRowClick = (pipeline: Pipeline) => {
    navigate(`/spine-framework/admin/configs/pipelines/${pipeline.id}`)
  }

  const handleEditPipeline = (pipeline: Pipeline) => {
    navigate(`/spine-framework/admin/configs/pipelines/${pipeline.id}/edit`)
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  return (
    <AdminListPage
      title="Pipelines"
      description="Manage automated workflows and processes"
      newButtonText="New Pipeline"
      newButtonHref="/spine-framework/admin/configs/pipelines/new"
      statsCards={[
        {
          title: "Total Pipelines",
          value: (pipelines || []).length,
          icon: Play,
          iconColor: "text-blue-600"
        },
        {
          title: "Active",
          value: (pipelines || []).filter(p => p.is_active).length,
          icon: CheckCircle,
          iconColor: "text-green-600"
        },
        {
          title: "Runs Today",
          value: "32",
          icon: Clock,
          iconColor: "text-orange-600"
        }
      ]}
      searchPlaceholder="Search pipelines..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={[
        {
          label: "Status",
          value: selectedStatus,
          options: statusOptions,
          onChange: setSelectedStatus
        },
        {
          label: "Trigger",
          value: selectedTrigger,
          options: triggerOptions,
          onChange: setSelectedTrigger
        }
      ]}
      loading={loading}
      error={error}
      onRetry={refetch}
      emptyMessage="No pipelines found"
      emptyIcon={Cog}
    >
      {sortedPipelines.length === 0 ? (
        <div className="text-center py-12">
          <Settings className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No pipelines found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Get started by creating your first automated workflow.
          </p>
          <div className="mt-6">
            <Button onClick={() => navigate('/spine-framework/admin/configs/pipelines/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Pipeline
            </Button>
          </div>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Pipeline"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Trigger"
                sortKey="trigger_type"
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
                title="Executions"
                sortKey="execution_count"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Last Run"
                sortKey="last_execution"
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
            {sortedPipelines.map((pipeline) => (
              <tr 
                key={pipeline.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(pipeline)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{pipeline.name}</div>
                    {pipeline.description && (
                      <div className="text-sm text-slate-500">{pipeline.description}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {getTriggerIcon(pipeline.trigger_type)}
                    <Badge variant={getTriggerBadgeColor(pipeline.trigger_type) as any}>
                      {pipeline.trigger_type.replace('_', ' ')}
                    </Badge>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={getStatusBadgeColor(pipeline.is_active) as any}>
                    {pipeline.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                  {pipeline.execution_count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {pipeline.last_execution ? formatDateTime(pipeline.last_execution) : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewExecutions(pipeline)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditPipeline(pipeline)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminListPage>
  )
}
