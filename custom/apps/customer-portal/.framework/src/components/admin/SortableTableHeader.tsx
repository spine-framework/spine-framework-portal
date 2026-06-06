import React from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { TableHead } from '../ui/table'

interface SortableTableHeaderProps {
  title: string
  sortKey: string
  currentSortKey?: string
  currentSortDirection?: 'asc' | 'desc'
  onSort: (key: string) => void
}

export function SortableTableHeader({
  title,
  sortKey,
  currentSortKey,
  currentSortDirection,
  onSort,
}: SortableTableHeaderProps) {
  const isSorted = currentSortKey === sortKey
  const isAscending = currentSortDirection === 'asc'
  
  return (
    <TableHead
      className="cursor-pointer"
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        <span>{title}</span>
        {isSorted && (
          <span className="inline-flex">
            {isAscending ? (
              <ChevronUp className="h-4 w-4 text-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-foreground" />
            )}
          </span>
        )}
      </div>
    </TableHead>
  )
}
