import { useState, useEffect } from 'react'
import { Send, Hash, MessageSquarePlus, AlertCircle } from 'lucide-react'
import { apiFetch } from '@core/lib/api'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'

const CHANNELS = ['general', 'announcements', 'help', 'show-and-tell']
const CHANNEL_LABELS: Record<string, string> = { general: 'General', announcements: 'Announcements', help: 'Help', 'show-and-tell': 'Show & Tell' }

interface Post { id: string; title: string; description?: string; data?: Record<string, any>; created_at: string }
interface Message { id: string; content: string; direction: string; created_at: string }
interface Thread { id: string }

function ThreadPane({ post }: { post: Post }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [thread, setThread] = useState<Thread | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/admin-data?action=list&entity=threads&target_id=${post.id}&limit=5`)
      .then(r => r.json()).then(j => {
        const t = (j?.data ?? j)?.[0] ?? null
        setThread(t)
        if (t) return apiFetch(`/api/admin-data?action=list&entity=messages&thread_id=${t.id}&limit=100`).then(r => r.json())
        return []
      }).then(raw => { const msgs = raw?.data ?? raw; setMessages(Array.isArray(msgs) ? msgs : []) }).catch(() => {}).finally(() => setLoading(false))
  }, [post.id])

  const handleSend = async () => {
    if (!replyText.trim() || !thread) return
    setSending(true)
    try {
      const res = await apiFetch('/api/admin-data?action=create&entity=messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: thread.id, content: replyText.trim(), direction: 'outbound', entity: 'messages', type_slug: 'message' }),
      })
      const msg = await res.json()
      if (msg?.id) setMessages(prev => [...prev, msg])
      setReplyText('')
    } finally { setSending(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">{post.title}</h3>
        {post.description && <p className="text-sm text-muted-foreground mt-1">{post.description}</p>}
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {loading && <Skeleton className="h-10 w-2/3" />}
          {!loading && messages.length === 0 && <p className="text-sm text-muted-foreground italic text-center py-8">No replies yet.</p>}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-sm rounded-lg px-3 py-2 text-sm ${msg.direction === 'outbound' ? 'bg-primary text-primary-foreground' : 'bg-muted border border-border'}`}>{msg.content}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-3 flex gap-2 shrink-0">
        <Input placeholder="Reply as agent…" value={replyText} onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} className="flex-1" />
        <Button size="icon" onClick={handleSend} disabled={sending || !replyText.trim() || !thread}><Send size={14} /></Button>
      </div>
    </div>
  )
}

export default function CommunityPage() {
  const [activeChannel, setActiveChannel] = useState('general')
  const [selected, setSelected] = useState<Post | null>(null)
  const [search, setSearch] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=community_post&limit=500')
      .then(r => r.json()).then(j => setPosts(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [])).catch(() => setPosts([])).finally(() => setLoading(false))
  }, [])

  const channelPosts = posts.filter(p => (p.data?.channel as string || 'general') === activeChannel)
  const filtered = channelPosts.filter(p => p.title?.toLowerCase().includes(search.toLowerCase()))
  const unanswered = posts.filter(p => !p.data?.reply_count)

  return (
    <div className="flex h-full min-h-0">
      <div className="w-44 shrink-0 border-r border-border bg-muted/30 flex flex-col min-h-0">
        <div className="px-3 py-2 h-9 border-b border-border shrink-0 flex items-center">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channels</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {CHANNELS.map(ch => {
            const count = posts.filter(p => (p.data?.channel as string || 'general') === ch).length
            return (
              <button key={ch} onClick={() => { setActiveChannel(ch); setSelected(null) }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-accent/50 transition-colors ${activeChannel === ch ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'}`}>
                <Hash size={13} className="shrink-0" />
                <span className="text-sm flex-1 truncate">{CHANNEL_LABELS[ch]}</span>
                {count > 0 && <Badge variant="secondary" className="text-xs h-4 px-1.5">{count}</Badge>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center px-3 py-2 h-9 border-b border-border shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">#{CHANNEL_LABELS[activeChannel]}</p>
        </div>
        <div className="px-3 py-2 border-b border-border shrink-0">
          <Input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="h-7 text-xs" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            : filtered.length === 0 ? <div className="flex flex-col items-center justify-center gap-2 py-10 px-4 text-center"><MessageSquarePlus size={24} className="text-muted-foreground/40" /><p className="text-sm text-muted-foreground">No discussions yet.</p></div>
            : filtered.map(post => (
              <button key={post.id} onClick={() => setSelected(post)}
                className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent/50 transition-colors ${selected?.id === post.id ? 'bg-accent border-l-2 border-l-primary' : ''}`}>
                <p className="text-sm font-medium truncate">{post.title || 'Untitled'}</p>
                {post.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{post.description}</p>}
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {!selected ? <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground"><MessageSquarePlus size={32} className="opacity-30" /><p className="text-sm">Select a discussion to reply</p></div>
          : <ThreadPane post={selected} />}
      </div>

      <div className="w-52 shrink-0 border-l border-border flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Moderation</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Unanswered ({unanswered.length})</p>
            {unanswered.length === 0 && <p className="text-xs text-muted-foreground px-2 italic">All caught up.</p>}
            {unanswered.slice(0, 15).map(p => (
              <button key={p.id} onClick={() => { setActiveChannel(p.data?.channel as string || 'general'); setSelected(p) }}
                className="w-full text-left px-2 py-2 rounded hover:bg-accent/50 transition-colors">
                <p className="text-xs font-medium truncate">{p.title || 'Untitled'}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
