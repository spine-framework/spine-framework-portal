import { useEffect, useState } from 'react'
import { apiFetch } from '@core/lib/api'

interface ActivityItem {
  id: string
  title: string
  data: Record<string, unknown>
  created_at: string
  type_slug?: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  site_visit:      { label: 'Site Visit',      color: 'bg-purple-100 text-purple-700' },
  marketing_touch: { label: 'Marketing Touch', color: 'bg-yellow-100 text-yellow-700' },
  deal:            { label: 'Deal',            color: 'bg-blue-100 text-blue-700' },
  csm_health:      { label: 'Health Check',    color: 'bg-green-100 text-green-700' },
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=site_visit&limit=50').then(r => r.json()),
      apiFetch('/api/admin-data?action=list&entity=items&type_slug=marketing_touch&limit=50').then(r => r.json()),
    ])
      .then(([vr, tr]) => {
        const visits = vr?.data ?? vr
        const touches = tr?.data ?? tr
        const all = [
          ...(visits || []).map((i: ActivityItem) => ({ ...i, type_slug: 'site_visit' })),
          ...(touches || []).map((i: ActivityItem) => ({ ...i, type_slug: 'marketing_touch' })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setItems(all)
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Activity Feed</h1>
        <p className="text-muted-foreground text-sm mt-1">Site visits and marketing touches</p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading activity…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No activity recorded yet.</div>
        ) : (
          <div className="divide-y">
            {items.map(item => {
              const typeInfo = TYPE_LABELS[item.type_slug || ''] || { label: item.type_slug || 'Event', color: 'bg-muted text-muted-foreground' }
              return (
                <div key={item.id} className="px-5 py-4 flex items-start gap-4">
                  <span className={`flex-shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium mt-0.5 ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.title}</div>
                    {item.type_slug === 'site_visit' && item.data?.url && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{String(item.data.url)}</div>
                    )}
                    {item.type_slug === 'marketing_touch' && item.data?.channel && (
                      <div className="text-xs text-muted-foreground mt-0.5">via {String(item.data.channel)}{item.data?.campaign ? ` · ${item.data.campaign}` : ''}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
