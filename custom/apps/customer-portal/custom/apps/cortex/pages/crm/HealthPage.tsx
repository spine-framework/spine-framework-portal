import { useEffect, useState } from 'react'
import { apiFetch } from '@core/lib/api'

interface HealthRecord {
  id: string
  title: string
  data: { temperature?: 'green' | 'yellow' | 'red'; churn_risk_score?: number; adoption_score?: number; nps_score?: number; notes?: string }
  created_at: string
}

const TEMP_STYLE: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Healthy' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'At Risk' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Critical' },
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  if (value == null) return null
  const pct = Math.min(100, Math.max(0, value))
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-slate-500 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-slate-600 font-medium">{value}</span>
    </div>
  )
}

export default function HealthPage() {
  const [records, setRecords] = useState<HealthRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all')

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=csm_health&limit=200')
      .then(r => r.json())
      .then(json => setRecords(Array.isArray(json?.data) ? json.data : json || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? records : records.filter(r => r.data?.temperature === filter)
  const counts = { green: records.filter(r => r.data?.temperature === 'green').length, yellow: records.filter(r => r.data?.temperature === 'yellow').length, red: records.filter(r => r.data?.temperature === 'red').length }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Customer Health</h1>
        <p className="text-slate-500 text-sm mt-1">CSM health records across accounts</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(['green', 'yellow', 'red'] as const).map(temp => {
          const s = TEMP_STYLE[temp]
          return (
            <button
              key={temp}
              onClick={() => setFilter(f => f === temp ? 'all' : temp)}
              className={`${s.bg} rounded-lg p-4 text-left border-2 transition-colors ${filter === temp ? 'border-current' : 'border-transparent'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${s.text}`}>{s.label}</span>
              </div>
              <div className={`text-3xl font-bold ${s.text}`}>{counts[temp]}</div>
            </button>
          )
        })}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading health records…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-slate-200">
            No health records {filter !== 'all' ? `with ${filter} status` : 'yet'}.
          </div>
        ) : filtered.map(record => {
          const temp = record.data?.temperature || 'green'
          const s = TEMP_STYLE[temp]
          return (
            <div key={record.id} className={`${s.bg} rounded-lg border border-slate-200 p-4`}>
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-slate-900">{record.title}</div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
                  <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                  {s.label}
                </div>
              </div>
              <div className="space-y-1.5">
                <ScoreBar label="Adoption" value={record.data?.adoption_score} />
                <ScoreBar label="Churn Risk" value={record.data?.churn_risk_score != null ? 100 - record.data.churn_risk_score : undefined} />
              </div>
              {record.data?.nps_score != null && (
                <div className="mt-2 text-xs text-slate-500">NPS: <span className="font-semibold text-slate-700">{record.data.nps_score}</span></div>
              )}
              {record.data?.notes && (
                <div className="mt-2 text-xs text-slate-600 italic">{record.data.notes}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
