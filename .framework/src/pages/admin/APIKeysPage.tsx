/**
 * @module src/pages/admin/APIKeysPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for API keys. Fetches all keys via
 * `/api/api-keys?action=list`, applies client-side search, type filter
 * (`public` | `private`), and sort. Key values are never shown in the
 * list — only the prefix. Renders inside `AdminListPage`. Row clicks
 * navigate to `/spine-framework/admin/configs/api-keys/:id`.
 *
 * @seeAlso src/pages/admin/APIKeyDetailPage.tsx
 */

import React, { useState } from 'react'
import { Plus, Key, CheckCircle, Clock, ShieldCheck, RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { Button } from '../../components/ui/button'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { formatDateTime } from '../../lib/utils'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'

interface APIKey {
  id: string
  name: string
  key_type: 'public' | 'private'
  is_active: boolean
  last_used_at?: string
  expires_at?: string
  rate_limit?: number
  usage_count?: number
  integration?: {
    id: string
    name: string
    provider: string
  }
  created_by_person?: {
    id: string
    full_name: string
    email: string
  }
  created_at: string
}

export function APIKeysPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const { data: apiKeys, loading, error, refetch } = useApi<APIKey[]>(
    async () => {
      const response = await apiFetch('/api/api-keys?action=list')
      if (!response.ok) throw new Error('Failed to fetch API keys')
      const result = await response.json()
      return (result.data || result) as APIKey[]
    },
    { immediate: true }
  )

  const filteredKeys = (apiKeys || []).filter(key => {
    const matchesSearch = key.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (key.integration?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && key.is_active) ||
      (selectedStatus === 'inactive' && !key.is_active)
    const matchesType = selectedType === 'all' || key.key_type === selectedType
    return matchesSearch && matchesStatus && matchesType
  })

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (key: APIKey) => {
    window.location.href = `/spine-framework/admin/configs/api-keys/${key.id}`
  }

  const sortedKeys = [...(filteredKeys || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof APIKey]
    let bValue: any = b[sortKey as keyof APIKey]
    
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

  const isExpired = (key: APIKey) => {
    if (!key.expires_at) return false
    return new Date(key.expires_at) < new Date()
  }

  const statsCards = [
    {
      title: 'Total Keys',
      value: (apiKeys || []).length,
      icon: Key,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Active',
      value: (apiKeys || []).filter(k => k.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Private Keys',
      value: (apiKeys || []).filter(k => k.key_type === 'private').length,
      icon: ShieldCheck,
      iconColor: 'text-purple-500'
    },
    {
      title: 'Expiring Soon',
      value: (apiKeys || []).filter(k => {
        if (!k.expires_at) return false
        const days = Math.ceil((new Date(k.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        return days > 0 && days <= 7
      }).length,
      icon: Clock,
      iconColor: 'text-orange-500'
    }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'public', label: 'Public' },
    { value: 'private', label: 'Private' }
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
      title="API Keys"
      description="Manage API keys and access tokens"
      newButtonText="Generate API Key"
      newButtonHref="/spine-framework/admin/configs/api-keys/new"
      statsCards={statsCards}
      searchPlaceholder="Search API keys..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      error={error}
      emptyMessage="No API keys found"
      emptyIcon={Key}
    >
      {sortedKeys.length === 0 ? (
        <div className="p-8 text-center">
          <Key className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No API keys found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Name"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Type"
                sortKey="key_type"
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
                title="Integration"
                sortKey="integration"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Usage"
                sortKey="usage_count"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Expires"
                sortKey="expires_at"
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
            {sortedKeys.map((key) => (
              <tr 
                key={key.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(key)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-medium text-slate-900">
                    <span className="text-accent-blue hover:text-navy">
                      {key.name}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {key.created_by_person?.full_name || key.created_by_person?.email || 'System'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md ${
                    key.key_type === 'private'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {key.key_type}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md ${
                    key.is_active && !isExpired(key)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {key.is_active && !isExpired(key) ? 'Active' : isExpired(key) ? 'Expired' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                  {key.integration?.name || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {key.usage_count?.toLocaleString() || '0'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {key.expires_at ? (
                    <span className={isExpired(key) ? 'text-red-600' : ''}>
                      {formatDateTime(key.expires_at)}
                    </span>
                  ) : (
                    'Never'
                  )}
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
