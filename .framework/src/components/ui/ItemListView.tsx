/**
 * @module src/components/ui/ItemListView
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Switchable item view widget and page shell.
 *
 * **`ItemListView`** — renders items in either a compact `ItemGrid` or a
 * full `DataTable` view, toggled by icon buttons. Derives unique type
 * filter options from the items array and builds a fixed table column
 * set. The primary display field is resolved from the first `text` or
 * `textarea` field in the item type's `design_schema`.
 *
 * **`ItemListPage`** — wraps `ItemListView` with a page-level title and
 * description header. Use as a standalone page component.
 *
 * @seeAlso src/components/ui/ItemCard.tsx
 * @seeAlso src/components/ui/DataTable.tsx
 * @seeAlso src/types/types.ts (Item, ItemType)
 */

import React, { useState } from 'react'
import { Item, ItemType } from '../../types/types'
import { DataTable } from './DataTable'
import { ItemCard, ItemGrid } from './ItemCard'
import { Badge } from './badge'
import { Button } from './button'
import { Squares2X2Icon, List, Plus } from 'lucide-react';
import { formatDateTime } from '../../lib/utils'

/**
 * Props for `ItemListView`.
 *
 * @prop items - Typed item array with resolved `item_type`
 * @prop loading - Shows spinner while fetching
 * @prop onEdit / onDelete / onView - Row/card action callbacks
 * @prop onCreate - Create button callback
 * @prop searchable - Enables search in table view (default: `true`)
 * @prop filterable - Enables column filters in table view (default: `true`)
 * @prop emptyMessage - Empty-state label
 * @prop showCreateButton - Shows the create button (default: `true`)
 * @prop createButtonText - Create button label (default: `'Create Item'`)
 */
interface ItemListViewProps {
  items: (Item & { item_type: ItemType })[]
  loading?: boolean
  onEdit?: (item: Item) => void
  onDelete?: (item: Item) => void
  onView?: (item: Item) => void
  onCreate?: () => void
  searchable?: boolean
  filterable?: boolean
  emptyMessage?: string
  showCreateButton?: boolean
  createButtonText?: string
}

/**
 * Switchable grid/table item view.
 *
 * @param props - `ItemListViewProps`
 * @returns Header with view-mode toggle + `ItemGrid` or `DataTable`
 * @sideEffects none (delegates actions and creation to prop callbacks)
 */
export function ItemListView({
  items,
  loading = false,
  onEdit,
  onDelete,
  onView,
  onCreate,
  searchable = true,
  filterable = true,
  emptyMessage = 'No items found',
  showCreateButton = true,
  createButtonText = 'Create Item'
}: ItemListViewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Get unique types for filtering
  const typesMap = new Map<string, ItemType>()
  items.forEach(item => {
    typesMap.set(item.item_type.id, item.item_type)
  })
  const types = Array.from(typesMap.values()).map(type => ({
    value: type.id,
    label: type.name
  }))

  // Table columns
  const tableColumns = [
    {
      key: 'data' as const,
      title: 'Item',
      sortable: true,
      render: (value: Record<string, any>, item: Item & { item_type: ItemType }) => {
        const primaryField = item.item_type.design_schema?.fields ? Object.entries(item.item_type.design_schema.fields).find(([_, f]: [string, any]) => 
          f.data_type === 'text' || f.data_type === 'textarea'
        ) : null
        const fieldEntry = primaryField ? primaryField : null
        const fieldName = fieldEntry ? fieldEntry[0] : 'name'
        const displayValue = value[fieldName] || 'Untitled Item'
        
        return (
          <div>
            <div className="font-medium text-slate-900">{displayValue}</div>
            <div className="text-sm text-slate-500">
              <Badge variant={item.item_type.is_active ? 'success' : 'default'}>
                {item.item_type.name}
              </Badge>
            </div>
          </div>
        )
      }
    },
    {
      key: 'item_type' as const,
      title: 'Type',
      filterable: true,
      filterOptions: types,
      render: (value: ItemType) => (
        <Badge variant={value.is_active ? 'success' : 'default'}>
          {value.name}
        </Badge>
      )
    },
    {
      key: 'created_at' as const,
      title: 'Created',
      sortable: true,
      render: (value: string) => formatDateTime(value)
    },
    {
      key: 'updated_at' as const,
      title: 'Updated',
      sortable: true,
      render: (value: string) => formatDateTime(value)
    },
    {
      key: 'id' as const,
      title: 'Actions',
      render: (_: any, item: Item & { item_type: ItemType }) => (
        <div className="flex items-center space-x-2">
          {onView && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(item)}
            >
              View
            </Button>
          )}
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(item)}
            >
              Edit
            </Button>
          )}
        </div>
      )
    }
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-lg font-medium text-slate-900">
            Items ({items.length})
          </h2>
          
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                }
              `}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {showCreateButton && onCreate && (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {createButtonText}
          </Button>
        )}
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <ItemGrid
          items={items}
          loading={loading}
          onEdit={onEdit}
          onDelete={onDelete}
          onView={onView}
          compact={true}
          emptyMessage={emptyMessage}
        />
      ) : (
        <DataTable
          data={items}
          columns={tableColumns as any}
          loading={loading}
          searchable={searchable}
          filterable={filterable}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  )
}

/**
 * Props for `ItemListPage`.
 *
 * @prop title - Page heading (default: `'Items'`)
 * @prop description - Page subtitle (default: `'Manage and organize your items'`)
 * (other props same as `ItemListViewProps`)
 */
interface ItemListPageProps {
  items: (Item & { item_type: ItemType })[]
  loading?: boolean
  onEdit?: (item: Item) => void
  onDelete?: (item: Item) => void
  onView?: (item: Item) => void
  onCreate?: () => void
  searchable?: boolean
  filterable?: boolean
  emptyMessage?: string
  showCreateButton?: boolean
  createButtonText?: string
  title?: string
  description?: string
}

/**
 * Full item list page with title header and switchable view.
 *
 * @param props - `ItemListPageProps`
 * @returns Page header + `ItemListView`
 * @sideEffects none (pure rendering)
 */
export function ItemListPage({
  items,
  loading = false,
  onEdit,
  onDelete,
  onView,
  onCreate,
  searchable = true,
  filterable = true,
  emptyMessage = 'No items found',
  showCreateButton = true,
  createButtonText = 'Create Item',
  title = 'Items',
  description = 'Manage and organize your items'
}: ItemListPageProps) {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>

      {/* Item List View */}
      <ItemListView
        items={items}
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
        onView={onView}
        onCreate={onCreate}
        searchable={searchable}
        filterable={filterable}
        emptyMessage={emptyMessage}
        showCreateButton={showCreateButton}
        createButtonText={createButtonText}
      />
    </div>
  )
}
