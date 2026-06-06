import { useState, useCallback } from 'react'
import { Plus, Send, X, ChevronRight, ThumbsUp, ThumbsDown, Bot, AlertCircle, CheckCircle } from 'lucide-react'
import { useTickets, useTicket, useNewTicketTriage, useTriageReply, useSubmitFeedback, useUpdateTicket } from '../hooks/useTickets'
import { usePortalThread } from '../hooks/usePortalThreads'
import { usePortalSignal } from '../hooks/usePortalSignal'
import { SearchFilterBar } from '../components/SearchFilterBar'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Separator } from '@core/components/ui/separator'

interface TicketThreadProps {
  ticketId: string
  ticketStatus?: string
  onStatusChange?: (status: string) => void
}

function AIResponseCard({ message, ticketId, messageId, onFeedback }: { 
  message: any
  ticketId: string
  messageId: string
  onFeedback: () => void
}) {
  const { submitFeedback, loading } = useSubmitFeedback()
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(message.data?.feedback || null)

  const handleFeedback = async (type: 'up' | 'down') => {
    if (loading || feedback) return
    await submitFeedback(ticketId, messageId, type)
    setFeedback(type)
    onFeedback()
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-md rounded-lg px-4 py-3 text-sm bg-muted/80 text-foreground border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Bot size={14} className="text-primary" />
          <span className="text-xs font-medium text-muted-foreground">Spine Assistant</span>
        </div>
        <div className="leading-relaxed">{message.content}</div>
        
        {!feedback && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Was this helpful?</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={() => handleFeedback('up')}
              disabled={loading}
            >
              <ThumbsUp size={12} />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={() => handleFeedback('down')}
              disabled={loading}
            >
              <ThumbsDown size={12} />
            </Button>
          </div>
        )}
        
        {feedback === 'up' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 text-xs text-green-600">
            <CheckCircle size={12} />
            <span>Thanks for the feedback!</span>
          </div>
        )}
        
        {feedback === 'down' && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 text-xs text-amber-600">
            <AlertCircle size={12} />
            <span>Escalated to our team. We&apos;ll follow up shortly.</span>
          </div>
        )}
      </div>
    </div>
  )
}

function TicketThread({ ticketId, ticketStatus, onStatusChange }: TicketThreadProps) {
  const { messages, loading, thread, refetch } = usePortalThread('items', ticketId)
  const [replyText, setReplyText] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'analyzing' | 'responded' | 'escalated'>('idle')
  const { sendReply, loading: replying } = useTriageReply()
  const { sendSignal } = usePortalSignal()

  const publicMessages = messages.filter((m: any) => m.visibility !== 'internal')

  const handleSend = async () => {
    if (!replyText.trim() || !thread?.id) return
    const text = replyText.trim()
    setReplyText('')
    setAiState('analyzing')
    try {
      const result: any = await sendReply(text, thread.id, ticketId)
      if (result.escalated) {
        setAiState('escalated')
        onStatusChange?.('human_assigned')
      } else {
        setAiState('responded')
      }
      await refetch()
      sendSignal('ticket_reply', 'Replied to support ticket')
    } catch (e: any) {
      console.error(e)
      setAiState('escalated')
    }
  }

  const handleFeedback = async () => {
    await refetch()
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {/* AI State Indicator */}
          {aiState === 'analyzing' && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
                <Bot size={14} className="animate-pulse" />
                <span>Analyzing your question…</span>
              </div>
            </div>
          )}
          
          {aiState === 'escalated' && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-full">
                <AlertCircle size={14} />
                <span>We&apos;re looking into this and will have a human response shortly</span>
              </div>
            </div>
          )}
          
              {loading && <div className="space-y-2"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-10 w-1/2 ml-auto" /></div>}
          
          {!loading && publicMessages.length === 0 && aiState === 'idle' && (
            <p className="text-sm text-muted-foreground italic text-center py-8">No messages yet. Start the conversation.</p>
          )}
          
          {publicMessages.map((msg: any) => {
            if (msg.data?.message_type === 'agent') {
              return (
                <AIResponseCard
                  key={msg.id}
                  message={msg}
                  ticketId={ticketId}
                  messageId={msg.id}
                  onFeedback={handleFeedback}
                />
              )
            }
            return (
              <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  msg.direction === 'inbound'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground border border-border'
                }`}>{msg.content}</div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
      <div className="border-t p-3 flex gap-2 shrink-0">
        <Input placeholder="Reply…" value={replyText} onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()} className="flex-1"
          disabled={aiState === 'analyzing' || replying} />
        <Button size="icon" onClick={handleSend} disabled={replying || aiState === 'analyzing' || !replyText.trim()}>
          <Send size={14} />
        </Button>
      </div>
    </div>
  )
}

// Draft ticket view: blank ticket UI, customer types first message, AI creates ticket + replies
function DraftTicketView({ onClose, onCreated }: { onClose: () => void; onCreated: (ticketId: string) => void }) {
  const { startTriage, loading } = useNewTicketTriage()
  const [message, setMessage] = useState('')
  const [aiState, setAiState] = useState<'idle' | 'analyzing' | 'done'>('idle')
  const [draftMessages, setDraftMessages] = useState<Array<{ role: 'customer' | 'ai'; content: string; escalated?: boolean }>>([]
  )
  const { sendSignal } = usePortalSignal()

  const handleSend = async () => {
    if (!message.trim() || loading || aiState === 'analyzing') return
    const text = message.trim()
    setMessage('')
    setDraftMessages([{ role: 'customer', content: text }])
    setAiState('analyzing')
    try {
      const result: any = await startTriage(text)
      const publicResponse = result.escalated
        ? "We're looking into this and will have a human response shortly."
        : result.public_response || 'Your ticket has been created and our team will be in touch.'
      setDraftMessages([
        { role: 'customer', content: text },
        { role: 'ai', content: publicResponse, escalated: result.escalated },
      ])
      setAiState('done')
      sendSignal('ticket_create', `New AI-triaged support ticket`)
      // Transition to real ticket
      setTimeout(() => onCreated(result.ticketId), 800)
    } catch (e: any) {
      setDraftMessages((prev) => [
        ...prev,
        { role: 'ai', content: "We're looking into this and will have a human response shortly.", escalated: true },
      ])
      setAiState('done')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — mirrors existing ticket header style */}
      <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground italic">New Ticket</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Describe your issue below</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}><X size={15} /></Button>
      </div>

      {/* Thread area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {draftMessages.length === 0 && (
            <p className="text-sm text-muted-foreground italic text-center py-8">Describe your issue and our AI will respond immediately.</p>
          )}

          {draftMessages.map((m, i) => {
            if (m.role === 'customer') {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-xs rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">{m.content}</div>
                </div>
              )
            }
            if (m.escalated) {
              return (
                <div key={i} className="flex justify-center py-2">
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-full border border-amber-200">
                    <AlertCircle size={14} />
                    <span>{m.content}</span>
                  </div>
                </div>
              )
            }
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-md rounded-lg px-4 py-3 text-sm bg-muted/80 text-foreground border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot size={14} className="text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">Spine Assistant</span>
                  </div>
                  <div className="leading-relaxed">{m.content}</div>
                </div>
              </div>
            )
          })}

          {aiState === 'analyzing' && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
                <Bot size={14} className="animate-pulse" />
                <span>Analyzing your question…</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Reply box */}
      <div className="border-t p-3 flex gap-2 shrink-0">
        <Input
          placeholder="Describe your issue…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={loading || aiState === 'analyzing' || aiState === 'done'}
          className="flex-1"
          autoFocus
        />
        <Button size="icon" onClick={handleSend} disabled={loading || !message.trim() || aiState !== 'idle'}>
          <Send size={14} />
        </Button>
      </div>
    </div>
  )
}

export function TicketsPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const { tickets, loading, error, refetch } = useTickets()
  const { ticket: selectedTicket } = useTicket(selectedId)
  const { updateTicket } = useUpdateTicket()

  const filtered = tickets.filter((t) => (t.title ?? '').toLowerCase().includes(search.toLowerCase()))

  const { sendSignal } = usePortalSignal()

  const handleNewTicket = () => { setSelectedId(null); setShowNew(true) }

  const handleDraftCreated = useCallback((ticketId: string) => {
    setShowNew(false)
    setSelectedId(ticketId)
    refetch()
  }, [refetch])

  const handleSelectTicket = (id: string) => {
    setSelectedId(id === selectedId ? null : id)
    setShowNew(false)
    if (id !== selectedId) sendSignal('ticket_view', 'Viewed support ticket')
  }

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!selectedId) return
    await updateTicket(selectedId, { 
      data: { 
        status: newStatus,
        aim_escalation_at: new Date().toISOString()
      } 
    })
    refetch()
  }, [selectedId, selectedTicket, updateTicket, refetch])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
        <SearchFilterBar placeholder="Search tickets…" value={search} onChange={setSearch} />
        <Button size="sm" className="gap-1.5 shrink-0" onClick={handleNewTicket}>
          <Plus size={14} /> New Ticket
        </Button>
      </div>

      {error && <div className="px-4 py-2 text-sm text-destructive border-b border-border shrink-0">{error}</div>}

      <div className="flex flex-1 min-h-0">
        {/* Col 1 — ticket list */}
        <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No tickets found.</div>
            ) : (
              filtered.map((ticket) => (
                <button key={ticket.id}
                  onClick={() => handleSelectTicket(ticket.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 flex items-center gap-3 transition-colors ${
                    selectedId === ticket.id && !showNew ? 'bg-accent border-l-2 border-l-primary' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}</p>
                  </div>
                  <StatusBadge status={ticket.data?.status || ticket.status} />
                  <ChevronRight size={14} className="text-muted-foreground/50 shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Col 2 — thread or new ticket */}
        <div className="flex-1 flex flex-col min-h-0">
          {showNew ? (
            <DraftTicketView onClose={() => setShowNew(false)} onCreated={handleDraftCreated} />
          ) : selectedId && selectedTicket ? (
            <>
              <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-sm font-semibold">{selectedTicket.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{selectedTicket.id.slice(0, 8)}…</p>
                </div>
                <StatusBadge status={selectedTicket.data?.status || selectedTicket.status} />
              </div>
              <div className="flex-1 min-h-0">
                <TicketThread 
                  ticketId={selectedId} 
                  ticketStatus={selectedTicket.data?.status || selectedTicket.status}
                  onStatusChange={handleStatusChange}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a ticket to view the conversation
            </div>
          )}
        </div>

        {/* Col 3 — ticket details (also shown during draft once AI responds) */}
        {selectedId && selectedTicket && !showNew && (
          <div className="w-72 shrink-0 border-l border-border flex flex-col min-h-0">
            <div className="flex items-center px-4 py-2 h-9 border-b border-border shrink-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Details</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
                  <p className="font-medium">{selectedTicket.title}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                  <StatusBadge status={selectedTicket.data?.status || selectedTicket.status} />
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Created</p>
                  <p className="text-muted-foreground">{selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleString() : '—'}</p>
                </div>
                {selectedTicket.description && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                      <p className="text-muted-foreground leading-relaxed">{selectedTicket.description}</p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
