import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { RichTextEditor } from '@core/components/ui/RichTextEditor'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Plus, BookOpen, Edit } from 'lucide-react'

interface Article {
  id: string
  title: string
  description?: string
  status?: string
  data?: Record<string, any>
  created_at: string
}

const STATUS_GROUPS: { key: string; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Under Review' },
  { key: 'published', label: 'Published' },
  { key: 'deprecated', label: 'Deprecated' },
  { key: 'archived', label: 'Archived' },
  { key: 'restricted', label: 'Restricted' },
]

const KB_TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  care_guide: 'Care Guide',
  process_guide: 'Process Guide',
  code_chunk: 'Code',
  api_reference: 'API Ref',
  troubleshooting: 'Troubleshooting',
  faq: 'FAQ',
  policy: 'Policy',
  tutorial: 'Tutorial',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'secondary',
  medium: 'secondary',
  high: 'default',
  critical: 'destructive',
  emergency: 'destructive',
}

export default function KBPage() {
  const navigate = useNavigate()
  const [articles, setArticles] = useState<Article[]>([])
  const [searchResults, setSearchResults] = useState<Article[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Article | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Load all articles on mount
  useEffect(() => {
    apiFetch('/api/admin-data?action=list&entity=items&type_slug=kb_article&limit=500')
      .then(r => r.json())
      .then(j => setArticles(Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false))
  }, [])

  // Debounced vector search
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults(null); return }
    setSearching(true)
    try {
      const res = await apiFetch('/api/custom_kb-embeddings?action=search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), limit: 15 }),
      })
      const json = await res.json()
      const results = json.data || json || []
      setSearchResults(Array.isArray(results) ? results : [])
    } catch {
      setSearchResults(null) // Fall back to client-side filter
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout(debounceRef.current)
    if (!val || val.trim().length < 2) {
      setSearchResults(null)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(val), 400)
  }

  // Use vector results when available, otherwise client-side filter
  const displayArticles = searchResults ?? articles
  const filtered = displayArticles.filter(a => {
    const matchesStatus = statusFilter === 'all' || (a.status || 'draft') === statusFilter
    return matchesStatus
  })

  const grouped = STATUS_GROUPS.map(sg => ({
    ...sg,
    items: filtered.filter(a => (a.status || 'draft') === sg.key),
  })).filter(g => g.items.length > 0)

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Input
            placeholder="Search articles…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="flex-1 h-8"
          />
          <Button size="sm" className="gap-1 shrink-0" onClick={() => navigate('/cortex/kb/new')}>
            <Plus size={14} /> New
          </Button>
        </div>

        {/* Status filter */}
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-border shrink-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${statusFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            All
          </button>
          {STATUS_GROUPS.map(sg => (
            <button
              key={sg.key}
              onClick={() => setStatusFilter(sg.key)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${statusFilter === sg.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {sg.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{search ? 'No articles match.' : 'No articles yet.'}</p>
              <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={() => navigate('/cortex/kb/new')}>
                <Plus size={13} /> Create article
              </Button>
            </div>
          ) : (
            <div>
              {grouped.map(group => (
                <div key={group.key}>
                  <p className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {group.label} ({group.items.length})
                  </p>
                  {group.items.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setSelected(a)}
                      className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${selected?.id === a.id ? 'bg-accent border-l-2 border-l-primary' : ''}`}
                    >
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {a.data?.kb_type && (
                          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            {KB_TYPE_LABELS[a.data.kb_type] || a.data.kb_type}
                          </span>
                        )}
                        {a.data?.priority && a.data.priority !== 'medium' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${a.data.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : a.data.priority === 'critical' || a.data.priority === 'emergency' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-muted text-muted-foreground'}`}>
                            {a.data.priority}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right preview panel */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <BookOpen size={32} className="opacity-30" />
            <p className="text-sm">Select an article to preview</p>
            <Button size="sm" variant="outline" onClick={() => navigate('/cortex/kb/new')} className="gap-1">
              <Plus size={13} /> New article
            </Button>
          </div>
        ) : (
          <>
            <div className="px-6 py-3 border-b border-border shrink-0 flex items-center justify-between">
              <div>
                <h1 className="text-base font-semibold">{selected.title}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={selected.status === 'published' ? 'default' : 'outline'}>
                    {selected.status || 'draft'}
                  </Badge>
                  {selected.data?.kb_type && (
                    <Badge variant="secondary" className="text-xs">
                      {KB_TYPE_LABELS[selected.data.kb_type] || selected.data.kb_type}
                    </Badge>
                  )}
                  {selected.data?.priority && (
                    <Badge
                      variant={(PRIORITY_COLORS[selected.data.priority] as any) || 'secondary'}
                      className="text-xs"
                    >
                      {selected.data.priority}
                    </Badge>
                  )}
                  {selected.data?.category && (
                    <span className="text-xs text-muted-foreground">{selected.data.category}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 shrink-0"
                onClick={() => navigate(`/cortex/kb/${selected.id}/edit`)}
              >
                <Edit size={13} /> Edit
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-6 py-5 max-w-3xl">
                {selected.description ? (
                  <RichTextEditor value={selected.description} readonly />
                ) : (
                  <p className="text-sm text-muted-foreground italic">No content yet. Click Edit to add content.</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
