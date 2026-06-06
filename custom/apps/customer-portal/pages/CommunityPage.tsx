import { useState } from 'react'
import { Plus, Send, Users, Hash, MessageSquarePlus } from 'lucide-react'
import { useCommunityPosts, useCreatePost, type CommunityPost } from '../hooks/useCommunity'
import { usePortalThread } from '../hooks/usePortalThreads'
import { usePortalSignal } from '../hooks/usePortalSignal'
import { SearchFilterBar } from '../components/SearchFilterBar'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Textarea } from '@core/components/ui/textarea'
import { Label } from '@core/components/ui/label'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Badge } from '@core/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@core/components/ui/dialog'

const CHANNELS = ['general', 'announcements', 'help', 'show-and-tell']
const CHANNEL_LABELS: Record<string, string> = {
  general: 'General',
  announcements: 'Announcements',
  help: 'Help',
  'show-and-tell': 'Show & Tell',
}

function ThreadPane({ post }: { post: CommunityPost }) {
  const { messages, loading, reply } = usePortalThread('items', post.id)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const { sendSignal } = usePortalSignal()

  const handleSend = async () => {
    if (!replyText.trim()) return
    setSending(true)
    try {
      await reply(replyText.trim())
      setReplyText('')
      sendSignal('community_reply', 'Replied to community thread')
    }
    catch (e: any) { console.error(e) }
    finally { setSending(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold">{post.title}</h3>
        {post.description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{post.description}</p>
        )}
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {loading && <div className="space-y-2"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-10 w-1/2 ml-auto" /></div>}
          {!loading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">No replies yet. Be the first to respond.</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-sm rounded-lg px-3 py-2 text-sm ${
                msg.direction === 'inbound'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground border border-border'
              }`}>{msg.content}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-3 flex gap-2 shrink-0">
        <Input placeholder="Reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()} className="flex-1" />
        <Button size="icon" onClick={handleSend} disabled={sending || !replyText.trim()}><Send size={14} /></Button>
      </div>
    </div>
  )
}

function NewPostDialog({ open, onOpenChange, onCreated, defaultChannel }: {
  open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void; defaultChannel: string
}) {
  const { createPost, loading } = useCreatePost()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [channel, setChannel] = useState(defaultChannel)
  const { sendSignal } = usePortalSignal()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createPost({ title, description, data: { channel } })
    sendSignal('community_post_create', `Created community post: ${title}`)
    onCreated(); onOpenChange(false); setTitle(''); setDescription('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New Discussion</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="post-title">Title</Label>
            <Input id="post-title" placeholder="What's your question or topic?"
              value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="post-body">Details</Label>
            <Textarea id="post-body" placeholder="Add more context…" rows={4}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !title.trim()}>{loading ? 'Posting…' : 'Post'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CommunityPage() {
  const [search, setSearch] = useState('')
  const [activeChannel, setActiveChannel] = useState('general')
  const [selected, setSelected] = useState<CommunityPost | null>(null)
  const [showNew, setShowNew] = useState(false)

  const { posts, loading, refetch } = useCommunityPosts()
  const { sendSignal } = usePortalSignal()

  const channelPosts = posts.filter((p) => (p.data?.channel as string || 'general') === activeChannel)
  const filtered = channelPosts.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-full min-h-0">
      {/* Col 1 — channels sidebar */}
      <div className="w-48 shrink-0 border-r border-border bg-muted/30 flex flex-col min-h-0">
        <div className="flex items-center px-3 py-2 h-9 border-b border-border shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Channels</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {CHANNELS.map((ch) => {
            const count = posts.filter((p) => (p.data?.channel as string || 'general') === ch).length
            return (
              <button key={ch} onClick={() => { setActiveChannel(ch); setSelected(null) }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-accent/50 transition-colors ${
                  activeChannel === ch ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                <Hash size={13} className="shrink-0" />
                <span className="text-sm flex-1 truncate">{CHANNEL_LABELS[ch]}</span>
                {count > 0 && <Badge variant="secondary" className="text-xs h-4 px-1.5 min-w-4">{count}</Badge>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Col 2 — posts list */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 h-9 border-b border-border shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
            #{CHANNEL_LABELS[activeChannel]}
          </p>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowNew(true)}>
            <Plus size={13} />
          </Button>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <SearchFilterBar placeholder="Search…" value={search} onChange={setSearch} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
              <MessageSquarePlus size={28} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No discussions yet.</p>
              <Button size="sm" variant="outline" onClick={() => setShowNew(true)} className="gap-1.5">
                <Plus size={13} /> Start a discussion
              </Button>
            </div>
          ) : (
            filtered.map((post) => (
              <button key={post.id} onClick={() => { setSelected(post); sendSignal('community_post_view', `Viewed community post: ${post.title}`) }}
                className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-accent/50 transition-colors ${
                  selected?.id === post.id ? 'bg-accent border-l-2 border-l-primary' : ''
                }`}
              >
                <p className={`text-sm font-medium truncate ${selected?.id === post.id ? 'text-primary' : ''}`}>{post.title}</p>
                {post.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{post.description}</p>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Col 3 — thread */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Users size={32} className="opacity-30" />
            <p className="text-sm">Select a discussion to read replies</p>
          </div>
        ) : (
          <ThreadPane post={selected} />
        )}
      </div>

      <NewPostDialog open={showNew} onOpenChange={setShowNew} onCreated={refetch} defaultChannel={activeChannel} />
    </div>
  )
}
