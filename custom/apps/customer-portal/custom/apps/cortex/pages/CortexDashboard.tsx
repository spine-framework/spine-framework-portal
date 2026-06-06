import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@core/components/ui/card'
import { Skeleton } from '@core/components/ui/skeleton'
import { Building2, Headphones, MessageSquare, BookOpen, GraduationCap, TrendingUp } from 'lucide-react'

interface Stats {
  accounts: number
  openTickets: number
  unansweredPosts: number
  kbArticles: number
  pipeline: number
  deals: number
}

function StatCard({
  title, value, sub, icon: Icon, href, loading
}: {
  title: string; value: string | number; sub?: string; icon: React.ElementType; href: string; loading: boolean
}) {
  const navigate = useNavigate()
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(href)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-3xl font-bold">{value}</div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

export default function CortexDashboard() {
  const [stats, setStats] = useState<Stats>({ accounts: 0, openTickets: 0, unansweredPosts: 0, kbArticles: 0, pipeline: 0, deals: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin-data?action=list&entity=accounts&limit=1').then(r => r.json()),
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=support_ticket&limit=200').then(r => r.json()),
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=community_post&limit=200').then(r => r.json()),
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=kb_article&limit=1').then(r => r.json()),
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=deal&limit=200').then(r => r.json()),
    ]).then(([ar, tr, pr, kr, dr]) => {
      const accounts = ar?.data ?? ar
      const tickets = tr?.data ?? tr
      const posts = pr?.data ?? pr
      const kbArticles = kr?.data ?? kr
      const deals = dr?.data ?? dr
      const openTickets = (tickets || []).filter((t: any) => !['resolved', 'closed'].includes(t.status))
      const pipeline = (deals || [])
        .filter((d: any) => !['closed_won', 'closed_lost'].includes(d.data?.stage))
        .reduce((sum: number, d: any) => sum + (d.data?.value || 0), 0)
      setStats({
        accounts: ar?.meta?.total ?? (accounts || []).length,
        openTickets: openTickets.length,
        unansweredPosts: (posts || []).length,
        kbArticles: kr?.meta?.total ?? (kbArticles || []).length,
        pipeline,
        deals: (deals || []).length,
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cortex</h1>
        <p className="text-muted-foreground text-sm mt-1">Operations overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Accounts" value={stats.accounts} icon={Building2} href="/cortex/crm/accounts" loading={loading} />
        <StatCard title="Open Tickets" value={stats.openTickets} sub="support queue" icon={Headphones} href="/cortex/support" loading={loading} />
        <StatCard title="Community Posts" value={stats.unansweredPosts} sub="all channels" icon={MessageSquare} href="/cortex/community" loading={loading} />
        <StatCard title="KB Articles" value={stats.kbArticles} icon={BookOpen} href="/cortex/kb" loading={loading} />
        <StatCard title="Deals" value={stats.deals} sub="all stages" icon={TrendingUp} href="/cortex/crm/deals" loading={loading} />
        <StatCard
          title="Pipeline"
          value={loading ? '…' : `$${(stats.pipeline / 1000).toFixed(0)}k`}
          sub="open deal value"
          icon={GraduationCap}
          href="/cortex/crm/deals"
          loading={false}
        />
      </div>
    </div>
  )
}
