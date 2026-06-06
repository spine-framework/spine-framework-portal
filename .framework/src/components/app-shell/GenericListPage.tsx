import { useListSchema } from '../../hooks/useListSchema'
import { useEntityList } from '../../hooks/useEntityList'
import { DataHeader } from '../runtime/DataHeader'
import { DataStats } from '../runtime/DataStats'
import { DataFilters } from '../runtime/DataFilters'
import { DataTable } from '../runtime/DataTable'

interface GenericListPageProps {
  typeSlug: string
  viewSlug?: string
  appPrefix: string
  detailPath: string
}

/**
 * Schema-driven list page for the Generic App Shell.
 * Resolves the type's design_schema and renders using the specified view
 * (or default_list if not specified).
 */
export function GenericListPage({ typeSlug, viewSlug, appPrefix, detailPath }: GenericListPageProps) {
  const resolvedViewSlug = viewSlug || 'default_list'

  // Resolve schema and view — uses the same hook as admin runtime
  const { schema, view, loading: schemaLoading, error: schemaError } = useListSchema({
    entity: 'items',
    viewSlug: resolvedViewSlug
  })

  // Build config from resolved schema + view
  const config = view && schema ? {
    entity: 'items',
    typeSlug,
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
  } = useEntityList('items', config)

  if (schemaLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-sm text-slate-500">Loading schema...</p>
      </div>
    )
  }

  if (schemaError || !config) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-medium text-red-600">Error</h2>
        <p className="mt-2 text-sm text-slate-500">{schemaError || 'Failed to load entity configuration'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DataHeader
        title={schema?.fields ? Object.keys(schema.fields).length > 0 ? (view as any)?.label || typeSlug : typeSlug : typeSlug}
        icon={config.icon}
        description={`Manage ${typeSlug}`}
        newButtonHref={`${appPrefix}/${detailPath}/new`}
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
        entity="items"
        emptyMessage={`No ${typeSlug} found`}
        emptyIcon={config.icon}
      />
    </div>
  )
}
