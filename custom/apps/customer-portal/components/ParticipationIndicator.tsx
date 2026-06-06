import { MessageCircle } from 'lucide-react'

interface ParticipationIndicatorProps {
  hasParticipation: boolean
  hasUnread?: boolean
  size?: 'sm' | 'md'
}

export function ParticipationIndicator({ hasParticipation, hasUnread = false, size = 'sm' }: ParticipationIndicatorProps) {
  if (!hasParticipation && !hasUnread) return null

  return (
    <span className="relative inline-flex items-center">
      <MessageCircle
        size={size === 'sm' ? 13 : 15}
        className={hasParticipation ? 'text-primary' : 'text-muted-foreground/30'}
      />
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full" />
      )}
    </span>
  )
}
