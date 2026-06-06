/**
 * @module src/components/ui/DataTable
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Higher-level table wrapper that adds search, column filters, active-filter
 * chips, and pagination using shadcn/ui table primitives.
 *
 * **Search:** when `searchable=true`, renders a text input that calls
 * `onSearch` on each keystroke and shows an active chip while a query
 * is present.
 *
 * **Column filters:** columns with `filterable=true` and `filterOptions`
 * appear in an expandable filter panel as `<select>` dropdowns. Active
 * filter chips are shown above the table; each chip has an inline
 * dismiss button.
 *
 * **Pagination:** built-in pagination controls using shadcn Button components.
 *
 * @seeAlso src/components/ui/table.tsx
 * @seeAlso src/lib/utils.ts (cn)
 */

import React, { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
import { Badge } from './badge'
import { Button } from './button'
import { Search, Filter } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Column definition for DataTable
 */
interface TableColumn<T> {
  key: keyof T | string
  title: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
}

/**
 * Extends `TableColumn<T>` with column-level filter support.
 */
interface DataTableColumn<T> extends TableColumn<T> {
  filterable?: boolean
  filterOptions?: Array<{ value: string; label: string }>
}

/**
 * Props for `DataTable<T>`.
 *
 * @prop data - Row data array
 * @prop columns - Column descriptors (may include filter config)
 * @prop loading - Shows spinner while true
 * @prop searchable - Shows search input (default: `true`)
 * @prop searchPlaceholder - Placeholder text for the search input
 * @prop filterable - Shows the filter toggle button (default: `true`)
 * @prop pagination - Pagination config; omit to hide pagination
 * @prop onSort / sortColumn / sortDirection - Sort state and callback
 * @prop onRowClick - Row click callback
 * @prop onSearch - Callback invoked with the current search query
 * @prop onFilter - Callback invoked with the active filter map
 * @prop emptyMessage - Empty-state text
 */
interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  loading?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  filterable?: boolean
  pagination?: {
    currentPage: number
    totalPages: number
    totalItems: number
    itemsPerPage: number
    onPageChange: (page: number) => void
    onItemsPerPageChange: (itemsPerPage: number) => void
  }
  onSort?: (column: keyof T, direction: 'asc' | 'desc') => void
  sortColumn?: keyof T
  sortDirection?: 'asc' | 'desc'
  onRowClick?: (item: T) => void
  onSearch?: (query: string) => void
  onFilter?: (filters: Record<string, any>) => void
  emptyMessage?: string
  className?: string
}

/**
 * Full-featured data table with search, filters, sort, and pagination.
 *
 * @param props - `DataTableProps<T>`
 * @returns Search/filter bar + `Table` + optional `TablePagination`
 * @sideEffects none (all state changes delegated to callbacks)
 */
export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  loading = false,
  searchable = true,
  searchPlaceholder = 'Search...',
  filterable = true,
  pagination,
  onSort,
  sortColumn,
  sortDirection,
  onRowClick,
  onSearch,
  onFilter,
  emptyMessage = 'No data available',
  className
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [showFilters, setShowFilters] = useState(false)

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    onSearch?.(query)
  }

  const handleFilter = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value }
    if (value === '' || value === null || value === undefined) {
      delete newFilters[key]
    }
    setFilters(newFilters)
    onFilter?.(newFilters)
  }

  const clearFilters = () => {
    setFilters({})
    onFilter?.({})
  }

  const hasActiveFilters = Object.keys(filters).length > 0
  const hasActiveSearch = searchQuery.length > 0

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search and Filters */}
      {(searchable || filterable) && (
        <div className="bg-card shadow rounded-lg p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            {searchable && (
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-input rounded-md focus:ring-ring focus:border-ring"
                  />
                </div>
              </div>
            )}

            {/* Filters */}
            {filterable && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn(
                    hasActiveFilters && 'bg-primary/10 border-primary text-primary'
                  )}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                  {hasActiveFilters && (
                    <Badge variant="info">
                      {Object.keys(filters).length}
                    </Badge>
                  )}
                </Button>

                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Advanced Filters */}
          {showFilters && filterable && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {columns
                  .filter(column => column.filterable && column.filterOptions)
                  .map((column) => (
                    <div key={String(column.key)}>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        {column.title}
                      </label>
                      <select
                        value={filters[String(column.key)] || ''}
                        onChange={(e) => handleFilter(String(column.key), e.target.value || null)}
                        className="w-full px-3 py-2 border border-input rounded-md focus:ring-ring focus:border-ring"
                      >
                        <option value="">All</option>
                        {column.filterOptions?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active filters display */}
      {(hasActiveFilters || hasActiveSearch) && (
        <div className="flex flex-wrap gap-2">
          {hasActiveSearch && (
            <Badge variant="info" className="flex items-center">
              Search: "{searchQuery}"
              <button
                onClick={() => handleSearch('')}
                className="ml-1 text-primary hover:text-primary/80"
              >
                ×
              </button>
            </Badge>
          )}
          
          {Object.entries(filters).map(([key, value]) => {
            const column = columns.find(col => String(col.key) === key)
            const option = column?.filterOptions?.find(opt => opt.value === value)
            
            return (
              <Badge key={key} variant="info" className="flex items-center">
                {column?.title}: {option?.label || value}
                <button
                  onClick={() => handleFilter(key, null)}
                  className="ml-1 text-primary hover:text-primary/80"
                >
                  ×
                </button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={String(column.key)} className={column.sortable ? 'cursor-pointer' : ''}>
                  {column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow
                  key={index}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {columns.map((column) => (
                    <TableCell key={String(column.key)}>
                      {column.render
                        ? column.render(row)
                        : String(row[column.key as keyof T] ?? '')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.currentPage - 1) * pagination.itemsPerPage + 1} to{' '}
            {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
            {pagination.totalItems} entries
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage <= 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
