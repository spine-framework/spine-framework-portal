import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@core/components/ui/tabs'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { Button } from '@core/components/ui/button'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Separator } from '@core/components/ui/separator'
import { ArrowLeft, User, Ticket, Handshake, Activity, Heart, Funnel, TrendingUp, Target, Clock } from 'lucide-react'

interface Account {
  id: string
  slug: string
  display_name?: string
  created_at: string
  data?: {
    segment?: string
    lifecycle_stage?: string
    lead_score?: number
    temperature?: 'cold' | 'warm' | 'hot'
    last_signal_at?: string
    ratings?: {
      anonymous?: { rating: number; raw_score: number }
      identified?: { rating: number; raw_score: number }
      engaged?: { rating: number; raw_score: number }
    }
    attribution?: {
      anonymous_first_touch?: { referrer?: string; url?: string; at?: string }
      identified_first_touch?: { referrer?: string; url?: string; at?: string }
    }
    queue?: {
      pending_opportunity_id?: string
      primary_opportunity_type?: string
    }
  }
}

interface Person {
  id: string
  email: string
  first_name?: string
  last_name?: string
  created_at: string
}

interface Item {
  id: string
  title: string
  status?: string
  data?: Record<string, any>
  created_at: string
}

function PeopleTab({ accountId }: { accountId: string }) {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiFetch(`/api/admin-data?action=list&entity=people&account_id=${accountId}&limit=100`)
      .then(r => r.json()).then(j => setPeople(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [])).catch(() => setPeople([])).finally(() => setLoading(false))
  }, [accountId])
  if (loading) return <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  if (people.length === 0) return <p className="p-6 text-sm text-muted-foreground text-center">No people found.</p>
  return (
    <div className="divide-y">
      {people.map(p => (
        <div key={p.id} className="flex items-center gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{[p.first_name, p.last_name].filter(Boolean).join(' ') || '—'}</p>
            <p className="text-xs text-muted-foreground">{p.email}</p>
          </div>
          <p className="ml-auto text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  )
}

function ItemsTab({ accountId, typeSlug, emptyText }: { accountId: string; typeSlug: string; emptyText: string }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    apiFetch(`/api/admin-data?action=list&entity=items&type_slug=${typeSlug}&account_id=${accountId}&limit=100`)
      .then(r => r.json()).then(j => setItems(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [])).catch(() => setItems([])).finally(() => setLoading(false))
  }, [accountId, typeSlug])
  if (loading) return <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  if (items.length === 0) return <p className="p-6 text-sm text-muted-foreground text-center">{emptyText}</p>
  return (
    <div className="divide-y">
      {items.map(item => (
        <div key={item.id}
          className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
          onClick={() => typeSlug === 'support_ticket' ? navigate(`/cortex/support/${item.id}`) : typeSlug === 'deal' ? navigate(`/cortex/crm/deals/${item.id}`) : undefined}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.title}</p>
            <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
          </div>
          {item.status && <Badge variant="secondary">{item.status}</Badge>}
        </div>
      ))}
    </div>
  )
}

function ActivityTab({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([
      apiFetch(`/api/admin-data?action=list&entity=items&type_slug=marketing_touch&account_id=${accountId}&limit=20`).then(r => r.json()),
      apiFetch(`/api/admin-data?action=list&entity=items&type_slug=site_visit&account_id=${accountId}&limit=20`).then(r => r.json()),
      apiFetch(`/api/admin-data?action=list&entity=items&type_slug=support_ticket&account_id=${accountId}&limit=20`).then(r => r.json()),
    ]).then(([tor, vor, tkr]) => {
      const touches = tor?.data ?? tor
      const visits = vor?.data ?? vor
      const tickets = tkr?.data ?? tkr
      const all = [...(touches || []), ...(visits || []), ...(tickets || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setItems(all)
    }).catch(() => setItems([])).finally(() => setLoading(false))
  }, [accountId])
  if (loading) return <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
  if (items.length === 0) return <p className="p-6 text-sm text-muted-foreground text-center">No activity yet.</p>
  return (
    <div className="divide-y">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 px-4 py-3">
          <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{item.title}</p>
          </div>
          <p className="text-xs text-muted-foreground shrink-0">{new Date(item.created_at).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  )
}

function FunnelTab({ account }: { account: Account }) {
  const stage = account.data?.lifecycle_stage
  const score = account.data?.lead_score ?? 0
  const temp = account.data?.temperature
  const ratings = account.data?.ratings
  const attr = account.data?.attribution
  const queue = account.data?.queue

  return (
    <div className="p-6 space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Lifecycle Stage</span>
          </div>
          {stage ? (
            <Badge className="capitalize text-sm" variant={stage === 'customer' ? 'default' : 'secondary'}>
              {stage.replace(/_/g, ' ')}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-sm">Not set</span>
          )}
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Lead Score</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                style={{ width: `${Math.min(score, 100)}%` }}
              />
            </div>
            <span className="font-semibold">{score}</span>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Last Signal</span>
          </div>
          <span className="text-sm">
            {account.data?.last_signal_at 
              ? new Date(account.data.last_signal_at).toLocaleDateString()
              : 'Never'
            }
          </span>
        </div>
      </div>

      {/* Temperature Badge */}
      {temp && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Temperature:</span>
          <Badge 
            variant="outline"
            className={`capitalize ${
              temp === 'hot' ? 'border-red-400 text-red-600 bg-red-50' :
              temp === 'warm' ? 'border-yellow-400 text-yellow-600 bg-yellow-50' :
              'border-blue-400 text-blue-600 bg-blue-50'
            }`}
          >
            {temp}
          </Badge>
        </div>
      )}

      {/* Queue Status */}
      {queue?.pending_opportunity_id && (
        <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-2">
            <Funnel className="h-4 w-4 text-yellow-600" />
            <span className="font-medium text-sm">Opportunity in Queue</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Type: {queue.primary_opportunity_type?.replace(/_/g, ' ') || 'Unknown'}
          </p>
        </div>
      )}

      {/* Stage Ratings */}
      {ratings && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-4">Stage Ratings</h3>
          <div className="space-y-3">
            {ratings.anonymous && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Anonymous</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full ${i < ratings.anonymous!.rating ? 'bg-blue-500' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium w-12 text-right">{ratings.anonymous.raw_score}</span>
                </div>
              </div>
            )}
            {ratings.identified && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Identified</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full ${i < ratings.identified!.rating ? 'bg-green-500' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium w-12 text-right">{ratings.identified.raw_score}</span>
                </div>
              </div>
            )}
            {ratings.engaged && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Engaged</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full ${i < ratings.engaged!.rating ? 'bg-orange-500' : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium w-12 text-right">{ratings.engaged.raw_score}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attribution */}
      {(attr?.anonymous_first_touch || attr?.identified_first_touch) && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-4">Attribution</h3>
          <div className="space-y-3 text-sm">
            {attr.anonymous_first_touch && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Anonymous First Touch</span>
                <span className="text-right">
                  <span className="font-medium">{attr.anonymous_first_touch.referrer || 'Direct'}</span>
                  <span className="text-xs text-muted-foreground block">
                    {attr.anonymous_first_touch.at ? new Date(attr.anonymous_first_touch.at).toLocaleDateString() : ''}
                  </span>
                </span>
              </div>
            )}
            {attr.identified_first_touch && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identified First Touch</span>
                <span className="text-right">
                  <span className="font-medium">{attr.identified_first_touch.referrer || 'Direct'}</span>
                  <span className="text-xs text-muted-foreground block">
                    {attr.identified_first_touch.at ? new Date(attr.identified_first_touch.at).toLocaleDateString() : ''}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!stage && !score && !temp && !ratings && !queue?.pending_opportunity_id && (
        <div className="text-center py-12 text-muted-foreground">
          <Funnel className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No funnel data yet.</p>
          <p className="text-xs mt-1">Signals will appear here as they are processed.</p>
        </div>
      )}
    </div>
  )
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    apiFetch(`/api/admin-data?action=get&entity=accounts&id=${id}`)
      .then(r => r.json()).then(j => setAccount(j?.data ?? j ?? null)).catch(() => setAccount(null)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-48" /></div>
  if (!account) return <div className="p-6 text-muted-foreground text-sm">Account not found.</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1 text-muted-foreground" onClick={() => navigate('/cortex/crm/accounts')}>
          <ArrowLeft className="h-3.5 w-3.5" /> Accounts
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">{(account.display_name || account.slug).charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">{account.display_name || account.slug}</h1>
            <p className="text-xs text-muted-foreground font-mono">{account.slug}</p>
          </div>
          {account.data?.segment && <Badge variant="secondary" className="ml-2">{account.data.segment}</Badge>}
        </div>
      </div>

      <Tabs defaultValue="people" className="flex flex-col flex-1 min-h-0">
        <div className="px-6 border-b border-border shrink-0">
          <TabsList className="h-9 bg-transparent p-0 gap-4">
            {[
              { value: 'people', label: 'People', icon: User },
              { value: 'funnel', label: 'Funnel', icon: Funnel },
              { value: 'tickets', label: 'Tickets', icon: Ticket },
              { value: 'deals', label: 'Deals', icon: Handshake },
              { value: 'health', label: 'Health', icon: Heart },
              { value: 'activity', label: 'Activity', icon: Activity },
            ].map(tab => (
              <TabsTrigger key={tab.value} value={tab.value}
                className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-9 px-1">
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="people" className="mt-0"><PeopleTab accountId={id!} /></TabsContent>
          <TabsContent value="funnel" className="mt-0"><FunnelTab account={account} /></TabsContent>
          <TabsContent value="tickets" className="mt-0"><ItemsTab accountId={id!} typeSlug="support_ticket" emptyText="No tickets." /></TabsContent>
          <TabsContent value="deals" className="mt-0"><ItemsTab accountId={id!} typeSlug="deal" emptyText="No deals." /></TabsContent>
          <TabsContent value="health" className="mt-0"><ItemsTab accountId={id!} typeSlug="csm_health" emptyText="No health records." /></TabsContent>
          <TabsContent value="activity" className="mt-0"><ActivityTab accountId={id!} /></TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  )
}
