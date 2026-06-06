import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Separator } from '@core/components/ui/separator'
import { GraduationCap, Plus, PlayCircle, Edit, MessageSquare } from 'lucide-react'

interface Lesson { id: string; title: string; description?: string; status?: string; data?: Record<string, any>; created_at: string }
interface Message { id: string; content: string; created_at: string; direction: string }
interface Thread { id: string }

function groupByCourse(lessons: Lesson[]): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>()
  for (const l of lessons) {
    const key = (l.data?.course_title as string) || 'General'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(l)
  }
  for (const [k, v] of map) map.set(k, [...v].sort((a, b) => ((a.data?.sequence as number) ?? 9999) - ((b.data?.sequence as number) ?? 9999)))
  return map
}

function DiscussionPanel({ lesson }: { lesson: Lesson }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/admin-data?action=list&entity=threads&target_id=${lesson.id}&limit=5`)
      .then(r => r.json()).then(j => {
        const t = (j?.data ?? j)?.[0] ?? null
        setThread(t)
        if (t) return apiFetch(`/api/admin-data?action=list&entity=messages&thread_id=${t.id}&limit=50`).then(r => r.json())
        return []
      }).then(raw => { const msgs = raw?.data ?? raw; setMessages(Array.isArray(msgs) ? msgs : []) }).catch(() => {}).finally(() => setLoading(false))
  }, [lesson.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || submitting) return

    setSubmitting(true)
    try {
      // Create thread if it doesn't exist
      let currentThread = thread
      if (!currentThread) {
        const threadResponse = await apiFetch('/api/admin-data?action=create&entity=threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: 'item',
            target_id: lesson.id,
            title: `Discussion: ${lesson.title}`,
            status: 'active'
          })
        })
        const threadResult = await threadResponse.json()
        currentThread = threadResult?.data || threadResult
        setThread(currentThread)
      }

      // Create message
      const messageResponse = await apiFetch('/api/admin-data?action=create&entity=messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_id: '8ebfdcb1-231b-4954-829f-3ef9368409ba', // message type ID
          thread_id: currentThread.id,
          content: newMessage.trim(),
          direction: 'inbound',
          sequence: messages.length + 1
        })
      })
      const messageResult = await messageResponse.json()
      const newMsg = messageResult?.data || messageResult

      // Add to local state
      setMessages(prev => [...prev, newMsg])
      setNewMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-border" style={{ maxHeight: '300px' }}>
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Discussion ({messages.length})</p>
      </div>
      <ScrollArea style={{ maxHeight: '200px' }}>
        <div className="px-4 py-2 space-y-2">
          {loading && <Skeleton className="h-8 w-full" />}
          {!loading && messages.length === 0 && <p className="text-xs text-muted-foreground italic py-2">No discussion yet.</p>}
          {messages.map(msg => (
            <div key={msg.id || `msg-${Math.random()}`} className="text-xs border border-border rounded p-2 bg-muted/30">
              <p>{msg.content}</p>
              <p className="text-muted-foreground mt-1">{msg.created_at ? new Date(msg.created_at).toLocaleString() : 'Just now'}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="px-4 py-3 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 text-xs border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || submitting}
            className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CoursesPage() {
  const navigate = useNavigate()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [selected, setSelected] = useState<Lesson | null>(null)

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=course_lesson&limit=500')
      .then(r => r.json()).then(j => setLessons(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [])).catch(() => setLessons([])).finally(() => setLoading(false))
  }, [])

  const courseMap = groupByCourse(lessons)
  const courseNames = Array.from(courseMap.keys()).filter(c => !search || c.toLowerCase().includes(search.toLowerCase()))
  const chaptersForCourse = selectedCourse ? courseMap.get(selectedCourse) ?? [] : []

  return (
    <div className="flex h-full min-h-0">
      <div className="w-48 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Courses</p>
        </div>
        <div className="px-3 py-2 border-b border-border shrink-0">
          <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="h-7 text-xs" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : courseNames.length === 0 ? <div className="p-4 text-sm text-muted-foreground text-center">No courses.</div>
            : courseNames.map(name => (
              <button key={name} onClick={() => { setSelectedCourse(name); setSelected(null) }}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${selectedCourse === name ? 'bg-accent border-l-2 border-l-primary' : ''}`}>
                <p className={`text-sm font-medium truncate ${selectedCourse === name ? 'text-primary' : ''}`}>{name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{courseMap.get(name)?.length} lessons</p>
              </button>
            ))
          }
        </div>
      </div>

      <div className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lessons</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!selectedCourse ? <div className="p-4 text-sm text-muted-foreground">Select a course</div>
            : chaptersForCourse.length === 0 ? <div className="p-4 text-sm text-muted-foreground">No lessons.</div>
            : chaptersForCourse.map(lesson => {
              const seq = lesson.data?.sequence as number | undefined
              return (
                <button key={lesson.id} onClick={() => setSelected(lesson)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 flex items-center gap-2 transition-colors ${selected?.id === lesson.id ? 'bg-accent border-l-2 border-l-primary' : ''}`}>
                  <PlayCircle size={14} className="text-muted-foreground shrink-0" />
                  <p className="text-sm truncate">{seq != null ? `${seq}. ` : ''}{lesson.title}</p>
                </button>
              )
            })
          }
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <GraduationCap size={32} className="opacity-30" />
            <p className="text-sm">{selectedCourse ? 'Select a lesson' : 'Select a course to get started'}</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">{selected.title}</h2>
                {selected.description && <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>}
              </div>
            </div>
            <ScrollArea className="flex-1 border-b border-border">
              <div className="px-6 py-5 max-w-2xl space-y-4">
                {selected.data?.video_url && (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border border-border">
                    <a href={selected.data.video_url as string} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground">
                      <PlayCircle size={40} /><span className="text-sm">Watch Video</span>
                    </a>
                  </div>
                )}
                {selected.data?.content && <><Separator /><div className="text-sm leading-relaxed whitespace-pre-wrap">{selected.data.content as string}</div></>}
                {!selected.data?.video_url && !selected.data?.content && <p className="text-sm text-muted-foreground italic">No content available.</p>}
              </div>
            </ScrollArea>
            <DiscussionPanel lesson={selected} />
          </>
        )}
      </div>
    </div>
  )
}
