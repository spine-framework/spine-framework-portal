/**
 * @module src/components/ui/ItemCard
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Item display components for grid-based views.
 *
 * **`ItemCard`** — renders a single `Item` in either full (`compact=false`)
 * or compact (`compact=true`) form. Derives its display values from
 * `item.title`, `item.description`, and the first 3 entries of `item.data`.
 * Optional action buttons (`onView`, `onEdit`, `onDelete`) are shown when
 * `showActions=true`.
 *
 * **`ItemGrid`** — renders a responsive grid of `ItemCard` instances.
 * Shows a spinner on `loading=true` and an empty state with a doc icon
 * when `items` is empty.
 *
 * @seeAlso src/components/ui/ItemListView.tsx (combines with DataTable)
 * @seeAlso src/types/types.ts (Item, ItemType)
 * @seeAlso src/lib/utils.ts (formatDateTime, truncateText)
 */

import React from 'react'
import { Item, ItemType } from '../../types/types'
import { Badge } from './badge'
import { Button } from './button'
import { Box, FileText, Calendar, User, MoreVertical } from 'lucide-react';
import { formatDateTime, truncateText } from '../../lib/utils'

/**
 * Props for `ItemCard`.
 *
 * @prop item - `Item` with optional resolved `item_type` relation
 * @prop onEdit - Edit action callback
 * @prop onDelete - Delete action callback
 * @prop onView - View action callback
 * @prop showActions - Shows action buttons (default: `true`)
 * @prop compact - Condensed single-line layout (default: `false`)
 */
interface ItemCardProps {
  item: Item & { item_type?: ItemType | string }
  onEdit?: (item: Item) => void
  onDelete?: (item: Item) => void
  onView?: (item: Item) => void
  showActions?: boolean
  compact?: boolean
}

/**
 * Item card with optional action buttons.
 *
 * @param props - `ItemCardProps`
 * @returns White rounded card in full or compact layout
 * @sideEffects none (delegates actions to `onEdit` / `onDelete` / `onView`)
 */
export function ItemCard({
  item,
  onEdit,
  onDelete,
  onView,
  showActions = true,
  compact = false
}: ItemCardProps) {
  const getPrimaryValue = () => item.title || 'Untitled Item'

  const getSecondaryValue = () => {
    if (item.description) return truncateText(item.description, 100)
    return null
  }

  const getTypeIcon = () => {
    return <Box className="h-5 w-5 text-blue-500" />
  }

  const getTypeName = () => {
    if (!item.item_type) return item.item_type_slug || ''
    if (typeof item.item_type === 'string') return item.item_type
    return (item.item_type as ItemType).name || ''
  }

  const getTypeBadgeColor = () => {
    if (!item.item_type || typeof item.item_type === 'string') return 'info'
    return (item.item_type as ItemType).is_active ? 'success' : 'default'
  }

  if (compact) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <div className="flex-shrink-0">
              {getTypeIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-medium text-slate-900 truncate">
                  {getPrimaryValue()}
                </h3>
                <Badge variant={getTypeBadgeColor()}>
                  {getTypeName()}
                </Badge>
              </div>
              {getSecondaryValue() && (
                <p className="text-xs text-slate-500 mt-1">
                  {getSecondaryValue()}
                </p>
              )}
              <div className="flex items-center space-x-4 mt-2 text-xs text-slate-500">
                <span>Updated {formatDateTime(item.updated_at)}</span>
              </div>
            </div>
          </div>
          
          {showActions && (
            <div className="flex items-center space-x-1">
              {onView && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView(item)}
                >
                  View
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4 flex-1">
          <div className="flex-shrink-0">
            {getTypeIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-2">
              <h3 className="text-lg font-medium text-slate-900 truncate">
                {getPrimaryValue()}
              </h3>
              <Badge variant={getTypeBadgeColor()}>
                {getTypeName()}
              </Badge>
            </div>
            
            {getSecondaryValue() && (
              <p className="text-sm text-slate-600 mb-3">
                {getSecondaryValue()}
              </p>
            )}

            {/* Additional data fields */}
            {Object.keys(item.data || {}).length > 0 && (
              <div className="space-y-2 mb-4">
                {Object.entries(item.data)
                  .filter(([, v]) => v !== undefined && v !== null && v !== '')
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-slate-500">{key}:</span>
                      <span className="text-xs text-slate-900">
                        {truncateText(typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value), 50)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <Calendar className="h-3 w-3 mr-1" />
                  Created {formatDateTime(item.created_at)}
                </span>
                <span className="flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  ID: {item.id.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {showActions && (
          <div className="flex items-center space-x-2 ml-4">
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
            <Button
              variant="ghost"
              size="sm"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Props for `ItemGrid`.
 *
 * @prop items - Typed item array with resolved `item_type`
 * @prop loading - Shows spinner while true
 * @prop compact - Passes compact mode to each `ItemCard`
 * @prop emptyMessage - Text shown when `items` is empty
 */
interface ItemGridProps {
  items: (Item & { item_type: ItemType })[]
  loading?: boolean
  onEdit?: (item: Item) => void
  onDelete?: (item: Item) => void
  onView?: (item: Item) => void
  compact?: boolean
  emptyMessage?: string
}

/**
 * Responsive card grid for items.
 *
 * @param props - `ItemGridProps`
 * @returns Responsive grid, loading spinner, or empty state
 * @sideEffects none (delegates actions to `onEdit` / `onDelete` / `onView`)
 */
export function ItemGrid({
  items,
  loading = false,
  onEdit,
  onDelete,
  onView,
  compact = false,
  emptyMessage = 'No items found'
}: ItemGridProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-2 text-sm font-medium text-slate-900">{emptyMessage}</h3>
      </div>
    )
  }

  return (
    <div className={compact 
      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    }>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onView={onView}
          compact={compact}
        />
      ))}
    </div>
  )
}
