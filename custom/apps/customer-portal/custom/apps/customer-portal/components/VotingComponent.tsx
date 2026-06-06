import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@core/components/ui/button'

interface VotingComponentProps {
  helpfulCount: number
  notHelpfulCount?: number
  onVote?: (helpful: boolean) => void
}

export function VotingComponent({ helpfulCount, notHelpfulCount = 0, onVote }: VotingComponentProps) {
  const [hasVoted, setHasVoted] = useState(false)
  const [voteType, setVoteType] = useState<'helpful' | 'not-helpful' | null>(null)

  const handleVote = (helpful: boolean) => {
    if (hasVoted) return
    setHasVoted(true)
    setVoteType(helpful ? 'helpful' : 'not-helpful')
    onVote?.(helpful)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={voteType === 'helpful' ? 'default' : 'outline'}
        size="sm"
        onClick={() => handleVote(true)}
        disabled={hasVoted}
        className="gap-1.5"
      >
        <ThumbsUp size={13} /> Helpful {helpfulCount > 0 && `(${helpfulCount})`}
      </Button>

      {notHelpfulCount > 0 && (
        <Button
          variant={voteType === 'not-helpful' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleVote(false)}
          disabled={hasVoted}
          className="gap-1.5"
        >
          <ThumbsDown size={13} /> Not Helpful ({notHelpfulCount})
        </Button>
      )}

      {hasVoted && (
        <span className="text-xs text-muted-foreground">Thanks for your feedback!</span>
      )}
    </div>
  )
}
