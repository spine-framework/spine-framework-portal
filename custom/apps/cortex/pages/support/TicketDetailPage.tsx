import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@core/components/ui/tabs'
import { ArrowLeft, Send, Lock, Globe, Bot, CheckCircle, AlertCircle, FileText, Building2, CreditCard, Package, BookOpen, Eye, EyeOff, Brain, Clock, TrendingUp, Tag as TagIcon } from 'lucide-react'
import { useAuth } from '@core/contexts/AuthContext'

interface Ticket { 
  id: string; 
  title: string; 
  status?: string; 
  description?: string; 
  created_at: string;
  account_id?: string;
  data?: {
    status?: string;
    aim_confidence_threshold?: number;
    aim_confidence_at_response?: number;
    aim_escalation_reason?: string;
    aim_problem_statement?: string;
    aim_solution_path?: string;
    aim_tools_used?: string[];
    ca_reported_issue?: string;
    ca_true_problem?: string;
    ca_diagnostic_steps?: string[];
    ca_solution_steps?: string[];
    ca_final_solution?: string;
    ca_customer_temperature?: string;
    ca_time_to_resolution?: number;
    ca_escalation_required?: boolean;
    ca_back_and_forth_count?: number;
    ca_sentiment_progression?: string[];
    ca_automation_potential?: string;
    ca_kb_candidate?: boolean;
    ca_analysis_tags?: string[];
    kb_approved_at?: string;
    kb_approved_by?: string;
    kb_human_edits?: string;
    kb_proposed_kb_id?: string;
    kb_redacted_draft?: string;
  };
}
interface Message { 
  id: string; 
  content: string; 
  direction: 'inbound' | 'outbound'; 
  visibility?: 'external' | 'internal';
  sender_type?: 'human' | 'agent' | 'system';
  created_at: string;
}
interface Thread { id: string; visibility?: string }
interface Account { 
  id: string; 
  name: string; 
  data?: { 
    tier?: string; 
    contract_value?: number;
    billing_status?: string;
    mrr?: number;
  } 
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  to_customer: 'bg-cyan-100 text-cyan-700',
  ai_responding: 'bg-purple-100 text-purple-700',
  human_assigned: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-muted text-muted-foreground',
}

// Merged Thread Panel - combines internal and external messages
function MergedThreadPanel({ 
  ticketId, 
  externalThread, 
  internalThread 
}: { 
  ticketId: string
  externalThread: Thread | null
  internalThread: Thread | null
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [replyType, setReplyType] = useState<'external' | 'internal'>('external')
  const [sending, setSending] = useState(false)

  // Load messages from both threads and merge them
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true)
      const allMessages: Message[] = []

      if (externalThread?.id) {
        try {
          const ext = await apiFetch(`/api/admin-data?action=list&entity=messages&thread_id=${externalThread.id}&limit=100`).then(r => r.json())
          const extMsgs = Array.isArray(ext?.data) ? ext.data : Array.isArray(ext) ? ext : []
          allMessages.push(...extMsgs.map((m: Message) => ({ ...m, visibility: 'external' })))
        } catch { /* ignore */ }
      }

      if (internalThread?.id) {
        try {
          const int = await apiFetch(`/api/admin-data?action=list&entity=messages&thread_id=${internalThread.id}&limit=100`).then(r => r.json())
          const intMsgs = Array.isArray(int?.data) ? int.data : Array.isArray(int) ? int : []
          allMessages.push(...intMsgs.map((m: Message) => ({ ...m, visibility: 'internal' })))
        } catch { /* ignore */ }
      }

      // Sort by creation time
      allMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setMessages(allMessages)
      setLoading(false)
    }

    loadMessages()
  }, [externalThread?.id, internalThread?.id])

  const handleSend = async () => {
    if (!reply.trim()) return
    let targetThread = replyType === 'external' ? externalThread : internalThread

    setSending(true)
    try {
      // Create internal thread if it doesn't exist
      if (!targetThread && replyType === 'internal') {
        const threadTypesRes = await apiFetch('/api/types?kind=thread&limit=1').then(r => r.json())
        const threadTypes = Array.isArray(threadTypesRes?.data) ? threadTypesRes.data : Array.isArray(threadTypesRes) ? threadTypesRes : []
        if (!threadTypes.length) {
          console.error('No thread type found')
          return
        }

        const threadRes = await apiFetch('/api/admin-data?action=create&entity=threads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: 'item',
            target_id: ticketId,
            visibility: 'internal',
            type_id: threadTypes[0].id
          }),
        })
        const newThread = await threadRes.json()
        if (newThread?.id) {
          targetThread = newThread
          // Refresh threads list
          const thr = await apiFetch(`/api/admin-data?action=list&entity=threads&target_id=${ticketId}&limit=10`).then(r => r.json())
          const threadList = thr?.data ?? thr
          setThreads(Array.isArray(threadList) ? threadList : [])
        }
      }

      if (!targetThread) {
        console.error('No thread available for message')
        return
      }

      // Resolve message type_id
      const typesRes = await apiFetch('/api/types?kind=message&limit=1').then(r => r.json())
      const types = Array.isArray(typesRes?.data) ? typesRes.data : Array.isArray(typesRes) ? typesRes : []
      if (!types.length) {
        console.error('No message type found')
        return
      }

      // Get current message count for sequencing
      const currentMsgs = await apiFetch(`/api/admin-data?action=list&entity=messages&thread_id=${targetThread.id}&limit=1000`).then(r => r.json())
      const msgCount = Array.isArray(currentMsgs?.data) ? currentMsgs.data.length : Array.isArray(currentMsgs) ? currentMsgs.length : 0
      const nextSeq = msgCount + 1

      const res = await apiFetch('/api/admin-data?action=create&entity=messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          thread_id: targetThread.id, 
          content: reply.trim(), 
          direction: 'outbound', 
          type_id: types[0].id,
          sequence: nextSeq,
          visibility: replyType
        }),
      })
      const response = await res.json()
      const msg = response.data || response
      if (msg?.id) {
        // Create a properly formatted message with all required fields
        const newMessage = {
          ...msg,
          visibility: replyType,
          created_at: msg.created_at || new Date().toISOString(),
          content: reply.trim()
        }
        
        // Add to messages state and trigger refresh
        setMessages(prev => {
          const updated = [...prev, newMessage]
          // Sort by creation time
          return updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
        setReply('')
      }
    } finally { setSending(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {loading && <Skeleton className="h-10 w-2/3" />}
          {!loading && messages.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-6">No messages yet.</p>
          )}
          {messages.map(msg => {
            const isOutbound = msg.direction === 'outbound'
            const isInternal = msg.visibility === 'internal'
            const isAI = msg.data?.message_type === 'agent' || msg.sender_type === 'agent'

            return (
              <div key={msg.id} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-md rounded-lg px-3 py-2 text-sm relative group ${
                    isAI 
                      ? 'bg-purple-100 text-purple-900 border border-purple-200' 
                      : isInternal 
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : isOutbound 
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted border border-border'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    {isAI && <Bot className="h-3 w-3" />}
                    {isInternal && <Lock className="h-3 w-3" />}
                    {!isOutbound && !isAI && <Globe className="h-3 w-3" />}
                    <span className="text-xs opacity-70">
                      {isAI ? 'AI' : isInternal ? 'Internal' : isOutbound ? 'You' : 'Customer'}
                    </span>
                  </div>
                  {msg.content}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-3 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Tabs value={replyType} onValueChange={v => setReplyType(v as 'external' | 'internal')}>
            <TabsList className="h-7">
              <TabsTrigger value="external" className="text-xs gap-1">
                <Globe className="h-3 w-3" /> To Customer
              </TabsTrigger>
              <TabsTrigger value="internal" className="text-xs gap-1">
                <Lock className="h-3 w-3" /> Internal Note
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex gap-2">
          <Input 
            placeholder={replyType === 'external' ? 'Reply to customer…' : 'Internal note…'} 
            value={reply}
            onChange={e => setReply(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} 
            className="flex-1" 
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !reply.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Case Data Panel
function CaseDataPanel({ ticket }: { ticket: Ticket | null }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ticket?.account_id) return
    setLoading(true)
    apiFetch(`/api/admin-data?action=get&entity=accounts&id=${ticket.account_id}`)
      .then(r => r.json())
      .then(data => setAccount(data?.data ?? data ?? null))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false))
  }, [ticket?.account_id])

  if (!ticket) return null

  const tier = account?.data?.tier || '—'
  const mrr = account?.data?.mrr || account?.data?.contract_value || 0
  const billingStatus = account?.data?.billing_status || '—'

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-muted/30">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Case Data</p>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Account Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Account
            </div>
            <div className="pl-6 space-y-1 text-sm">
              <p className="font-medium">{account?.name || 'Unknown'}</p>
              <p className="text-xs text-muted-foreground">ID: {ticket.account_id?.slice(0, 8)}...</p>
            </div>
          </div>

          <Separator />

          {/* Contract/Tier */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4 text-muted-foreground" />
              Plan & Contract
            </div>
            <div className="pl-6 space-y-1 text-sm">
              <p>Tier: <Badge variant="outline" className="text-xs">{tier}</Badge></p>
              <p className="text-muted-foreground">MRR: ${mrr.toLocaleString()}</p>
            </div>
          </div>

          <Separator />

          {/* Billing */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Billing Status
            </div>
            <div className="pl-6 space-y-1 text-sm">
              <p className={billingStatus === 'active' ? 'text-green-600' : 'text-amber-600'}>
                {billingStatus}
              </p>
            </div>
          </div>

          <Separator />

          {/* Related Cases */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Related Tickets
            </div>
            <div className="pl-6 text-xs text-muted-foreground">
              <p>Last 90 days: 0 tickets</p>
              <p className="mt-1 italic">Click to view account history</p>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

// AI Metadata Panel
function AIMetadataPanel({ ticket, onGenerateKB }: { ticket: Ticket | null; onGenerateKB?: () => void }) {
  if (!ticket?.data?.aim_confidence_threshold && !ticket?.data?.aim_confidence_at_response && !ticket?.data?.aim_escalation_reason) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-purple-50">
          <p className="text-xs font-medium uppercase tracking-wide text-purple-700">AI Analysis</p>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center text-sm text-muted-foreground">
          No AI metadata available for this ticket.
        </div>
      </div>
    )
  }

  const ai = ticket.data
  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed'

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-purple-50">
        <p className="text-xs font-medium uppercase tracking-wide text-purple-700">AI Analysis</p>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Confidence Score */}
          {ai.aim_confidence_at_response && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confidence</span>
                <span className={`font-mono font-medium ${ai.aim_confidence_at_response >= 0.75 ? 'text-green-600' : 'text-amber-600'}`}>
                  {Math.round(ai.aim_confidence_at_response * 100)}%
                </span>
              </div>
              {ai.aim_confidence_threshold && (
                <p className="text-xs text-muted-foreground">Threshold: {Math.round(ai.aim_confidence_threshold * 100)}%</p>
              )}
            </div>
          )}

          {ai.aim_escalation_reason && ai.aim_escalation_reason !== 'none' && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-700">Escalated</p>
                <p className="text-amber-600 text-xs">{ai.aim_escalation_reason.replace('_', ' ')}</p>
              </div>
            </div>
          )}

          {/* Problem Statement */}
          {ai.aim_problem_statement && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Problem</p>
              <p className="text-sm bg-muted p-2 rounded">{ai.aim_problem_statement}</p>
            </div>
          )}

          {/* Solution Path */}
          {ai.aim_solution_path && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Solution</p>
              <p className="text-sm bg-muted p-2 rounded">{ai.aim_solution_path}</p>
            </div>
          )}

          {/* Tools Used */}
          {ai.aim_tools_used && ai.aim_tools_used.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Tools Used</p>
              <div className="flex flex-wrap gap-1">
                {ai.aim_tools_used.map((tool, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{tool}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Post-mortem Section */}
          {isResolved && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">Post-mortem</p>

                {postmortem?.root_cause_category && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Root cause:</span>{' '}
                    {postmortem.root_cause_category}
                  </p>
                )}

                {postmortem?.resolution_time_minutes && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Resolution time:</span>{' '}
                    {Math.round(postmortem.resolution_time_minutes)} min
                  </p>
                )}

                {postmortem?.customer_satisfaction !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Satisfaction:</span>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span 
                          key={star} 
                          className={`text-lg ${star <= (postmortem.customer_satisfaction || 0) ? 'text-amber-400' : 'text-gray-300'}`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* KB Generation */}
                <div className="pt-2">
                  {postmortem?.kb_generated ? (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      KB article created
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-1 text-xs"
                      onClick={onGenerateKB}
                    >
                      <BookOpen className="h-3 w-3" />
                      Generate KB Article
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// Case Analysis Panel
function CaseAnalysisPanel({ ticket, analysisLoading }: { ticket: Ticket | null; analysisLoading: boolean }) {
  if (!ticket?.data?.ca_reported_issue && !ticket?.data?.ca_true_problem && !ticket?.data?.ca_final_solution) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-green-50">
          <p className="text-xs font-medium uppercase tracking-wide text-green-700">Case Analysis</p>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center text-sm text-muted-foreground">
          {analysisLoading ? (
            <div className="text-center">
              <div className="animate-spin h-8 w-8 mx-auto mb-2 border-2 border-primary border-t-transparent rounded-full"></div>
              <p>Running case analysis...</p>
              <p className="text-xs text-muted-foreground mt-1">This may take a few minutes.</p>
            </div>
          ) : ticket?.status === 'resolved' ? (
            <div className="text-center">
              <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p>Analysis will be available shortly after resolution.</p>
              <p className="text-xs mt-1">This may take a few minutes.</p>
            </div>
          ) : (
            <div className="text-center">
              <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p>Case analysis available once ticket is resolved.</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const analysis = ticket.data
  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed'

  const getTemperatureColor = (temp?: string) => {
    switch (temp) {
      case 'positive': return 'text-green-600'
      case 'negative': return 'text-red-600'
      case 'frustrated': return 'text-red-700'
      case 'neutral': return 'text-gray-600'
      default: return 'text-gray-600'
    }
  }

  const getAutomationColor = (potential?: string) => {
    switch (potential) {
      case 'high': return 'text-green-600 bg-green-50'
      case 'medium': return 'text-amber-600 bg-amber-50'
      case 'low': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border bg-green-50">
        <p className="text-xs font-medium uppercase tracking-wide text-green-700">Case Analysis</p>
      </div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {/* Customer Temperature */}
          {analysis.ca_customer_temperature && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Customer Temperature</span>
              </div>
              <Badge variant="outline" className={`text-xs ${getTemperatureColor(analysis.ca_customer_temperature)}`}>
                {analysis.ca_customer_temperature}
              </Badge>
            </div>
          )}

          <Separator />

          {/* Time Metrics */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Time Analysis</span>
            </div>
            <div className="pl-6 space-y-1 text-sm">
              {analysis.ca_time_to_resolution && (
                <p>Resolution Time: <span className="font-medium">{analysis.ca_time_to_resolution} min</span></p>
              )}
              {analysis.ca_back_and_forth_count && (
                <p>Message Exchanges: <span className="font-medium">{analysis.ca_back_and_forth_count}</span></p>
              )}
              {analysis.ca_escalation_required !== undefined && (
                <p>Escalated: <span className={`font-medium ${analysis.ca_escalation_required ? 'text-amber-600' : 'text-green-600'}`}>
                  {analysis.ca_escalation_required ? 'Yes' : 'No'}
                </span></p>
              )}
            </div>
          </div>

          <Separator />

          {/* Reported vs True Problem */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Problem Analysis</div>
            <div className="pl-4 space-y-2 text-sm">
              {analysis.ca_reported_issue && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reported Issue:</p>
                  <p className="text-xs bg-blue-50 p-2 rounded">{analysis.ca_reported_issue}</p>
                </div>
              )}
              {analysis.ca_true_problem && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">True Problem:</p>
                  <p className="text-xs bg-purple-50 p-2 rounded">{analysis.ca_true_problem}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Solution Steps */}
          {analysis.ca_solution_steps && analysis.ca_solution_steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Solution Steps</div>
              <div className="pl-4 space-y-1">
                {analysis.ca_solution_steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2 text-xs">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-100 text-green-700 text-xs font-medium mt-0.5">
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostic Steps */}
          {analysis.ca_diagnostic_steps && analysis.ca_diagnostic_steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Diagnostic Steps</div>
              <div className="pl-4 space-y-1">
                {analysis.ca_diagnostic_steps.map((step, index) => (
                  <div key={index} className="flex items-start gap-2 text-xs">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-xs font-medium mt-0.5">
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Automation Potential */}
          {analysis.ca_automation_potential && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Automation Potential</span>
                <Badge variant="outline" className={`text-xs ${getAutomationColor(analysis.ca_automation_potential)}`}>
                  {analysis.ca_automation_potential}
                </Badge>
              </div>
            </div>
          )}

          {/* KB Candidate */}
          {analysis.ca_kb_candidate !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">KB Candidate</span>
                <Badge variant={analysis.ca_kb_candidate ? "default" : "secondary"} className="text-xs">
                  {analysis.ca_kb_candidate ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          )}

          {/* Tags */}
          {analysis.ca_analysis_tags && analysis.ca_analysis_tags.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <TagIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Analysis Tags</span>
              </div>
              <div className="pl-6 flex flex-wrap gap-1">
                {analysis.ca_analysis_tags.map((tagId, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    Tag {tagId.slice(0, 8)}...
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Final Solution */}
          {analysis.ca_final_solution && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Final Solution</div>
              <div className="pl-4">
                <p className="text-xs bg-green-50 p-2 rounded">{analysis.ca_final_solution}</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Separator() {
  return <div className="h-px bg-border" />
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSidePanel, setActiveSidePanel] = useState<'case' | 'ai' | 'analysis'>('case')
  const [isWatching, setIsWatching] = useState(false)
  const [watcherId, setWatcherId] = useState<string | null>(null)
  const [watchLoading, setWatchLoading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      apiFetch(`/api/admin-data?action=get&entity=items&id=${id}`).then(r => r.json()),
      apiFetch(`/api/admin-data?action=list&entity=threads&target_id=${id}&limit=10`).then(r => r.json()),
    ]).then(([ir, thr]) => {
      setTicket(ir?.data ?? ir ?? null)
      const threadList = thr?.data ?? thr
      setThreads(Array.isArray(threadList) ? threadList : [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [id])

  // Check if current user is watching this ticket
  useEffect(() => {
    if (!id || !user?.id) return
    apiFetch(`/api/admin-data?action=list&entity=watchers&target_type=item&target_id=${id}&person_id=${user.id}`)
      .then(r => r.json())
      .then(j => {
        const watchers = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []
        if (watchers.length > 0) {
          setIsWatching(true)
          setWatcherId(watchers[0].id)
        }
      })
      .catch(() => {})
  }, [id, user?.id])

  const toggleWatch = async () => {
    if (!id || !user?.id) return
    setWatchLoading(true)
    try {
      if (isWatching && watcherId) {
        await apiFetch(`/api/admin-data?entity=watchers&id=${watcherId}`, { method: 'DELETE' })
        setIsWatching(false)
        setWatcherId(null)
      } else {
        // Resolve watcher type_id via types API
        const typeRes = await apiFetch('/api/types?kind=watcher&limit=1').then(r => r.json())
        const types = Array.isArray(typeRes?.data) ? typeRes.data : Array.isArray(typeRes) ? typeRes : []
        if (!types.length) { console.error('No watcher type found'); return }
        const res = await apiFetch('/api/admin-data?action=create&entity=watchers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity: 'watchers',
            type_id: types[0].id,
            target_type: 'item',
            target_id: id,
            person_id: user.id,
            watch_type: 'all',
          }),
        })
        const created = await res.json()
        if (created?.id || created?.data?.id) {
          setIsWatching(true)
          setWatcherId(created?.id || created?.data?.id)
        }
      }
    } catch (err) {
      console.error('Watch toggle failed:', err)
    } finally {
      setWatchLoading(false)
    }
  }

  const handleStatusChange = async (status: string) => {
    if (!id || !ticket) return
    
    // Update status (system field only, no redundant data.status)
    await apiFetch(`/api/admin-data?action=update&entity=items&id=${id}`, {
      method: 'PATCH', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    
    setTicket(prev => prev ? { ...prev, status } : prev)
    
    // Trigger case analysis if resolved
    if (status === 'resolved') {
      setAnalysisLoading(true)
      try {
        await apiFetch('/.netlify/functions/custom_case_analysis?action=analyze_ticket', {
          method: 'POST',
          body: JSON.stringify({ ticket_id: id })
        })
        
        // Refresh ticket data to show analysis results
        const updatedTicket = await apiFetch(`/api/admin-data?action=get&entity=items&id=${id}`).then(r => r.json())
        setTicket(updatedTicket?.data ?? updatedTicket)
      } catch (error) {
        console.error('Case analysis failed:', error)
        // Status is still resolved, analysis can be retried later
      } finally {
        setAnalysisLoading(false)
      }
    }
  }

  const handleGenerateKB = () => {
    // Trigger KB generation flow - would navigate to redaction review
    navigate(`/cortex/support/${id}/kb-review`)
  }

  const externalThread = threads.find(t => !t.visibility || t.visibility === 'external') ?? null
  const internalThread = threads.find(t => t.visibility === 'internal') ?? null

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /></div>
  if (!ticket) return <div className="p-6 text-muted-foreground text-sm">Ticket not found.</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/cortex/support')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Support
          </Button>
          <div>
            <h1 className="text-base font-semibold">{ticket.title}</h1>
            <p className="text-xs text-muted-foreground font-mono">{ticket.id.slice(0, 8)}…</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isWatching ? 'default' : 'outline'}
            size="sm"
            className="gap-1 text-xs"
            onClick={toggleWatch}
            disabled={watchLoading}
          >
            {isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {isWatching ? 'Watching' : 'Watch'}
          </Button>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[ticket.status] || 'bg-muted text-muted-foreground'}`}>
            {ticket.status?.replace('_', ' ')}
          </span>
          <select
            value={ticket.status}
            onChange={e => handleStatusChange(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
          >
            {['open', 'to_customer', 'ai_responding', 'human_assigned', 'in_progress', 'resolved', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main Conversation Panel */}
        <div className="flex-1 min-w-0 border-r border-border">
          <MergedThreadPanel 
            ticketId={id || ''} 
            externalThread={externalThread} 
            internalThread={internalThread} 
          />
        </div>

        {/* Right Side Panel Tabs */}
        <div className="w-80 shrink-0 flex flex-col">
          <Tabs value={activeSidePanel} onValueChange={v => setActiveSidePanel(v as 'case' | 'ai' | 'analysis')}>
            <TabsList className="w-full rounded-none border-b">
              <TabsTrigger value="case" className="flex-1 gap-1 text-xs">
                <Building2 className="h-3 w-3" /> Case
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex-1 gap-1 text-xs">
                <Bot className="h-3 w-3" /> AI
              </TabsTrigger>
              <TabsTrigger value="analysis" className="flex-1 gap-1 text-xs">
                <Brain className="h-3 w-3" /> Analysis
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {activeSidePanel === 'case' && <CaseDataPanel ticket={ticket} />}
          {activeSidePanel === 'ai' && <AIMetadataPanel ticket={ticket} onGenerateKB={handleGenerateKB} />}
          {activeSidePanel === 'analysis' && <CaseAnalysisPanel ticket={ticket} analysisLoading={analysisLoading} />}
        </div>
      </div>
    </div>
  )
}
