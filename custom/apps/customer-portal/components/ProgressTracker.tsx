import { useState } from 'react'
import { CheckCircle, Circle } from 'lucide-react'
import { Button } from '@core/components/ui/button'

interface ProgressTrackerProps {
  sequence?: number
  onComplete?: () => void
  completed?: boolean
}

export function ProgressTracker({ sequence, onComplete, completed = false }: ProgressTrackerProps) {
  const [isCompleted, setIsCompleted] = useState(completed)

  const handleComplete = () => {
    if (isCompleted) return
    setIsCompleted(true)
    onComplete?.()
  }

  return (
    <div className="flex items-center gap-3">
      {sequence && (
        <span className="text-sm text-muted-foreground">Lesson {sequence}</span>
      )}

      <Button
        variant={isCompleted ? 'default' : 'outline'}
        size="sm"
        onClick={handleComplete}
        disabled={isCompleted}
        className="gap-1.5"
      >
        {isCompleted ? <><CheckCircle size={13} /> Completed</> : <><Circle size={13} /> Mark Complete</>}
      </Button>

      {isCompleted && (
        <span className="text-xs text-muted-foreground">Progress saved!</span>
      )}
    </div>
  )
}
