/**
 * @module src/pages/admin/EmbeddingsPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for embedding model configurations. Fetches all models
 * via `/api/embeddings?action=list`, applies client-side search, provider
 * filter (`openai` | `anthropic` | `local` | `custom`), and sort. Renders
 * inside `AdminListPage`. Row clicks navigate to
 * `/spine-framework/admin/configs/embeddings/:id`.
 *
 * @seeAlso src/pages/admin/EmbeddingDetailPage.tsx
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, FileText, CheckCircle, BarChart3 } from 'lucide-react';
import { formatDateTime, formatFileSize } from '../../lib/utils'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { Badge } from '../../components/ui/badge'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'

interface EmbeddingModel {
  id: string
  name: string
  description?: string
  model_name: string
  provider: 'openai' | 'anthropic' | 'local' | 'custom'
  config: {
    dimension: number
    chunk_size: number
    overlap: number
    batch_size: number
  }
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  document_count: number
  embedding_count: number
  storage_size: number
}

interface EmbeddingDocument {
  id: string
  model_id: string
  title: string
  content_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  chunk_count: number
  embedding_count: number
  created_at: string
  updated_at: string
  created_by: string
  error?: string
}

interface EmbeddingSearch {
  query: string
  results: Array<{
    document_id: string
    document_title: string
    chunk_content: string
    similarity_score: number
    chunk_index: number
  }>
  search_time: number
  total_results: number
}

export function EmbeddingsPage() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Fetch embeddings from API
  const { data: embeddings, loading, error, refetch } = useApi<any[]>(
    async () => {
      try {
        console.log('Fetching embeddings...')
        const response = await apiFetch('/api/embeddings?action=list')
        console.log('Response status:', response.status)
        
        if (!response.ok) {
          console.error('Response not ok:', response.statusText)
          throw new Error(`Failed to fetch embeddings: ${response.statusText}`)
        }
        
        const result = await response.json()
        console.log('Raw API result:', result)
        
        // Handle both nested and direct responses
        const embeddings = result.data || result
        console.log('Embeddings after processing:', embeddings)
        
        return embeddings
      } catch (error) {
        console.error('Error in EmbeddingsPage:', error)
        throw error
      }
    },
    { immediate: true }
  )

  const mockDocuments: EmbeddingDocument[] = [
    {
      id: '1',
      model_id: '1',
      title: 'User Guide - Getting Started',
      content_type: 'pdf',
      status: 'completed',
      chunk_count: 45,
      embedding_count: 45,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      created_by: 'Jane Smith'
    },
    {
      id: '2',
      model_id: '1',
      title: 'API Documentation',
      content_type: 'markdown',
      status: 'processing',
      chunk_count: 67,
      embedding_count: 0,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(),
      created_by: 'John Doe'
    },
    {
      id: '3',
      model_id: '2',
      title: 'React Components Library',
      content_type: 'code',
      status: 'completed',
      chunk_count: 234,
      embedding_count: 234,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      created_by: 'Mike Johnson'
    },
    {
      id: '4',
      model_id: '1',
      title: 'Company Policies',
      content_type: 'docx',
      status: 'failed',
      chunk_count: 0,
      embedding_count: 0,
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
      created_by: 'Admin',
      error: 'Document format not supported'
    }
  ]

  const mockSearchResults: EmbeddingSearch = {
    query: 'how to reset password',
    results: [
      {
        document_id: '1',
        document_title: 'User Guide - Getting Started',
        chunk_content: 'To reset your password, go to the settings page and click on "Reset Password"...',
        similarity_score: 0.95,
        chunk_index: 12
      },
      {
        document_id: '1',
        document_title: 'User Guide - Getting Started',
        chunk_content: 'Password reset emails are sent to your registered email address...',
        similarity_score: 0.87,
        chunk_index: 13
      },
      {
        document_id: '3',
        document_title: 'React Components Library',
        chunk_content: 'The PasswordReset component handles user password reset functionality...',
        similarity_score: 0.72,
        chunk_index: 45
      }
    ],
    search_time: 0.234,
    total_results: 3
  }

  const providers = [
    { value: 'all', label: 'All Providers' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'local', label: 'Local' },
    { value: 'custom', label: 'Custom' }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const filteredModels = (embeddings || []).filter(embedding => {
    const matchesSearch = embedding.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (embedding.metadata?.source && embedding.metadata.source.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesProvider = selectedProvider === 'all' || embedding.metadata?.source === selectedProvider
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'active' && true) || // All embeddings are considered active
                         (selectedStatus === 'inactive' && false)
    return matchesSearch && matchesProvider && matchesStatus
  })

  // Helper functions
  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'bg-green-100 text-green-800'
      case 'anthropic':
        return 'bg-blue-100 text-blue-800'
      case 'local':
        return 'bg-purple-100 text-purple-800'
      case 'custom':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (model: EmbeddingModel) => {
    navigate(`/spine-framework/admin/configs/embeddings/${model.id}`)
  }

  // Sort models
  const sortedModels = [...filteredModels].sort((a, b) => {
    let aValue: any = a[sortKey as keyof EmbeddingModel]
    let bValue: any = b[sortKey as keyof EmbeddingModel]
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    if (typeof aValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    }
    
    return 0
  })

  const statsCards = [
    {
      title: 'Total Embeddings',
      value: (embeddings || []).length,
      icon: FileText,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Active',
      value: (embeddings || []).filter(m => m.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Documents Processed',
      value: (embeddings || []).length, // Simplified count since embeddings table structure is different
      icon: BarChart3,
      iconColor: 'text-orange-500'
    },
    {
      title: 'Last Updated',
      value: (embeddings || []).length > 0 ? 'Just now' : 'Never',
      icon: Box,
      iconColor: 'text-purple-500'
    }
  ]

  const filters = [
    {
      label: 'Provider',
      value: selectedProvider,
      options: providers,
      onChange: setSelectedProvider
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
      title="Embeddings"
      description="Manage embedding models and document indexes"
      newButtonText="New Model"
      newButtonHref="/spine-framework/admin/configs/embeddings/new"
      statsCards={statsCards}
      searchPlaceholder="Search models..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={false}
      emptyMessage="No embedding models found"
      emptyIcon={FileText}
    >
      {sortedModels.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No models found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Content"
                sortKey="content"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Source/Type"
                sortKey="metadata.source"
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
                title="Dimensions"
                sortKey="embedding"
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
            {sortedModels.map((model) => (
              <tr 
                key={model.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(model)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-slate-900">
                      <span className="text-accent-blue hover:text-navy">
                        {model.content?.substring(0, 60)}...
                      </span>
                    </div>
                    <div className="text-sm text-slate-500">
                      Chunk {model.chunk_index} • {model.metadata?.type}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="space-y-1">
                    <Badge variant={getProviderBadgeColor(model.metadata?.source) as any}>
                      {model.metadata?.source}
                    </Badge>
                    <div className="text-sm text-slate-900 font-mono">{model.metadata?.language}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant="success">
                    Active
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm text-slate-900">1 chunk</div>
                    <div className="text-xs text-slate-500">
                      {model.embedding?.length} dimensions
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDateTime(model.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminListPage>
  )
}
