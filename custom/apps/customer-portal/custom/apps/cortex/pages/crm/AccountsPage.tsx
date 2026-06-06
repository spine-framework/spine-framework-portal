import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { Button } from '@core/components/ui/button'
import { Building2, ChevronRight } from 'lucide-react'

interface Account {
  id: string
  slug: string
  display_name?: string
  created_at: string
  data?: { 
    segment?: string
    status?: string
    lifecycle_stage?: string
    lead_score?: number
    temperature?: 'cold' | 'warm' | 'hot'
    last_signal_at?: string
  }
}

type Filter = 'all'

export default function AccountsPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter] = useState<Filter>('all')

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=accounts&limit=500')
      .then(r => r.json())
      .then(json => setAccounts(Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = accounts.filter(a => {
    const q = search.toLowerCase()
    return !q || (a.display_name || a.slug || '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-muted-foreground text-sm mt-1">{accounts.length} accounts</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search accounts…"
          className="w-72"
        />
        <div className="flex gap-1">
          <Button size="sm" variant={filter === 'all' ? 'default' : 'outline'}>All</Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{search ? 'No accounts match your search.' : 'No accounts yet.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wider border-b bg-muted/30">
                <th className="text-left px-5 py-3 font-medium">Account</th>
                <th className="text-left px-5 py-3 font-medium">Stage</th>
                <th className="text-left px-5 py-3 font-medium">Score</th>
                <th className="text-left px-5 py-3 font-medium">Temp</th>
                <th className="text-right px-5 py-3 font-medium">Last Signal</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(account => (
                <tr
                  key={account.id}
                  onClick={() => navigate(`/cortex/crm/accounts/${account.id}`)}
                  className="hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3 font-medium">
                    {account.display_name || account.slug}
                    <div className="text-muted-foreground font-mono text-xs">{account.slug}</div>
                  </td>
                  <td className="px-5 py-3">
                    {account.data?.lifecycle_stage ? (
                      <Badge 
                        variant={account.data.lifecycle_stage === 'customer' ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {account.data.lifecycle_stage.replace(/_/g, ' ')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {account.data?.lead_score !== undefined ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              account.data.lead_score >= 70 ? 'bg-green-500' : 
                              account.data.lead_score >= 40 ? 'bg-yellow-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${Math.min(account.data.lead_score, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{account.data.lead_score}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {account.data?.temperature ? (
                      <Badge 
                        variant="outline"
                        className={`capitalize ${
                          account.data.temperature === 'hot' ? 'border-red-400 text-red-600' :
                          account.data.temperature === 'warm' ? 'border-yellow-400 text-yellow-600' :
                          'border-blue-400 text-blue-600'
                        }`}
                      >
                        {account.data.temperature}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                    {account.data?.last_signal_at 
                      ? new Date(account.data.last_signal_at).toLocaleDateString()
                      : 'Never'
                    }
                  </td>
                  <td className="px-3 py-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
