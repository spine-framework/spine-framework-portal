import { useState } from 'react'
import { Send } from 'lucide-react'
import { usePortalThreads, usePortalMessages } from '../hooks/usePortalData'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'

interface ThreadPanelProps {
  itemId: string
  itemType: string
  context: string
  collapsible?: boolean
}

export function ThreadPanel({ itemId, itemType, context, collapsible = false }: ThreadPanelProps) {
  const [expanded, setExpanded] = useState(!collapsible)
  const [newMessage, setNewMessage] = useState('')

  const { threads, loading: threadsLoading } = usePortalThreads(itemId)
  const { messages, loading: messagesLoading } = usePortalMessages(threads[0]?.id || '')

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return
    console.log('Sending message:', newMessage)
    setNewMessage('')
  }

  if (threadsLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-10 w-1/2 ml-auto" />
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No conversation yet. Be the first to start the discussion!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {collapsible && (
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Discussion</h4>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      )}

      {expanded && (
        <>
          <ScrollArea className="max-h-96">
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.direction === 'in' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg text-sm border ${
                    message.direction === 'in'
                      ? 'bg-muted text-foreground border-border'
                      : 'bg-primary text-primary-foreground border-primary'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">
                        {(message as any).author_name || (message.direction === 'in' ? 'Customer' : 'Support')}
                      </span>
                      <span className="text-xs opacity-75">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message…"
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={!newMessage.trim()} size="icon">
              <Send size={14} />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
