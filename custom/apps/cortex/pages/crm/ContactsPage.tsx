import { useEffect, useState } from 'react'
import { apiFetch } from '@core/lib/api'

interface Person {
  id: string
  email: string
  first_name?: string
  last_name?: string
  account_id?: string
  created_at: string
}

export default function ContactsPage() {
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=people&limit=200')
      .then(r => r.json())
      .then(json => setPeople(Array.isArray(json?.data) ? json.data : json || []))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = people.filter(p => {
    const q = search.toLowerCase()
    return !q || p.email.toLowerCase().includes(q) ||
      (p.first_name || '').toLowerCase().includes(q) ||
      (p.last_name || '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contacts</h1>
          <p className="text-slate-500 text-sm mt-1">{people.length} contacts</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="w-72 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading contacts…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-right px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-12 text-center text-slate-400">
                    {search ? 'No contacts match your search.' : 'No contacts yet.'}
                  </td>
                </tr>
              ) : filtered.map(person => (
                <tr key={person.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {[person.first_name, person.last_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{person.email}</td>
                  <td className="px-5 py-3 text-right text-slate-400 text-xs">
                    {new Date(person.created_at).toLocaleDateString()}
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
