import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'
import { 
  Plus,
  Box,
  FileText,
  Calendar,
  CheckCircle,
  MoreVertical
} from 'lucide-react'
import { Skeleton } from '../../components/ui/skeleton'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent } from '../../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { AdminListPage } from '../../components/admin/AdminListPage'
import { SortableTableHeader } from '../../components/admin/SortableTableHeader'

interface App {
  id: string
  slug: string
  name: string
  description?: string
  app_type: string
  version: string
  config: Record<string, any>
  is_active: boolean
  is_public: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  account_name: string
  item_count: number
  user_count: number
}

export function AppsPage() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [sortKey, setSortKey] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const { data: apps, loading, error, refetch } = useApi<App[]>(
    async ({ signal }: { signal?: AbortSignal }) => {
      const response = await apiFetch('/api/apps?action=list', { signal })
      if (!response.ok) throw new Error('Failed to fetch apps')
      const result = await response.json()
      return result.data || []
    },
    { immediate: true }
  )

  const appTypes = [
    { value: 'all', label: 'All Types' },
    { value: 'core', label: 'Core Apps' },
    { value: 'custom', label: 'Custom Apps' },
    { value: 'marketplace', label: 'Marketplace' }
  ]

  const filteredApps = (apps || []).filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (app.description && app.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesType = selectedType === 'all' || app.app_type === selectedType
    const matchesStatus = selectedStatus === 'all' || app.is_active === (selectedStatus === 'active')
    return matchesSearch && matchesType && matchesStatus
  })

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'core':
        return 'default'
      case 'custom':
        return 'secondary'
      case 'marketplace':
        return 'outline'
      default:
        return 'default'
    }
  }

  const getStatusBadgeVariant = (isActive: boolean, isPublic: boolean) => {
    if (!isActive) return 'secondary'
    if (isPublic) return 'default'
    return 'outline'
  }

  const getStatusText = (isActive: boolean, isPublic: boolean) => {
    if (!isActive) return 'Inactive'
    if (isPublic) return 'Public'
    return 'Private'
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const handleRowClick = (app: App) => {
    navigate(`/spine-framework/admin/configs/apps/${app.id}`)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96 mt-2" />
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-lg font-medium text-destructive">Failed to load apps</p>
          <p className="mt-2 text-sm text-muted-foreground">Error: {String(error)}</p>
          <Button onClick={refetch} variant="outline" className="mt-4">
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const sortedApps = [...(filteredApps || [])].sort((a, b) => {
    let aValue: any = a[sortKey as keyof App]
    let bValue: any = b[sortKey as keyof App]
    
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    if (typeof aValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    }
    
    if (typeof aValue === 'boolean') {
      return sortDirection === 'asc' ? (aValue ? 1 : 0) : (bValue ? 1 : 0)
    }
    
    return 0
  })

  const statsCards = [
    {
      title: 'Total Apps',
      value: (apps || []).length,
      icon: Box,
      iconColor: 'text-primary'
    },
    {
      title: 'Active Apps',
      value: (apps || []).filter(a => a.is_active).length,
      icon: CheckCircle,
      iconColor: 'text-green-500'
    },
    {
      title: 'Total Items',
      value: (apps || []).reduce((sum, app) => sum + (app.item_count || 0), 0),
      icon: FileText,
      iconColor: 'text-purple-500'
    },
    {
      title: 'Total Users',
      value: (apps || []).reduce((sum, app) => sum + (app.user_count || 0), 0),
      icon: Calendar,
      iconColor: 'text-orange-500'
    }
  ]

  const typeOptions = appTypes

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ]

  const filters = [
    {
      label: 'Type',
      value: selectedType,
      options: typeOptions,
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
      title="Apps"
      description="Manage applications and their configurations"
      newButtonText="New App"
      newButtonHref="/spine-framework/admin/configs/apps/new"
      statsCards={statsCards}
      searchPlaceholder="Search apps..."
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      filters={filters}
      loading={loading}
      error={error}
      emptyMessage="No apps found"
      emptyIcon={Box}
    >
      {sortedApps.length === 0 ? (
        <div className="p-8 text-center">
          <Box className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">No apps found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHeader
                title="App"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Type"
                sortKey="app_type"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableTableHeader
                title="Version"
                sortKey="version"
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
                title="Resources"
                sortKey="item_count"
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
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedApps.map((app) => (
              <TableRow 
                key={app.id} 
                className="cursor-pointer"
                onClick={() => handleRowClick(app)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Box className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium text-foreground">
                        {app.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {app.slug}
                      </div>
                      {app.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {app.description}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(app.app_type)}>
                    {app.app_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.version}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(app.is_active, app.is_public)}>
                    {getStatusText(app.is_active, app.is_public)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex flex-col">
                    <span>{app.item_count} items</span>
                    <span>{app.user_count} users</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(app.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </AdminListPage>
  )
}
