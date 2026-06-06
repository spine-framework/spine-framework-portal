import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { RichTextEditor } from '@core/components/ui/RichTextEditor'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Label } from '@core/components/ui/label'
import { Skeleton } from '@core/components/ui/skeleton'
import { ArrowLeft, Save } from 'lucide-react'

interface ArticleForm {
  title: string
  description: string
  status: string
  kb_type: string
  priority: string
  category: string
  security_level: string
  tags: string
  audience: string[]
}

const EMPTY: ArticleForm = {
  title: '',
  description: '',
  status: 'draft',
  kb_type: 'article',
  priority: 'medium',
  category: '',
  security_level: 'internal',
  tags: '',
  audience: [],
}

const AUDIENCE_OPTIONS = [
  { value: 'end_user', label: 'End User' },
  { value: 'support_agent', label: 'Support Agent' },
  { value: 'developer', label: 'Developer' },
  { value: 'admin', label: 'Administrator' },
  { value: 'manager', label: 'Manager' },
  { value: 'ai_system', label: 'AI System' },
  { value: 'internal_only', label: 'Internal Only' },
]

function SidebarSelect({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-border rounded px-2.5 py-1.5 text-sm bg-background"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export default function KBEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const [form, setForm] = useState<ArticleForm>(EMPTY)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    apiFetch(`/api/admin-data?action=get&entity=items&id=${id}`)
      .then(r => r.json())
      .then(raw => {
        const j = raw?.data ?? raw
        if (j) setForm({
          title: j.title || '',
          description: j.description || '',
          status: j.status || 'draft',
          kb_type: j.data?.kb_type || 'article',
          priority: j.data?.priority || 'medium',
          category: j.data?.category || '',
          security_level: j.data?.security_level || 'internal',
          tags: (() => { const t = j.data?.tags; if (Array.isArray(t)) return t.join(', '); if (typeof t === 'string') { try { const p = JSON.parse(t); return Array.isArray(p) ? p.join(', ') : t } catch { return t } } return '' })(),
          audience: Array.isArray(j.data?.audience) ? j.data.audience : [],
        })
      })
      .catch(() => setError('Failed to load article'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const handleSave = async (publish?: boolean) => {
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.kb_type) { setError('KB Type is required'); return }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description,
        type_id: 'ce1e50b6-473e-4581-ba0c-e944f47cb240',
        status: publish ? 'published' : form.status,
        data: {
          kb_type: form.kb_type,
          priority: form.priority,
          category: form.category.trim() || null,
          security_level: form.security_level,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          audience: form.audience,
        },
      }
      let res: Response
      if (isNew) {
        res = await apiFetch('/api/admin-data?action=create&entity=items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await apiFetch(`/api/admin-data?entity=items&id=${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) { const e = await res.clone().json().catch(() => ({})); throw new Error(e?.error || 'Save failed') }

      // Auto-generate embeddings for the saved article
      const saved = await res.json().catch(() => null)
      const itemId = isNew ? (saved?.id || saved?.data?.id) : id
      if (itemId) {
        try {
          await apiFetch('/api/custom_kb-embeddings?action=generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              item_ids: [itemId],
              vector_types: ['semantic', 'structure'],
              force_regenerate: true,
            }),
          })
        } catch (embErr) {
          console.warn('Embedding generation failed (article saved successfully):', embErr)
        }
      }

      navigate('/cortex/kb')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleAudience = (val: string) => {
    setForm(f => ({
      ...f,
      audience: f.audience.includes(val) ? f.audience.filter(a => a !== val) : [...f.audience, val],
    }))
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => navigate('/cortex/kb')}>
            <ArrowLeft className="h-3.5 w-3.5" /> KB
          </Button>
          <h1 className="text-base font-semibold">{isNew ? 'New Article' : 'Edit Article'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> Save
          </Button>
          <Button size="sm" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Publish'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-destructive/10 border border-destructive/20 text-destructive rounded text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Main content area */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Article title"
              className="text-lg font-medium"
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label>Content *</Label>
            <RichTextEditor
              value={form.description}
              onChange={html => setForm(f => ({ ...f, description: html }))}
              placeholder="Write your article content here…"
              minHeight="400px"
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-64 shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto">
          <SidebarSelect
            label="Status"
            value={form.status}
            onChange={v => setForm(f => ({ ...f, status: v }))}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'review', label: 'Under Review' },
              { value: 'published', label: 'Published' },
              { value: 'deprecated', label: 'Deprecated' },
              { value: 'archived', label: 'Archived' },
              { value: 'restricted', label: 'Restricted Access' },
            ]}
          />
          <SidebarSelect
            label="KB Type *"
            value={form.kb_type}
            onChange={v => setForm(f => ({ ...f, kb_type: v }))}
            options={[
              { value: 'article', label: 'Article' },
              { value: 'care_guide', label: 'Care Guide' },
              { value: 'process_guide', label: 'Process Guide' },
              { value: 'code_chunk', label: 'Code Chunk' },
              { value: 'api_reference', label: 'API Reference' },
              { value: 'troubleshooting', label: 'Troubleshooting' },
              { value: 'faq', label: 'FAQ' },
              { value: 'policy', label: 'Policy' },
              { value: 'tutorial', label: 'Tutorial' },
            ]}
          />
          <SidebarSelect
            label="Priority *"
            value={form.priority}
            onChange={v => setForm(f => ({ ...f, priority: v }))}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'critical', label: 'Critical' },
              { value: 'emergency', label: 'Emergency' },
            ]}
          />
          <SidebarSelect
            label="Category"
            value={form.category}
            onChange={v => setForm(f => ({ ...f, category: v }))}
            options={[
              { value: '', label: '— None —' },
              { value: 'getting_started', label: 'Getting Started' },
              { value: 'user_guide', label: 'User Guide' },
              { value: 'technical', label: 'Technical' },
              { value: 'billing', label: 'Billing' },
              { value: 'security', label: 'Security' },
              { value: 'integration', label: 'Integration' },
              { value: 'troubleshooting', label: 'Troubleshooting' },
              { value: 'reference', label: 'Reference' },
              { value: 'best_practices', label: 'Best Practices' },
              { value: 'policies', label: 'Policies' },
            ]}
          />
          <SidebarSelect
            label="Security Level"
            value={form.security_level}
            onChange={v => setForm(f => ({ ...f, security_level: v }))}
            options={[
              { value: 'public', label: 'Public' },
              { value: 'internal', label: 'Internal' },
              { value: 'confidential', label: 'Confidential' },
              { value: 'restricted', label: 'Restricted' },
            ]}
          />

          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <Input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="tag1, tag2, tag3"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">Comma-separated</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <div className="space-y-1">
              {AUDIENCE_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.audience.includes(opt.value)}
                    onChange={() => toggleAudience(opt.value)}
                    className="rounded border-border"
                  />
                  <span className="text-xs">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
