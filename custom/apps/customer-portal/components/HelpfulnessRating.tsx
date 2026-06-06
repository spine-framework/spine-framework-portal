import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@core/components/ui/button'

interface HelpfulnessRatingProps {
  helpfulCount: number
  notHelpfulCount: number
  onVote?: (helpful: boolean) => void
}

export function HelpfulnessRating({ helpfulCount, notHelpfulCount, onVote }: HelpfulnessRatingProps) {
  const [hasVoted, setHasVoted] = useState(false)
  const [voteType, setVoteType] = useState<'helpful' | 'not-helpful' | null>(null)

  const handleVote = (helpful: boolean) => {
    if (hasVoted) return
    setHasVoted(true)
    setVoteType(helpful ? 'helpful' : 'not-helpful')
    onVote?.(helpful)
  }

  const totalVotes = helpfulCount + notHelpfulCount
  const helpfulPercentage = totalVotes > 0 ? Math.round((helpfulCount / totalVotes) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant={voteType === 'helpful' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleVote(true)}
          disabled={hasVoted}
          className="gap-1.5"
        >
          <ThumbsUp size={13} /> Helpful
        </Button>

        <Button
          variant={voteType === 'not-helpful' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleVote(false)}
          disabled={hasVoted}
          className="gap-1.5"
        >
          <ThumbsDown size={13} /> Not Helpful
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="font-medium">{helpfulPercentage}%</span> found this helpful
        <span className="ml-1 opacity-60">({totalVotes} votes)</span>
      </div>

      {hasVoted && (
        <span className="text-xs text-muted-foreground">Thanks for your feedback!</span>
      )}
    </div>
  )
}
