import { useState } from 'react'
import { PortalItem } from '../hooks/usePortalData'
import { ThreadPanel } from './ThreadPanel'
import { Button } from '@core/components/ui/button'
import { Badge } from '@core/components/ui/badge'
import { StatusBadge } from './StatusBadge'

interface UnifiedItemCardProps {
  item: PortalItem
  compact?: boolean
  onVote?: (helpful: boolean) => void
  onProgress?: () => void
  onAIResponse?: () => void
  onClick?: () => void
  showThread?: boolean
}

export function UnifiedItemCard({
  item,
  compact = false,
  onVote,
  onProgress,
  onAIResponse,
  onClick,
  showThread = false,
}: UnifiedItemCardProps) {
  const [expanded, setExpanded] = useState(false)

  const getContextIcon = (context: string) => {
    switch (context) {
      case 'support': return '🎫'
      case 'community': return '💬'
      case 'kb': return '📚'
      case 'course': return '🎓'
      default: return '📄'
    }
  }

  const renderContent = () => {
    if (compact) return null
    const text = String(item.data?.description || item.data?.summary || 'No description provided.')
    return <p className="text-sm text-muted-foreground mt-2">{text}</p>
  }

  const renderActions = () => {
    if (compact) return null
    return (
      <div className="flex items-center gap-2 mt-4">
        {item.context === 'support' && onAIResponse && (
          <Button variant="outline" size="sm" onClick={onAIResponse}>Get AI Help</Button>
        )}
        {(item.context === 'community' || item.context === 'kb') && onVote && (
          <>
            <Button variant="ghost" size="sm" onClick={() => onVote(true)}>👍 Helpful</Button>
            <Button variant="ghost" size="sm" onClick={() => onVote(false)}>👎 Not Helpful</Button>
          </>
        )}
        {item.context === 'course' && onProgress && (
          <Button variant="outline" size="sm" onClick={onProgress}>Mark Complete</Button>
        )}
        {showThread && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide' : 'Show'} Discussion
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`border border-border rounded-lg ${compact ? 'p-3' : 'p-4'} hover:shadow-sm transition-shadow cursor-pointer bg-card`}
      onClick={onClick}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-medium text-sm">{item.title}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {getContextIcon(item.context)} {item.context}
              </span>
              <StatusBadge status={item.status} />
              {item.data?.priority && (
                <Badge variant="outline" className="text-xs">
                  Priority: {String(item.data.priority)}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {renderContent()}
        {renderActions()}
      </div>

      {expanded && showThread && (
        <div className="mt-4 pt-4 border-t border-border">
          <ThreadPanel itemId={item.id} itemType="content" context="portal" />
        </div>
      )}
    </div>
  )
}
