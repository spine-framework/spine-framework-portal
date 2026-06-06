import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { useAuth } from '@core/contexts/AuthContext'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Button } from '@core/components/ui/button'
import { Skeleton } from '@core/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@core/components/ui/tabs'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Headphones, Clock, ChevronRight, List, LayoutGrid, Filter, AlertCircle, User, Timer } from 'lucide-react'

interface Ticket {
  id: string
  title: string
  status?: string
  priority?: string
  description?: string
  created_at: string
  account_id?: string
  data?: {
    aim_confidence_threshold?: number
    aim_confidence_at_response?: number
    aim_escalation_reason?: string
    aim_human_assignee_id?: string
    status?: string
  }
}

// 3-Factor Priority Score Calculation
interface PriorityScore {
  total: number
  urgency: number
  risk: number
  staleness: number
  explanation: string
}

function calculatePriorityScore(ticket: Ticket): PriorityScore {
  // Urgency: Plan tier (core=1, custom=2, enterprise=3) - use priority as proxy
  const tierWeights: Record<string, number> = { low: 1, medium: 2, high: 3, urgent: 3 }
  const urgency = tierWeights[ticket.priority || 'low'] || 1

  // Risk: Escalation reason
  const escalationReason = ticket.data?.aim_escalation_reason
  let risk = 2 // default medium
  if (escalationReason === 'thumbs_down') risk = 3
  else if (escalationReason === 'low_confidence') risk = 2
  else if (escalationReason === 'customer_request') risk = 1

  // Staleness: Hours since creation (capped at 72h)
  const hoursSince = Math.min(
    Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 3600000),
    72
  )
  const staleness = Math.ceil(hoursSince / 24) // 0-3 scale

  // Weighted composite
  const total = Math.round((urgency * 0.4 + risk * 0.35 + staleness * 0.25) / 3 * 100)

  const explanationParts: string[] = []
  if (urgency >= 3) explanationParts.push('High urgency')
  if (risk >= 3) explanationParts.push('Negative feedback')
  if (staleness >= 2) explanationParts.push(`${staleness}d stale`)

  return {
    total,
    urgency,
    risk,
    staleness,
    explanation: explanationParts.join(', ') || 'Standard priority'
  }
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  ai_responding: 'bg-purple-100 text-purple-700',
  human_assigned: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-muted text-muted-foreground',
}

function ageLabel(created_at: string) {
  const diff = Date.now() - new Date(created_at).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

type FilterType = 'all' | 'mine' | 'unassigned' | 'high_priority'
type ViewType = 'list' | 'kanban'

// Kanban columns based on AI-first workflow
const KANBAN_COLUMNS = [
  { id: 'open', label: 'New', color: 'border-blue-200' },
  { id: 'to_customer', label: 'To Customer', color: 'border-cyan-200' },
  { id: 'ai_responding', label: 'AI Responding', color: 'border-purple-200' },
  { id: 'human_assigned', label: 'Human Assigned', color: 'border-amber-200' },
  { id: 'in_progress', label: 'In Progress', color: 'border-orange-200' },
  { id: 'resolved', label: 'Resolved', color: 'border-green-200' },
  { id: 'closed', label: 'Closed', color: 'border-gray-200' },
]

export default function SupportPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [view, setView] = useState<ViewType>('list')
  const [myWatchedIds, setMyWatchedIds] = useState<Set<string>>(new Set())
  const [showAllStatuses, setShowAllStatuses] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=support_ticket&limit=500')
      .then(r => r.json())
      .then(j => setTickets(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false))
  }, [])

  // Fetch watched ticket IDs for current user
  useEffect(() => {
    if (!user?.id) return
    apiFetch(`/api/admin-data?action=list&entity=watchers&target_type=item&person_id=${user.id}&limit=500`)
      .then(r => r.json())
      .then(j => {
        const watchers = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []
        setMyWatchedIds(new Set(watchers.map((w: any) => w.target_id)))
      })
      .catch(() => setMyWatchedIds(new Set()))
  }, [user?.id])

  // Calculate priority scores for all tickets
  const ticketsWithScores = useMemo(() => {
    return tickets.map(t => ({
      ...t,
      score: calculatePriorityScore(t),
      effectiveStatus: t.data?.status || t.status
    }))
  }, [tickets])

  const filtered = ticketsWithScores.filter(t => {
    const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = 
      filter === 'all' ||
      (filter === 'high_priority' && t.score.total >= 70) ||
      (filter === 'unassigned' && !t.data?.aim_human_assignee_id) ||
      (filter === 'mine' && myWatchedIds.has(t.id))
    return matchesSearch && matchesFilter
  })

  // Sort by priority score descending, then by age
  const sorted = [...filtered].sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const counts = {
    all: tickets.length,
    new: tickets.filter(t => (t.data?.status || t.status) === 'open').length,
    ai_responding: tickets.filter(t => (t.data?.status || t.status) === 'ai_responding').length,
    human_assigned: tickets.filter(t => (t.data?.status || t.status) === 'human_assigned').length,
    resolved: tickets.filter(t => (t.data?.status || t.status) === 'resolved').length,
    high_priority: ticketsWithScores.filter(t => t.score.total >= 70).length,
  }

  // Kanban view: group by status with toggle filters
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, typeof sorted> = {}
    KANBAN_COLUMNS.forEach(col => {
      let columnTickets = sorted.filter(t => t.effectiveStatus === col.id)
      
      // Apply showClosed toggle (hide closed if toggle is off)
      if (!showClosed && col.id === 'closed') {
        columnTickets = []
      }
      
      groups[col.id] = columnTickets
    })
    
    // Apply showAllStatuses toggle (hide empty columns if toggle is off)
    if (!showAllStatuses) {
      Object.keys(groups).forEach(key => {
        if (groups[key].length === 0) {
          delete groups[key]
        }
      })
    }
    
    return groups
  }, [sorted, showAllStatuses, showClosed])

  const renderListView = () => (
    <div className="border rounded-lg overflow-hidden">
      {loading ? (
        <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <Headphones className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'No tickets match your search.' : 'No tickets found.'}</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b bg-muted/30">
              <th className="text-left px-5 py-3 font-medium">Score</th>
              <th className="text-left px-5 py-3 font-medium">Subject</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-left px-5 py-3 font-medium">Why</th>
              <th className="text-right px-5 py-3 font-medium">Time Waiting</th>
              <th className="px-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map(ticket => (
              <tr
                key={ticket.id}
                onClick={() => navigate(`/cortex/support/${ticket.id}`)}
                className="hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={ticket.score.total >= 70 ? 'destructive' : ticket.score.total >= 50 ? 'default' : 'secondary'}
                      className="font-mono"
                    >
                      {ticket.score.total}
                    </Badge>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium truncate max-w-xs">{ticket.title}</p>
                  {ticket.description && <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{ticket.description}</p>}
                </td>
                <td className="px-5 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[ticket.effectiveStatus] || 'bg-muted text-muted-foreground'}`}>
                    {ticket.effectiveStatus?.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs text-muted-foreground">{ticket.score.explanation}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {ageLabel(ticket.created_at)}
                  </span>
                </td>
                <td className="px-3 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground/50" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  const renderKanbanView = () => (
    <div>
      {/* Kanban Controls */}
      <div className="flex items-center gap-4 mb-4 px-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-all-statuses"
            checked={showAllStatuses}
            onChange={(e) => setShowAllStatuses(e.target.checked)}
            className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
          />
          <label htmlFor="show-all-statuses" className="text-sm font-medium text-gray-700">
            Show all statuses
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="show-closed"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
          />
          <label htmlFor="show-closed" className="text-sm font-medium text-gray-700">
            Show closed cases
          </label>
        </div>
      </div>
      
      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Object.entries(kanbanGroups).map(([columnId, tickets]) => {
          const column = KANBAN_COLUMNS.find(col => col.id === columnId)
          if (!column) return null
          return (
            <div key={columnId} className={`w-80 shrink-0 flex flex-col ${column.color} border-t-4 rounded-lg bg-muted/20`}>
              <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                <span className="text-sm font-medium">{column.label}</span>
                <Badge variant="secondary" className="text-xs">{tickets?.length || 0}</Badge>
              </div>
              <ScrollArea className="flex-1 h-[calc(100vh-280px)]">
                <div className="p-2 space-y-2">
                  {tickets?.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => navigate(`/cortex/support/${ticket.id}`)}
                      className="bg-background border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-2 flex-1">{ticket.title}</p>
                        <Badge 
                          variant={ticket.score.total >= 70 ? 'destructive' : 'secondary'}
                          className="text-xs font-mono shrink-0"
                        >
                          {ticket.score.total}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {ageLabel(ticket.created_at)}
                        </span>
                        {ticket.data?.aim_human_assignee_id && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Assigned
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {(!tickets || tickets.length === 0) && (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      No tickets
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support Queue</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tickets.length} tickets · {counts.new} new · {counts.human_assigned} need human attention
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={v => setView(v as ViewType)}>
            <TabsList>
              <TabsTrigger value="list" className="gap-1">
                <List className="h-4 w-4" /> List
              </TabsTrigger>
              <TabsTrigger value="kanban" className="gap-1">
                <LayoutGrid className="h-4 w-4" /> Kanban
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…" className="w-72" />
        <Tabs value={filter} onValueChange={v => setFilter(v as FilterType)}>
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="secondary" className="ml-1.5">{counts.all}</Badge></TabsTrigger>
            <TabsTrigger value="high_priority">
              <AlertCircle className="h-3 w-3 mr-1" />
              High Priority <Badge variant="secondary" className="ml-1.5">{counts.high_priority}</Badge>
            </TabsTrigger>
            <TabsTrigger value="unassigned">
              <Filter className="h-3 w-3 mr-1" />
              Unassigned
            </TabsTrigger>
            <TabsTrigger value="mine">
              <User className="h-3 w-3 mr-1" />
              My Tickets
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {view === 'list' ? renderListView() : renderKanbanView()}
    </div>
  )
}
