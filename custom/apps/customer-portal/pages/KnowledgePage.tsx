import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useKBArticles, useKBArticle } from '../hooks/useKBArticles'
import { usePortalSignal } from '../hooks/usePortalSignal'
import { SearchFilterBar } from '../components/SearchFilterBar'
import { Skeleton } from '@core/components/ui/skeleton'
import { ScrollArea } from '@core/components/ui/scroll-area'

export function KnowledgePage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { articles, loading: listLoading, error } = useKBArticles(debouncedSearch)
  const { article, loading: detailLoading } = useKBArticle(selectedId)
  const { sendSignal } = usePortalSignal()

  const handleSelectArticle = (id: string) => {
    setSelectedId(id)
    sendSignal('kb_article_read', 'Read KB article')
  }

  const handleSearchChange = (val: string) => {
    setSearch(val)
    clearTimeout((handleSearchChange as any)._t)
    ;(handleSearchChange as any)._t = setTimeout(() => {
      setDebouncedSearch(val)
      if (val.trim().length > 1) sendSignal('kb_search', `Searched KB: ${val.trim()}`)
    }, 300)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
        <SearchFilterBar placeholder="Search articles…" value={search} onChange={handleSearchChange} />
      </div>

      {error && <div className="px-4 py-2 text-sm text-destructive border-b border-border shrink-0">{error}</div>}

      <div className="flex flex-1 min-h-0">
        {/* Col 1 — article list */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            {listLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : articles.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No articles found.</div>
            ) : (
              articles.map((a) => (
                <button key={a.id} onClick={() => handleSelectArticle(a.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors ${
                    selectedId === a.id ? 'bg-accent border-l-2 border-l-primary' : ''
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${selectedId === a.id ? 'text-primary' : ''}`}>{a.title}</p>
                  {a.data?.kb_type && (
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded mt-0.5 inline-block">
                      {a.data.kb_type.replace(/_/g, ' ')}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Col 2 — article content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <BookOpen size={32} className="opacity-30" />
              <p className="text-sm">Select an article to read</p>
            </div>
          ) : detailLoading ? (
            <div className="p-6 space-y-4 max-w-2xl">
              <Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" />
            </div>
          ) : !article ? (
            <div className="p-6 text-sm text-muted-foreground">Article not found.</div>
          ) : (
            <>
              <div className="px-6 py-3 border-b border-border shrink-0">
                <h1 className="text-base font-semibold">{article.title}</h1>
              </div>
              <ScrollArea className="flex-1">
                <div className="px-6 py-5 max-w-2xl">
                  {article.description ? (
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded prose-pre:text-xs prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono"
                      dangerouslySetInnerHTML={{ __html: article.description }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No content available.</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* Col 3 — related articles */}
        {selectedId && article && (
          <div className="w-72 shrink-0 border-l border-border flex flex-col min-h-0">
            <div className="flex items-center px-4 py-2 h-9 border-b border-border shrink-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Related</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {articles.filter((a) => a.id !== selectedId).slice(0, 6).map((a) => (
                <button key={a.id} onClick={() => handleSelectArticle(a.id)}
                  className="w-full text-left px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  {a.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>}
                </button>
              ))}
              {articles.filter((a) => a.id !== selectedId).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No other articles.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
