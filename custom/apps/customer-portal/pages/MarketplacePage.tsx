import { useState } from 'react'
import { Search, Zap, BarChart3, Plug, Brain, MessageSquare, FileText, X } from 'lucide-react'
import { Input } from '@core/components/ui/input'
import { Badge } from '@core/components/ui/badge'
import { Button } from '@core/components/ui/button'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@core/components/ui/dialog'
import { Separator } from '@core/components/ui/separator'

interface Plugin {
  id: string
  name: string
  tagline: string
  description: string
  category: string
  version: string
  author: string
  icon: React.ElementType
  tags: string[]
}

const MOCK_PLUGINS: Plugin[] = [
  {
    id: '1',
    name: 'AI Answer Engine',
    tagline: 'Automatically answer tickets with AI',
    description: 'Uses your knowledge base to draft answers for incoming tickets, reducing first-response time by up to 70%. Integrates directly with the Tickets module.',
    category: 'AI',
    version: '2.1.0',
    author: 'Spine Labs',
    icon: Brain,
    tags: ['tickets', 'automation', 'ai'],
  },
  {
    id: '2',
    name: 'Analytics Dashboard',
    tagline: 'Insights into support and engagement',
    description: 'Track ticket volume, resolution times, community activity, and course completion rates in a single dashboard with exportable reports.',
    category: 'Analytics',
    version: '1.4.2',
    author: 'Spine Labs',
    icon: BarChart3,
    tags: ['analytics', 'reporting'],
  },
  {
    id: '3',
    name: 'Slack Integration',
    tagline: 'Get ticket and community alerts in Slack',
    description: 'Receive real-time notifications for new tickets, replies, and community posts directly in your Slack workspace. Supports custom channel routing.',
    category: 'Integrations',
    version: '3.0.1',
    author: 'Community',
    icon: MessageSquare,
    tags: ['slack', 'notifications', 'integrations'],
  },
  {
    id: '4',
    name: 'Smart KB Generator',
    tagline: 'Turn resolved tickets into KB articles',
    description: 'Automatically drafts knowledge base articles from resolved support tickets using AI. Review, edit, and publish with one click.',
    category: 'AI',
    version: '1.2.0',
    author: 'Spine Labs',
    icon: FileText,
    tags: ['kb', 'ai', 'automation'],
  },
  {
    id: '5',
    name: 'Zapier Connector',
    tagline: 'Connect to 5000+ apps via Zapier',
    description: 'Trigger Zaps from ticket events, community posts, and course completions. Send data to CRMs, project management tools, and more.',
    category: 'Integrations',
    version: '2.0.0',
    author: 'Community',
    icon: Zap,
    tags: ['zapier', 'integrations', 'automation'],
  },
  {
    id: '6',
    name: 'Custom Webhooks',
    tagline: 'Push events to any endpoint',
    description: 'Configure webhooks for any portal event — new tickets, status changes, new community posts, course completions — and push to any HTTP endpoint.',
    category: 'Productivity',
    version: '1.0.3',
    author: 'Spine Labs',
    icon: Plug,
    tags: ['webhooks', 'integrations', 'developer'],
  },
]

const CATEGORIES = ['All', 'AI', 'Analytics', 'Integrations', 'Productivity']

const CATEGORY_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  AI: 'default',
  Analytics: 'secondary',
  Integrations: 'outline',
  Productivity: 'outline',
}

export function MarketplacePage() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [selected, setSelected] = useState<Plugin | null>(null)

  const filtered = MOCK_PLUGINS.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.tagline.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.includes(search.toLowerCase()))
    const matchCategory = activeCategory === 'All' || p.category === activeCategory
    return matchSearch && matchCategory
  })

  return (
    <div className="flex flex-col min-h-full">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Marketplace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse plugins and integrations to extend your portal experience.
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search plugins…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={activeCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat)}
                className="h-8"
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{filtered.length} plugin{filtered.length !== 1 ? 's' : ''}</p>

        {/* Plugin grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No plugins match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((plugin) => {
              const Icon = plugin.icon
              return (
                <Card
                  key={plugin.id}
                  className="cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group"
                  onClick={() => setSelected(plugin)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{plugin.name}</p>
                        <Badge
                          variant={CATEGORY_VARIANT[plugin.category] ?? 'secondary'}
                          className="text-xs mt-0.5"
                        >
                          {plugin.category}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{plugin.tagline}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Plugin detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-md bg-primary/10 text-primary shrink-0">
                    <selected.icon size={22} />
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selected.name}</DialogTitle>
                    <Badge
                      variant={CATEGORY_VARIANT[selected.category] ?? 'secondary'}
                      className="text-xs mt-1"
                    >
                      {selected.category}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <p className="text-sm leading-relaxed">{selected.description}</p>

                <Separator />

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Version</p>
                    <p className="font-mono">{selected.version}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Author</p>
                    <p>{selected.author}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                <Button>Install Plugin</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
