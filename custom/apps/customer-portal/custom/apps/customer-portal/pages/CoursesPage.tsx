import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Circle, PlayCircle, GraduationCap, Send } from 'lucide-react'
import { useCourseLessons, type CourseItem } from '../hooks/useCourses'
import { usePortalSignal } from '../hooks/usePortalSignal'
import { useItemProgress, useUpsertProgress } from '../hooks/useItemProgress'
import { usePortalThread } from '../hooks/usePortalThreads'
import { getTypeIdAsync } from '../hooks/useTypeRegistry'
import { useAuth } from '@core/contexts/AuthContext'
import { SearchFilterBar } from '../components/SearchFilterBar'
import { Button } from '@core/components/ui/button'
import { Skeleton } from '@core/components/ui/skeleton'
import { Badge } from '@core/components/ui/badge'
import { Separator } from '@core/components/ui/separator'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Progress } from '@core/components/ui/progress'
import { Textarea } from '@core/components/ui/textarea'

const PROGRESS_TYPE_SLUG = 'course_lesson_progress'
const LAST_LESSON_KEY = 'portal:last-lesson'

function groupByCourse(lessons: CourseItem[]): Map<string, CourseItem[]> {
  const map = new Map<string, CourseItem[]>()
  for (const lesson of lessons) {
    const courseKey = (lesson.data?.course_title as string) || (lesson.data?.course_id as string) || 'General'
    if (!map.has(courseKey)) map.set(courseKey, [])
    map.get(courseKey)!.push(lesson)
  }
  for (const [key, list] of map) {
    map.set(key, [...list].sort((a, b) => {
      const sa = (a.data?.sequence as number) ?? 9999
      const sb = (b.data?.sequence as number) ?? 9999
      return sa - sb
    }))
  }
  return map
}

export function CoursesPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(LAST_LESSON_KEY))
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const progressTypeIdRef = useRef<string | null>(null)

  const { lessons, loading, error } = useCourseLessons()
  const lessonIds = lessons.map((l) => l.id)
  const { progressMap, refetch: refetchProgress } = useItemProgress(user?.id ?? null, lessonIds)
  const { upsert } = useUpsertProgress()
  const { messages, reply } = usePortalThread('items', selectedId)
  const { sendSignal } = usePortalSignal()

  useEffect(() => {
    if (!selectedId || lessons.length === 0) return
    const lesson = lessons.find((l) => l.id === selectedId)
    if (lesson) {
      const key = (lesson.data?.course_title as string) || (lesson.data?.course_id as string) || 'General'
      setSelectedCourse(key)
    }
  }, [lessons, selectedId])

  useEffect(() => {
    getTypeIdAsync(PROGRESS_TYPE_SLUG).then((id) => { progressTypeIdRef.current = id })
  }, [])

  const courseMap = groupByCourse(lessons)
  const courseNames = Array.from(courseMap.keys())
  const filteredCourses = courseNames.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
  const chaptersForCourse = selectedCourse ? (courseMap.get(selectedCourse) ?? []) : []
  const selected = lessons.find((l) => l.id === selectedId) ?? null

  const getStatus = (id: string) => progressMap.get(id)?.status ?? 'not_started'

  const handleSelectLesson = async (lessonId: string) => {
    setSelectedId(lessonId)
    localStorage.setItem(LAST_LESSON_KEY, lessonId)
    const typeId = progressTypeIdRef.current
    if (!typeId || !user?.id || !user?.account_id) return
    const existing = progressMap.get(lessonId)
    if (!existing || existing.status === 'not_started') {
      await upsert({ personId: user.id, itemId: lessonId, typeId, accountId: user.account_id, status: 'in_progress' })
      refetchProgress()
      sendSignal('lesson_start', 'Started a course lesson')
    }
  }

  const handleComplete = async () => {
    if (!selectedId || !user?.id || !user?.account_id) return
    const typeId = progressTypeIdRef.current
    if (!typeId) return
    await upsert({ personId: user.id, itemId: selectedId, typeId, accountId: user.account_id, status: 'completed' })
    refetchProgress()
    sendSignal('lesson_complete', 'Completed a course lesson')
  }

  const handleReply = async () => {
    if (!replyText.trim()) return
    setReplying(true)
    try { await reply(replyText.trim()); setReplyText('') }
    finally { setReplying(false) }
  }

  const isCompleted = selectedId ? getStatus(selectedId) === 'completed' : false
  const videoUrl = selected?.data?.video_url as string | undefined
  const content = selected?.data?.content as string | undefined

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
        <SearchFilterBar placeholder="Search courses…" value={search} onChange={setSearch} />
      </div>
      {error && <div className="px-4 py-2 text-sm text-destructive border-b border-border shrink-0">{error}</div>}
      <div className="flex flex-1 min-h-0">

        {/* Col 1 — course list */}
        <div className="w-48 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-border shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Courses</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : filteredCourses.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No courses found.</div>
            ) : filteredCourses.map((courseName) => {
              const cl = courseMap.get(courseName) ?? []
              const done = cl.filter((l) => getStatus(l.id) === 'completed').length
              const pct = cl.length > 0 ? Math.round((done / cl.length) * 100) : 0
              return (
                <button key={courseName}
                  onClick={() => { setSelectedCourse(courseName); setSelectedId(null); sendSignal('course_view', `Viewed course: ${courseName}`) }}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${selectedCourse === courseName ? 'bg-accent border-l-2 border-l-primary' : ''}`}
                >
                  <p className={`text-sm font-medium truncate ${selectedCourse === courseName ? 'text-primary' : ''}`}>{courseName}</p>
                  <div className="mt-1.5 space-y-0.5">
                    <Progress value={pct} className="h-1" />
                    <p className="text-xs text-muted-foreground">{done}/{cl.length} done</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Col 2 — chapters */}
        <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-border shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chapters</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedCourse ? (
              <div className="p-4 text-sm text-muted-foreground">Select a course</div>
            ) : chaptersForCourse.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No chapters.</div>
            ) : chaptersForCourse.map((lesson) => {
              const seq = (lesson.data?.sequence as number) ?? null
              const status = getStatus(lesson.id)
              return (
                <button key={lesson.id} onClick={() => handleSelectLesson(lesson.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 flex items-center gap-2 transition-colors ${selectedId === lesson.id ? 'bg-accent border-l-2 border-l-primary' : ''}`}
                >
                  {status === 'completed'
                    ? <CheckCircle size={14} className="text-primary shrink-0" />
                    : status === 'in_progress'
                      ? <PlayCircle size={14} className="text-amber-500 shrink-0" />
                      : <Circle size={14} className="text-muted-foreground/40 shrink-0" />
                  }
                  <p className={`text-sm truncate ${selectedId === lesson.id ? 'text-primary font-medium' : ''}`}>
                    {seq != null ? `${seq}. ` : ''}{lesson.title}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Col 3 — content + discussion */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <GraduationCap size={32} className="opacity-30" />
              <p className="text-sm">{selectedCourse ? 'Select a chapter to begin' : 'Select a course to get started'}</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-base font-semibold">{selected.title}</h2>
                  {selected.description && <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {isCompleted
                    ? <Badge variant="secondary" className="gap-1"><CheckCircle size={12} /> Completed</Badge>
                    : <Button size="sm" onClick={handleComplete}>Mark Complete</Button>
                  }
                </div>
              </div>

              <ScrollArea className="flex-1 border-b border-border">
                <div className="px-6 py-5 max-w-2xl space-y-6">
                  {videoUrl && (
                    <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center border border-border">
                      <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <PlayCircle size={48} />
                        <span className="text-sm">Watch Video</span>
                      </a>
                    </div>
                  )}
                  {content && (<><Separator /><div className="text-sm leading-relaxed whitespace-pre-wrap">{content}</div></>)}
                  {!videoUrl && !content && (
                    <p className="text-sm text-muted-foreground italic">No content available for this chapter.</p>
                  )}
                </div>
              </ScrollArea>

              {/* Discussion panel */}
              <div className="shrink-0 border-t border-border flex flex-col" style={{ maxHeight: '260px' }}>
                <div className="px-4 py-2 border-b border-border shrink-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Discussion</p>
                </div>
                <ScrollArea className="flex-1 px-4 py-2">
                  {messages.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No discussion yet. Be the first to comment.</p>
                  ) : messages.map((msg) => (
                    <div key={msg.id} className="mb-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{new Date(msg.created_at).toLocaleString()}</p>
                      <p className="text-sm">{msg.content}</p>
                    </div>
                  ))}
                </ScrollArea>
                <div className="px-4 py-2 flex gap-2 shrink-0">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Add a comment…"
                    className="text-sm resize-none"
                    rows={2}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply() }}
                  />
                  <Button size="sm" onClick={handleReply} disabled={replying || !replyText.trim()} className="self-end">
                    <Send size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
