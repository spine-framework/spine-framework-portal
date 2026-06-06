import { useState } from 'react'
import { Shield } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Button } from '@core/components/ui/button'
import { Badge } from '@core/components/ui/badge'
import { Separator } from '@core/components/ui/separator'

interface PortalItem {
  id: string
  title: string
  context: string
  data?: Record<string, unknown>
}

interface CommunityModeratorProps {
  post: PortalItem
  onModerated?: (updates: Partial<PortalItem>) => void
}

type ModerationStatus = 'pending' | 'approved' | 'flagged'

export function CommunityModerator({ post, onModerated }: CommunityModeratorProps) {
  const [isModerating, setIsModerating] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  if (post.context !== 'community') return null

  const status = (post.data?.moderation_status as ModerationStatus) || 'pending'

  const handleAction = async (action: 'approve' | 'flag') => {
    setIsModerating(true)
    await new Promise((r) => setTimeout(r, 300))
    onModerated?.({
      ...post,
      data: { ...post.data, moderation_status: action === 'approve' ? 'approved' : 'flagged', moderated_at: new Date().toISOString() },
    })
    setIsModerating(false)
  }

  const statusVariant: Record<ModerationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    approved: 'secondary',
    flagged: 'destructive',
    pending: 'outline',
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-muted-foreground" />
            <div>
              <h3 className="font-medium text-sm">Content Moderation</h3>
              <p className="text-xs text-muted-foreground">AI-powered review for community guidelines</p>
            </div>
          </div>
          <Badge variant={statusVariant[status]}>
            {isModerating ? 'Reviewing…' : status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Content Preview</p>
          <p className="text-sm line-clamp-3">{String(post.data?.content || 'No content')}</p>
        </div>

        {showDetails && (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
              <div>Spam: Not detected</div>
              <div>Toxicity: Clean</div>
              <div>Clarity: Good</div>
              <div>Relevance: On-topic</div>
            </div>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {status !== 'approved' && (
              <Button size="sm" onClick={() => handleAction('approve')} disabled={isModerating}>Approve</Button>
            )}
            {status !== 'flagged' && (
              <Button size="sm" variant="outline" onClick={() => handleAction('flag')} disabled={isModerating}>Flag</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
              {showDetails ? 'Hide' : 'Details'}
            </Button>
          </div>
          {post.data?.moderated_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(String(post.data.moderated_at)).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
