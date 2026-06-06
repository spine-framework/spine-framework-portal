import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'

interface Deal {
  id: string
  title: string
  data: { stage?: string; value?: number; close_date?: string; probability?: number; source?: string }
  created_at: string
}

const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']

const STAGE_STYLE: Record<string, { bg: string; header: string; badge: string }> = {
  prospecting:    { bg: 'bg-slate-50',   header: 'bg-slate-100',   badge: 'bg-slate-200 text-slate-700' },
  qualification:  { bg: 'bg-blue-50',    header: 'bg-blue-100',    badge: 'bg-blue-200 text-blue-700' },
  proposal:       { bg: 'bg-yellow-50',  header: 'bg-yellow-100',  badge: 'bg-yellow-200 text-yellow-700' },
  negotiation:    { bg: 'bg-orange-50',  header: 'bg-orange-100',  badge: 'bg-orange-200 text-orange-700' },
  closed_won:     { bg: 'bg-green-50',   header: 'bg-green-100',   badge: 'bg-green-200 text-green-700' },
  closed_lost:    { bg: 'bg-red-50',     header: 'bg-red-100',     badge: 'bg-red-200 text-red-700' },
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:shadow-sm hover:border-blue-300 transition-all"
    >
      <div className="font-medium text-slate-900 text-sm mb-1 truncate">{deal.title}</div>
      {deal.data?.value != null && (
        <div className="text-green-700 font-semibold text-sm">${deal.data.value.toLocaleString()}</div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
        <span>{deal.data?.source || '—'}</span>
        <span>{deal.data?.close_date || ''}</span>
      </div>
    </div>
  )
}

export default function DealsPage() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'kanban' | 'list'>('kanban')

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=deal&limit=200')
      .then(r => r.json())
      .then(json => setDeals(Array.isArray(json?.data) ? json.data : json || []))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false))
  }, [])

  const byStage = (stage: string) => deals.filter(d => (d.data?.stage || 'prospecting') === stage)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deals</h1>
          <p className="text-slate-500 text-sm mt-1">{deals.length} deals across {STAGES.length} stages</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 rounded-lg p-1 text-sm">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${view === 'kanban' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${view === 'list' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              List
            </button>
          </div>
          <button
            onClick={() => navigate('/cortex/crm/deals/new')}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Deal
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading deals…</div>
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const s = STAGE_STYLE[stage]
            const stageDeals = byStage(stage)
            const stageValue = stageDeals.reduce((sum, d) => sum + (d.data?.value || 0), 0)
            return (
              <div key={stage} className={`flex-shrink-0 w-56 rounded-xl ${s.bg} flex flex-col`}>
                <div className={`${s.header} rounded-t-xl px-3 py-2`}>
                  <div className="font-semibold text-slate-800 text-xs uppercase tracking-wide">
                    {stage.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {stageDeals.length} · {stageValue ? `$${(stageValue / 1000).toFixed(0)}k` : '$0'}
                  </div>
                </div>
                <div className="flex-1 p-2 space-y-2 min-h-16">
                  {stageDeals.map(deal => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onClick={() => navigate(`/crm/deals/${deal.id}`)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left px-5 py-3 font-medium">Deal</th>
                <th className="text-left px-5 py-3 font-medium">Stage</th>
                <th className="text-right px-5 py-3 font-medium">Value</th>
                <th className="text-left px-5 py-3 font-medium">Source</th>
                <th className="text-right px-5 py-3 font-medium">Close Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                    No deals yet.{' '}
                    <button onClick={() => navigate('/cortex/crm/deals/new')} className="text-blue-600 hover:underline">
                      Create one →
                    </button>
                  </td>
                </tr>
              ) : deals.map(deal => {
                const s = STAGE_STYLE[deal.data?.stage || 'prospecting']
                return (
                  <tr
                    key={deal.id}
                    onClick={() => navigate(`/crm/deals/${deal.id}`)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">{deal.title}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.badge}`}>
                        {(deal.data?.stage || 'prospecting').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-700">
                      {deal.data?.value ? `$${deal.data.value.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{deal.data?.source || '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-500">{deal.data?.close_date || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
