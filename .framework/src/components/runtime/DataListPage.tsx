import { useParams } from 'react-router-dom'
import { useListSchema } from '../../hooks/useListSchema'
import { useEntityList } from '../../hooks/useEntityList'
import { DataHeader } from './DataHeader'
import { DataStats } from './DataStats'
import { DataFilters } from './DataFilters'
import { DataTable } from './DataTable'
import { Card, CardContent } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

export function DataListPage() {
  const { entity, typeSlug } = useParams<{ entity: string; typeSlug?: string }>()
  
  const { schema, view, loading: schemaLoading, error: schemaError } = useListSchema({
    entity: entity || '',
    viewSlug: 'default_list'
  })
  
  const config = view && schema ? {
    entity: entity || '',
    typeSlug: typeSlug || undefined,
    icon: 'database',
    api: {
      endpoint: 'admin-data',
      listAction: 'list'
    },
    list: {
      defaultSort: (view as any).default_sort || { field: 'created_at', direction: 'desc' },
      stats: (view as any).stats || [],
      filters: (view as any).filters || [],
      columns: Object.entries((view as any).fields || {}).map(([key, fieldConfig]: [string, any]) => ({
        key,
        label: schema.fields[key]?.label || key,
        sortable: fieldConfig.sortable !== false,
        display_type: fieldConfig.display_type
      }))
    }
  } : null
  
  const { 
    data, 
    loading, 
    error, 
    refetch,
    filters, 
    setFilters, 
    sort, 
    setSort
  } = useEntityList(entity!, config)
  
  if (schemaLoading) {
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
        <Card>
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (schemaError || !config) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-lg font-medium text-destructive">Error</p>
          <p className="mt-2 text-sm text-muted-foreground">{schemaError || 'Failed to load entity configuration'}</p>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <div className="space-y-6">
      <DataHeader 
        title={config.entity.charAt(0).toUpperCase() + config.entity.slice(1)}
        icon={config.icon}
        description={`Manage ${config.entity}`}
        newButtonHref={`/spine-framework/admin/runtime/${entity}/new`}
      />
      
      <DataStats 
        stats={config.list.stats} 
        data={data}
        loading={loading}
      />
      
      <DataFilters 
        filters={config.list.filters}
        values={filters}
        onChange={setFilters}
        onClear={() => setFilters({})}
      />
      
      <DataTable 
        columns={config.list.columns}
        data={data}
        loading={loading}
        error={error}
        onRetry={refetch}
        sort={sort}
        onSort={setSort}
        entity={entity!}
        emptyMessage={`No ${config.entity} found`}
        emptyIcon={config.icon}
      />
    </div>
  )
}
