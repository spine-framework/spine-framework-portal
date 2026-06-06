/**
 * @module src/pages/admin/IntegrationsPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for third-party integrations (integration instances).
 * Fetches all integration instances via `/api/integrations?action=list`,
 * applies client-side search, status filter, and sort. Renders inside
 * `AdminListPage`. Row clicks navigate to
 * `/spine-framework/admin/configs/integrations/:id`.
 *
 * @seeAlso src/pages/admin/IntegrationDetailPage.tsx
 */

import { useState } from 'react'
import { Link, CheckCircle, AlertTriangle, Settings, Cog } from 'lucide-react';
import { formatDateTime } from '../../lib/utils'
import { apiFetch } from '../../lib/api'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { useApi } from '../../hooks/useApi'

interface Integration {
  id: string
  name: string
  description: string
  integration_type: string
  provider: string
  version?: string
  is_active: boolean
  is_configured: boolean
  last_sync_at?: string
  sync_status?: string
  sync_error?: string
  created_at: string
  updated_at: string
  app?: {
    id: string
    slug: string
    name: string
  }
  created_by_person?: {
    id: string
    full_name: string
    email: string
  }
}

export function IntegrationsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Fetch integrations from API
  const { data: integrations, loading, error } = useApi<Integration[]>(
    async ({ signal }: { signal?: AbortSignal }) => {
      const response = await apiFetch('/api/integrations?action=list', { signal })
      if (!response.ok) throw new Error('Failed to fetch integrations')
      const result = await response.json()
      return result.data || []
    },
    { immediate: true }
  )

  const filteredIntegrations = (integrations || []).filter(integration => {
    const matchesSearch = integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         integration.provider.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && integration.is_active) ||
      (selectedStatus === 'inactive' && !integration.is_active)
    const matchesType = selectedType === 'all' || integration.integration_type === selectedType
    return matchesSearch && matchesStatus && matchesType
  })

  const types = Array.from(new Set((integrations || []).map(i => i.integration_type)))

  // Helper functions
  const getStatusBadge = (integration: Integration) => {
    if (!integration.is_active) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">Inactive</span>
    }
    if (integration.sync_status === 'error') {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">Error</span>
    }
    if (integration.is_configured) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Configured</span>
    }
    return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (integration: Integration) => {
    window.location.href = `/spine-framework/admin/configs/integrations/${integration.id}`
  }

  // Sort integrations
  const sortedIntegrations = [...(filteredIntegrations || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof Integration]
    let bValue: any = b[sortKey as keyof Integration]
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    if (typeof aValue === 'boolean') {
      return sortDirection === 'asc' ? (aValue ? 1 : 0) : (bValue ? 1 : 0)
    }
    
    return 0
  })

  const statsCards = [
    {
      title: 'Total Integrations',
      value: (integrations || []).length,
      icon: Link,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Active',
      value: (integrations || []).filter(i => i.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Configured',
      value: (integrations || []).filter(i => i.is_configured).length,
      icon: Cog,
      iconColor: 'text-purple-500'
    },
    {
      title: 'Errors',
      value: (integrations || []).filter(i => i.sync_status === 'error').length,
      icon: AlertTriangle,
      iconColor: 'text-red-500'
    }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    ...types.map(type => ({ value: type, label: type }))
  ]

  const filters = [
    {
      label: 'Status',
      value: selectedStatus,
      options: statusOptions,
      onChange: setSelectedStatus
    },
    {
      label: 'Type',
      value: selectedType,
      options: typeOptions,
      onChange: setSelectedType
    }
  ]

  return (
    <AdminListPage
      title="Integrations"
      description="Configure external service integrations and connections"
      newButtonText="Add Integration"
      newButtonHref="/spine-framework/admin/configs/integrations/new"
      statsCards={statsCards}
      searchPlaceholder="Search integrations..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      error={error}
      emptyMessage="No integrations found"
      emptyIcon={Link}
    >
      {sortedIntegrations.length === 0 ? (
        <div className="p-8 text-center">
          <Link className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No integrations found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Integration"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Provider"
                sortKey="provider"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Type"
                sortKey="integration_type"
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
                title="Last Sync"
                sortKey="last_sync_at"
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
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedIntegrations.map((integration) => (
              <tr 
                key={integration.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(integration)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-slate-900">
                      <span className="text-accent-blue hover:text-navy">
                        {integration.name}
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">
                      {integration.description}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-slate-900 font-medium">{integration.provider}</span>
                  {integration.version && (
                    <span className="text-xs text-slate-500 ml-1">v{integration.version}</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-slate-900">{integration.integration_type}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(integration)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {integration.last_sync_at ? formatDateTime(integration.last_sync_at) : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDateTime(integration.created_at)}
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
