import React from 'react'
import { useNavigate } from 'react-router-dom'
import { EntityColumn } from '../../types/types'
import { formatDateTime } from '../../lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import * as Icons from 'lucide-react'

interface DataTableProps {
  columns: EntityColumn[]
  data: any[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  sort: { field: string; direction: 'asc' | 'desc' }
  onSort: (sort: { field: string; direction: 'asc' | 'desc' }) => void
  entity: string
  emptyMessage: string
  emptyIcon: string
}

export function DataTable({ 
  columns, 
  data, 
  loading, 
  error, 
  onRetry,
  sort,
  onSort,
  entity,
  emptyMessage,
  emptyIcon 
}: DataTableProps) {
  const navigate = useNavigate()
  const EmptyIconComponent = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[emptyIcon] || Icons.Box
  
  const handleSort = (key: string) => {
    if (sort.field === key) {
      onSort({ 
        field: key, 
        direction: sort.direction === 'asc' ? 'desc' : 'asc' 
      })
    } else {
      onSort({ field: key, direction: 'asc' })
    }
  }
  
  const getSortIcon = (key: string) => {
    if (sort.field !== key) {
      return <Icons.ArrowUpDown className="h-4 w-4 text-muted-foreground" />
    }
    return sort.direction === 'asc' 
      ? <Icons.ArrowUp className="h-4 w-4 text-primary" />
      : <Icons.ArrowDown className="h-4 w-4 text-primary" />
  }
  
  const renderCell = (column: EntityColumn, row: any) => {
    const value = column.key.includes('.')
      ? column.key.split('.').reduce((obj, k) => obj?.[k], row)
      : row[column.key]
    
    if (column.type === 'timestamp' && value) {
      return formatDateTime(value)
    }
    
    if (column.type === 'badge' && column.badgeColors) {
      const colorClass = column.badgeColors[value?.toString()] || 'bg-muted text-muted-foreground'
      return (
        <Badge variant="secondary" className={colorClass}>
          {value?.toString() || 'Unknown'}
        </Badge>
      )
    }
    
    if (column.maxLength && typeof value === 'string' && value.length > column.maxLength) {
      return value.substring(0, column.maxLength) + '...'
    }
    
    return value?.toString() || '-'
  }
  
  const handleRowClick = (row: any) => {
    navigate(`/spine-framework/admin/runtime/${entity}/${row.id}`)
  }
  
  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    )
  }
  
  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive">Error: {error}</p>
          {onRetry && (
            <Button onClick={onRetry} variant="outline" className="mt-4">
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }
  
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <EmptyIconComponent className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium text-foreground">{emptyMessage}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or create a new record
          </p>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead 
                key={column.key}
                className={column.sortable ? 'cursor-pointer' : ''}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-1">
                  {column.label}
                  {column.sortable && getSortIcon(column.key)}
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => handleRowClick(row)}
            >
              {columns.map((column) => (
                <TableCell key={column.key}>
                  {renderCell(column, row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
