import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'

const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
const SOURCES = ['inbound', 'outbound', 'referral', 'event', 'paid', 'organic']

interface DealForm {
  title: string
  stage: string
  value: string
  close_date: string
  probability: string
  source: string
}

const EMPTY: DealForm = { title: '', stage: 'prospecting', value: '', close_date: '', probability: '', source: '' }

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState<DealForm>(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    apiFetch(`/api/admin-data?action=get&entity=items&id=${id}`)
      .then(r => r.json())
      .then(raw => {
        const json = raw?.data ?? raw
        if (json) {
          setForm({
            title: json.title || '',
            stage: json.data?.stage || 'prospecting',
            value: json.data?.value?.toString() || '',
            close_date: json.data?.close_date || '',
            probability: json.data?.probability?.toString() || '',
            source: json.data?.source || '',
          })
        }
      })
      .catch(() => setError('Failed to load deal'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        type_slug: 'deal',
        data: {
          stage: form.stage,
          value: form.value ? Number(form.value) : null,
          close_date: form.close_date || null,
          probability: form.probability ? Number(form.probability) : null,
          source: form.source || null,
        },
      }
      let res: Response
      if (isNew) {
        res = await apiFetch('/api/admin-data?action=create&entity=items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        res = await apiFetch(`/api/admin-data?action=update&entity=items&id=${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }
      if (!res.ok) { const e = await res.json(); throw new Error(e?.error || 'Save failed') }
      const saved = await res.json()
      navigate(`/crm/deals/${isNew ? saved.id : id}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this deal?')) return
    await apiFetch(`/api/admin-data?action=delete&entity=items&id=${id}`, { method: 'POST' })
    navigate('/cortex/crm/deals')
  }

  const set = (field: keyof DealForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/cortex/crm/deals')} className="text-slate-400 hover:text-slate-700 text-sm">
          ← Deals
        </button>
        <h1 className="text-xl font-bold text-slate-900">{isNew ? 'New Deal' : 'Edit Deal'}</h1>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-slate-700 text-sm">Deal Info</h2>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={set('title')}
              placeholder="Deal name"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
              <select value={form.stage} onChange={set('stage')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
              <select value={form.source} onChange={set('source')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Select source —</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <h2 className="font-semibold text-slate-700 text-sm">Financials</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deal Value (USD)</label>
              <input
                type="number"
                value={form.value}
                onChange={set('value')}
                placeholder="0"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Probability %</label>
              <input
                type="number"
                value={form.probability}
                onChange={set('probability')}
                placeholder="0–100"
                min="0" max="100"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expected Close Date</label>
            <input
              type="date"
              value={form.close_date}
              onChange={set('close_date')}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        {!isNew ? (
          <button onClick={handleDelete} className="text-sm text-red-600 hover:text-red-700 hover:underline">
            Delete deal
          </button>
        ) : <div />}
        <div className="flex gap-3">
          <button onClick={() => navigate('/cortex/crm/deals')} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : isNew ? 'Create Deal' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
