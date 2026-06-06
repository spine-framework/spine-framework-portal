/**
 * @module src/pages/admin/AIAgentsPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin list page for AI agents. Fetches all agents via
 * `/api/ai-agents?action=list`, applies client-side search, agent-type
 * filter (`chat` | `analysis` | `automation` | `custom`), and sort.
 * Renders inside `AdminListPage` with stat cards and a sortable table.
 * Row clicks navigate to `/spine-framework/admin/configs/ai-agents/:id`.
 *
 * @seeAlso src/pages/admin/AIAgentDetailPage.tsx
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, CheckCircle, Clock } from 'lucide-react';
import { formatDateTime } from '../../lib/utils'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'
import { Badge } from '../../components/ui/badge'

interface AIAgent {
  id: string
  name: string
  description?: string
  agent_type: 'chat' | 'analysis' | 'automation' | 'custom'
  model_config: {
    model: string
    max_tokens?: number
    temperature?: number
  }
  system_prompt: string
  tools: string[]
  capabilities?: Record<string, any>
  constraints?: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  app_id?: string
  metadata?: Record<string, any>
}

export function AIAgentsPage() {
  const navigate = useNavigate()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedModel, setSelectedModel] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Fetch AI agents from API
  const { data: agents, loading } = useApi<AIAgent[]>(
    async (params) => {
      const response = await apiFetch('/api/ai-agents?action=list', { signal: params?.signal })
      if (!response.ok) throw new Error('Failed to fetch AI agents')
      const result = await response.json()
      return result.data || []
    },
    { immediate: true }
  )

  const agentTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'chat', label: 'Chat' },
    { value: 'analysis', label: 'Analysis' },
    { value: 'automation', label: 'Automation' },
    { value: 'custom', label: 'Custom' }
  ]

  const models = [
    { value: 'all', label: 'All Models' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' }
  ]

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const filteredAgents = (agents || []).filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (agent.description && agent.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesType = selectedType === 'all' || agent.agent_type === selectedType
    const matchesModel = selectedModel === 'all' || (agent.model_config?.model) === selectedModel
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'active' && agent.is_active) ||
                         (selectedStatus === 'inactive' && !agent.is_active)
    return matchesSearch && matchesType && matchesModel && matchesStatus
  })

  console.log('AIAgentsPage - agents:', agents)
  console.log('AIAgentsPage - filteredAgents:', filteredAgents)

  // Helper functions
  const getAgentBadgeColor = (agentType: string) => {
    switch (agentType) {
      case 'chat':
        return 'bg-accent-blue/10 text-accent-blue'
      case 'analysis':
        return 'bg-green-100 text-green-800'
      case 'automation':
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

  const handleRowClick = (agent: AIAgent) => {
    navigate(`/spine-framework/admin/configs/ai-agents/${agent.id}`)
  }

  // Sort agents
  const sortedAgents = [...(filteredAgents || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof AIAgent]
    let bValue: any = b[sortKey as keyof AIAgent]
    
    if (sortKey === 'model_config') {
      aValue = a.model_config?.model || ''
      bValue = b.model_config?.model || ''
    }
    
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
      title: 'Total Agents',
      value: agents?.length || 0,
      icon: Cpu,
      iconColor: 'text-blue-500'
    },
    {
      title: 'Active',
      value: (agents || []).filter(a => a.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Executions Today',
      value: '24',
      icon: Clock,
      iconColor: 'text-orange-500'
    }
  ]

  const filters = [
    {
      label: 'Type',
      value: selectedType,
      options: agentTypes,
      onChange: setSelectedType
    },
    {
      label: 'Model',
      value: selectedModel,
      options: models,
      onChange: setSelectedModel
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
      title="AI Agents"
      description="Manage AI agents and their configurations"
      newButtonText="New Agent"
      newButtonHref="/spine-framework/admin/configs/ai-agents/new"
      statsCards={statsCards}
      searchPlaceholder="Search agents..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      emptyMessage="No AI agents found"
      emptyIcon={Cpu}
    >
      {sortedAgents.length === 0 ? (
        <div className="p-8 text-center">
          <Cpu className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-2 text-sm font-medium text-slate-900">No agents found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableTableHeader
                title="Agent"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Type"
                sortKey="agent_type"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Model"
                sortKey="model_config"
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
            {sortedAgents.map((agent) => (
              <tr 
                key={agent.id} 
                className="hover:bg-slate-50 cursor-pointer transition-colors"
                onClick={() => handleRowClick(agent)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="font-medium text-slate-900">
                      <span className="text-accent-blue hover:text-navy">
                        {agent.name}
                      </span>
                    </div>
                    {agent.description && (
                      <div className="text-sm text-slate-500">{agent.description}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={getAgentBadgeColor(agent.agent_type) as any}>
                    {agent.agent_type}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant="default">
                    {agent.model_config?.model || 'Unknown'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge variant={getStatusBadgeColor(agent.is_active) as any}>
                    {agent.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDateTime(agent.created_at)}
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
