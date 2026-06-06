import { useState } from 'react'
import { resolveTypeId } from '../../lib/resolveTypeId'
import { apiFetch } from '@core/lib/api'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Button } from '@core/components/ui/button'
import { Input } from '@core/components/ui/input'
import { Textarea } from '@core/components/ui/textarea'
import { Label } from '@core/components/ui/label'
import { Badge } from '@core/components/ui/badge'
import { Separator } from '@core/components/ui/separator'

interface PortalItem {
  id: string
  title: string
  data?: Record<string, unknown>
}

interface KBGeneratorProps {
  ticket: PortalItem
  onGenerated?: (kbArticle: any) => void
  onCancel?: () => void
}

export function KBGenerator({ ticket, onGenerated, onCancel }: KBGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedArticle, setGeneratedArticle] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState('')

  const handleGenerate = async () => {
    if (!ticket.data?.content) return
    setIsGenerating(true)
    await new Promise((r) => setTimeout(r, 500))
    const article = { title: `How to: ${ticket.title}`, content: 'Generated content…', tags: ['support', 'how-to'], confidence: 0.87 }
    setGeneratedArticle(article)
    setEditedContent(article.content)
    setIsGenerating(false)
  }

  const handleSave = async () => {
    if (!generatedArticle) return
    try {
      const kbArticleTypeId = await resolveTypeId('kb_article')
      const res = await apiFetch('/.netlify/functions/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'items',
          type_id: kbArticleTypeId,
          title: generatedArticle.title,
          status: 'published',
          description: editedContent,
          data: {
            kb_type: 'article',
            priority: 'medium',
            security_level: 'internal',
            tags: generatedArticle.tags,
            source_info: {
              source_type: 'ai_generated',
              source_ticket_id: ticket.id,
            },
          },
        }),
      })
      const json = await res.json()
      onGenerated?.(json.data)
    } catch (err) {
      console.error('Error saving KB article:', err)
    }
  }

  const handleDiscard = () => {
    setGeneratedArticle(null)
    setEditedContent('')
    setIsEditing(false)
    onCancel?.()
  }

  if (!generatedArticle) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Generate Knowledge Base Article</h3>
            <Badge variant="secondary">AI Powered</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Source Ticket</p>
            <p>{ticket.title}</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !ticket.data?.content}
            >
              {isGenerating ? 'Generating…' : 'Generate KB Article'}
            </Button>
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Generated KB Article</h3>
          <Badge variant="secondary">{Math.round(generatedArticle.confidence * 100)}% Confidence</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={generatedArticle.title}
            onChange={(e) => setGeneratedArticle((prev: any) => ({ ...prev, title: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Content</Label>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? 'Preview' : 'Edit'}
            </Button>
          </div>
          {isEditing ? (
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={8}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-24">
              {editedContent}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {generatedArticle.tags.map((tag: string, i: number) => (
            <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
          ))}
        </div>

        <Separator />

        <div className="flex gap-2">
          <Button onClick={handleSave}>Publish to Knowledge Base</Button>
          <Button variant="outline" onClick={handleDiscard}>Discard</Button>
        </div>
      </CardContent>
    </Card>
  )
}
