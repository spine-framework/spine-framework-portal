import { useState } from 'react'
import { CheckCircle, Circle, Lock, Play } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Button } from '@core/components/ui/button'
import { Badge } from '@core/components/ui/badge'
import { Separator } from '@core/components/ui/separator'
import { Progress } from '@core/components/ui/progress'

interface PortalItem {
  id: string
  title: string
  status: string
  data?: Record<string, unknown>
}

interface CourseProgressProps {
  lessons: PortalItem[]
  currentLesson?: PortalItem
  onLessonComplete?: (lessonId: string) => void
  onLessonSelect?: (lessonId: string) => void
}

interface ProgressState {
  completedLessons: string[]
}

export function CourseProgress({
  lessons,
  currentLesson,
  onLessonComplete,
  onLessonSelect,
}: CourseProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({ completedLessons: [] })
  const [isExpanded, setIsExpanded] = useState(false)

  const sortedLessons = [...lessons].sort((a, b) =>
    (Number(a.data?.sequence) || 0) - (Number(b.data?.sequence) || 0)
  )

  const completedCount = progress.completedLessons.length
  const totalCount = sortedLessons.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const currentIndex = currentLesson
    ? sortedLessons.findIndex((l) => l.id === currentLesson.id)
    : -1

  const getLessonStatus = (lesson: PortalItem) => {
    if (progress.completedLessons.includes(lesson.id)) return 'completed'
    if (currentLesson?.id === lesson.id) return 'current'
    const idx = sortedLessons.findIndex((l) => l.id === lesson.id)
    if (currentIndex >= 0 && idx > currentIndex) return 'locked'
    return 'available'
  }

  const handleCompleteLesson = (lessonId: string) => {
    if (progress.completedLessons.includes(lessonId)) return
    setProgress((prev) => ({ completedLessons: [...prev.completedLessons, lessonId] }))
    onLessonComplete?.(lessonId)
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'completed') return <CheckCircle size={15} className="text-primary shrink-0" />
    if (status === 'current') return <Play size={15} className="text-primary shrink-0" />
    if (status === 'locked') return <Lock size={15} className="text-muted-foreground/40 shrink-0" />
    return <Circle size={15} className="text-muted-foreground/40 shrink-0" />
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-sm">Course Progress</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedCount} of {totalCount} lessons completed
            </p>
          </div>
          <Badge variant="secondary">{progressPct}% Complete</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Progress value={progressPct} className="h-2" />

        {currentLesson && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Lesson</p>
                <p className="text-sm font-medium mt-0.5">{currentLesson.title}</p>
                {currentLesson.data?.estimated_duration && (
                  <p className="text-xs text-muted-foreground">{String(currentLesson.data.estimated_duration)} min</p>
                )}
              </div>
              <Button
                size="sm"
                variant={progress.completedLessons.includes(currentLesson.id) ? 'secondary' : 'default'}
                onClick={() => handleCompleteLesson(currentLesson.id)}
                disabled={progress.completedLessons.includes(currentLesson.id)}
              >
                {progress.completedLessons.includes(currentLesson.id) ? 'Completed' : 'Mark Complete'}
              </Button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium">Course Curriculum</p>
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </div>

          <div className={`space-y-1.5 ${isExpanded ? '' : 'max-h-52 overflow-y-auto'}`}>
            {sortedLessons.map((lesson, index) => {
              const status = getLessonStatus(lesson)
              const accessible = status !== 'locked'
              return (
                <div
                  key={lesson.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border transition-colors ${
                    status === 'current'
                      ? 'border-primary/40 bg-primary/5'
                      : status === 'completed'
                      ? 'border-border bg-muted/30'
                      : accessible
                      ? 'border-border hover:bg-accent/50 cursor-pointer'
                      : 'border-border bg-muted/30 opacity-50'
                  }`}
                  onClick={() => accessible && onLessonSelect?.(lesson.id)}
                >
                  <StatusIcon status={status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{index + 1}. {lesson.title}</p>
                    {lesson.data?.estimated_duration && (
                      <p className="text-xs text-muted-foreground">{String(lesson.data.estimated_duration)} min</p>
                    )}
                  </div>
                  <Badge variant={status === 'completed' ? 'secondary' : status === 'current' ? 'default' : 'outline'} className="text-xs">
                    {status}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{totalCount - completedCount}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{progressPct}%</p>
            <p className="text-xs text-muted-foreground">Progress</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
