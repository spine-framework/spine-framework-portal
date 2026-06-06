import React from 'react'
import { Button } from '../ui/button'
import * as Icons from 'lucide-react'

interface DataDetailHeaderProps {
  entity: string
  icon: string
  title: string
  isEditing: boolean
  isCreating: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  saving?: boolean
  deleting?: boolean
}

export function DataDetailHeader({
  entity,
  icon,
  title,
  isEditing,
  isCreating,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  saving,
  deleting
}: DataDetailHeaderProps) {
  const IconComponent = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[icon] || Icons.Box
  
  return (
    <div className="flex justify-between items-start">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <IconComponent className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {title}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">
            {isCreating ? `Create new ${entity.slice(0, -1)}` : entity}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving...' : isCreating ? 'Create' : 'Save'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onEdit}>
              <Icons.Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {onDelete && (
              <Button variant="destructive" onClick={onDelete} disabled={deleting}>
                <Icons.Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
