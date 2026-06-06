import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '@core/lib/api'
import { Button } from '@core/components/ui/button'
import { Badge } from '@core/components/ui/badge'
import { ScrollArea } from '@core/components/ui/scroll-area'
import { Textarea } from '@core/components/ui/textarea'
import { Input } from '@core/components/ui/input'
import { Label } from '@core/components/ui/label'
import { Checkbox } from '@core/components/ui/checkbox'
import { ArrowLeft, AlertCircle, EyeOff, Eye, CheckCircle, BookOpen, AlertTriangle } from 'lucide-react'

interface RedactionSuggestion {
  id: string
  start_index: number
  end_index: number
  original_text: string
  redacted_text: string
  sensitivity_level: 'high' | 'medium' | 'low'
  reasoning: string
  category: 'pii' | 'confidential' | 'account_specific' | 'internal_reference'
}

interface RedactionAnalysis {
  original_content: string
  redacted_content: string
  suggestions: RedactionSuggestion[]
  confidence_score: number
  processing_metadata: {
    model_used: string
    temperature: number
    tokens_consumed: number
  }
}

interface Ticket {
  id: string
  title: string
  description?: string
  data?: {
    ai_metadata?: {
      problem_statement?: string
      solution_path?: string
    }
    postmortem?: {
      kb_draft_id?: string
    }
  }
}

const SENSITIVITY_COLORS = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
}

const SENSITIVITY_ICONS = {
  high: AlertCircle,
  medium: AlertTriangle,
  low: EyeOff,
}

function parseContentWithRedactions(content: string, suggestions: RedactionSuggestion[]): (string | RedactionSuggestion)[] {
  if (!suggestions.length) return [content]

  const parts: (string | RedactionSuggestion)[] = []
  let lastIndex = 0

  // Sort by start index
  const sorted = [...suggestions].sort((a, b) => a.start_index - b.start_index)

  for (const suggestion of sorted) {
    if (suggestion.start_index > lastIndex) {
      parts.push(content.slice(lastIndex, suggestion.start_index))
    }
    parts.push(suggestion)
    lastIndex = suggestion.end_index
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

export default function RedactionReview() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [analysis, setAnalysis] = useState<RedactionAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<string>>(new Set())
  const [rejectedSuggestions, setRejectedSuggestions] = useState<Set<string>>(new Set())
  const [customRedactions, setCustomRedactions] = useState<RedactionSuggestion[]>([])
  const [newRedaction, setNewRedaction] = useState({ text: '', reason: '', level: 'medium' as const })
  const [finalContent, setFinalContent] = useState('')
  const [articleTitle, setArticleTitle] = useState('')
  const [viewMode, setViewMode] = useState<'review' | 'final'>('review')

  // Load ticket and trigger redaction analysis
  useEffect(() => {
    if (!id) return

    const loadAndAnalyze = async () => {
      setLoading(true)
      try {
        // Load ticket
        const tRes = await apiFetch(`/api/admin-data?action=get&entity=items&id=${id}`).then(r => r.json())
        const ticketData = tRes?.data ?? tRes ?? null
        setTicket(ticketData)

        // Generate article title from ticket
        if (ticketData?.title) {
          setArticleTitle(`KB: ${ticketData.title}`)
        }

        // Trigger redaction analysis via AI agent
        const analysisRes = await apiFetch('/api/ai-agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'run_redaction_analysis',
            ticket_id: id,
            content: buildContentForAnalysis(ticketData),
          }),
        }).then(r => r.json())

        if (analysisRes?.analysis) {
          setAnalysis(analysisRes.analysis)
          // Initially accept all high-sensitivity suggestions
          const autoAccept = new Set(
            analysisRes.analysis.suggestions
              .filter((s: RedactionSuggestion) => s.sensitivity_level === 'high')
              .map((s: RedactionSuggestion) => s.id)
          )
          setAcceptedSuggestions(autoAccept)
          updateFinalContent(analysisRes.analysis, autoAccept, new Set(), [])
        }
      } catch (err) {
        console.error('Failed to analyze:', err)
      } finally {
        setLoading(false)
      }
    }

    loadAndAnalyze()
  }, [id])

  // Build content from ticket for analysis
  function buildContentForAnalysis(ticket: Ticket): string {
    const parts: string[] = []
    if (ticket.title) parts.push(`Title: ${ticket.title}`)
    if (ticket.description) parts.push(`Description: ${ticket.description}`)
    if (ticket.data?.ai_metadata?.problem_statement) {
      parts.push(`Problem: ${ticket.data.ai_metadata.problem_statement}`)
    }
    if (ticket.data?.ai_metadata?.solution_path) {
      parts.push(`Solution: ${ticket.data.ai_metadata.solution_path}`)
    }
    return parts.join('\n\n')
  }

  // Update final content based on accepted/rejected suggestions
  const updateFinalContent = useCallback((
    analysis: RedactionAnalysis | null,
    accepted: Set<string>,
    rejected: Set<string>,
    custom: RedactionSuggestion[]
  ) => {
    if (!analysis) return

    let content = analysis.original_content

    // Get all accepted redactions (both AI and custom), sorted by position (reverse)
    const allAccepted = [
      ...analysis.suggestions.filter(s => accepted.has(s.id) && !rejected.has(s.id)),
      ...custom.filter(c => !rejected.has(c.id)),
    ].sort((a, b) => b.start_index - a.start_index)

    // Apply redactions from end to start to preserve indices
    for (const redaction of allAccepted) {
      content = content.slice(0, redaction.start_index) + redaction.redacted_text + content.slice(redaction.end_index)
    }

    setFinalContent(content)
  }, [])

  // Toggle suggestion acceptance
  const toggleSuggestion = (suggestionId: string) => {
    const newAccepted = new Set(acceptedSuggestions)
    const newRejected = new Set(rejectedSuggestions)

    if (newAccepted.has(suggestionId)) {
      newAccepted.delete(suggestionId)
      newRejected.add(suggestionId)
    } else {
      newAccepted.add(suggestionId)
      newRejected.delete(suggestionId)
    }

    setAcceptedSuggestions(newAccepted)
    setRejectedSuggestions(newRejected)
    updateFinalContent(analysis, newAccepted, newRejected, customRedactions)
  }

  // Add custom redaction
  const addCustomRedaction = () => {
    if (!newRedaction.text || !analysis) return

    const startIndex = analysis.original_content.indexOf(newRedaction.text)
    if (startIndex === -1) return

    const customRedaction: RedactionSuggestion = {
      id: `custom-${Date.now()}`,
      start_index: startIndex,
      end_index: startIndex + newRedaction.text.length,
      original_text: newRedaction.text,
      redacted_text: '[REDACTED]',
      sensitivity_level: newRedaction.level,
      reasoning: newRedaction.reason || 'Manually added',
      category: 'account_specific',
    }

    const newCustom = [...customRedactions, customRedaction]
    setCustomRedactions(newCustom)
    setAcceptedSuggestions(new Set([...acceptedSuggestions, customRedaction.id]))
    setNewRedaction({ text: '', reason: '', level: 'medium' })
    updateFinalContent(analysis, acceptedSuggestions, rejectedSuggestions, newCustom)
  }

  // Publish KB article
  const publishKB = async () => {
    if (!id || !finalContent || !articleTitle) return

    setProcessing(true)
    try {
      // Create KB article
      const kbRes = await apiFetch('/api/admin-data?action=create&entity=items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_id: 'ce1e50b6-473e-4581-ba0c-e944f47cb240',
          title: articleTitle,
          status: 'published',
          description: finalContent,
          data: {
            kb_type: 'article',
            priority: 'medium',
            security_level: 'internal',
            source_info: {
              source_type: 'redaction_review',
              source_ticket_id: id,
              redaction_review: {
                ai_confidence: analysis?.confidence_score,
                accepted_redactions: acceptedSuggestions.size,
                rejected_redactions: rejectedSuggestions.size,
                custom_redactions: customRedactions.length,
              },
            },
          },
        }),
      }).then(r => r.json())

      if (kbRes?.id || kbRes?.data?.id) {
        const kbId = kbRes.id || kbRes.data.id

        // Update ticket with KB reference
        await apiFetch(`/api/admin-data?action=update&entity=items&id=${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              ...ticket?.data,
              postmortem: {
                ...ticket?.data?.postmortem,
                kb_generated: true,
                kb_draft_id: kbId,
              },
            },
          }),
        })

        navigate(`/cortex/kb/${kbId}`)
      }
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-amber-600 mb-4">
          <AlertTriangle className="h-5 w-5" />
          <p>Failed to analyze content for redaction. Please try again.</p>
        </div>
        <Button onClick={() => navigate(`/cortex/support/${id}`)}>Back to Ticket</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/cortex/support/${id}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-600" />
                KB Article Redaction Review
              </h1>
              <p className="text-xs text-muted-foreground">Review AI suggestions before publishing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'review' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('review')}
            >
              <Eye className="h-4 w-4 mr-1" />
              Review
            </Button>
            <Button
              variant={viewMode === 'final' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('final')}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Final
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {viewMode === 'review' ? (
          <>
            {/* Left: Content with Redactions */}
            <div className="flex-1 min-w-0 border-r border-border">
              <ScrollArea className="h-full p-6">
                <div className="space-y-6">
                  {/* Title Input */}
                  <div className="space-y-2">
                    <Label>Article Title</Label>
                    <Input
                      value={articleTitle}
                      onChange={e => setArticleTitle(e.target.value)}
                      placeholder="KB Article Title"
                    />
                  </div>

                  {/* Content Preview */}
                  <div className="space-y-2">
                    <Label>Content Preview</Label>
                    <div className="border rounded-lg p-4 bg-white whitespace-pre-wrap text-sm leading-relaxed">
                      {parseContentWithRedactions(
                        analysis.original_content,
                        analysis.suggestions.filter(s => acceptedSuggestions.has(s.id))
                      ).map((part, i) => {
                        if (typeof part === 'string') {
                          return <span key={i}>{part}</span>
                        }
                        return (
                          <mark
                            key={i}
                            className={`px-1 rounded ${
                              part.sensitivity_level === 'high'
                                ? 'bg-red-200'
                                : part.sensitivity_level === 'medium'
                                  ? 'bg-yellow-200'
                                  : 'bg-blue-200'
                            }`}
                            title={part.reasoning}
                          >
                            {part.redacted_text}
                          </mark>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom Redaction */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label>Add Custom Redaction</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newRedaction.text}
                        onChange={e => setNewRedaction({ ...newRedaction, text: e.target.value })}
                        placeholder="Text to redact"
                        className="flex-1"
                      />
                      <select
                        value={newRedaction.level}
                        onChange={e => setNewRedaction({ ...newRedaction, level: e.target.value as 'high' | 'medium' | 'low' })}
                        className="border rounded px-2 text-sm"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <Input
                      value={newRedaction.reason}
                      onChange={e => setNewRedaction({ ...newRedaction, reason: e.target.value })}
                      placeholder="Reason for redaction"
                    />
                    <Button onClick={addCustomRedaction} size="sm">
                      Add Redaction
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Right: Suggestions List */}
            <div className="w-96 shrink-0 flex flex-col">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-sm font-medium">Redaction Suggestions</p>
                <p className="text-xs text-muted-foreground">
                  {acceptedSuggestions.size} accepted · {rejectedSuggestions.size} rejected
                </p>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {analysis.suggestions.map(suggestion => {
                    const isAccepted = acceptedSuggestions.has(suggestion.id)
                    const isRejected = rejectedSuggestions.has(suggestion.id)
                    const Icon = SENSITIVITY_ICONS[suggestion.sensitivity_level]

                    return (
                      <div
                        key={suggestion.id}
                        className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                          isAccepted
                            ? 'border-green-300 bg-green-50'
                            : isRejected
                              ? 'border-gray-300 bg-gray-50 opacity-50'
                              : 'border-amber-300 bg-amber-50'
                        }`}
                        onClick={() => toggleSuggestion(suggestion.id)}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox checked={isAccepted} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant="outline"
                                className={`text-xs ${SENSITIVITY_COLORS[suggestion.sensitivity_level]}`}
                              >
                                <Icon className="h-3 w-3 mr-1" />
                                {suggestion.sensitivity_level}
                              </Badge>
                              <span className="text-xs text-muted-foreground uppercase">{suggestion.category}</span>
                            </div>
                            <p className="text-sm font-mono truncate">"{suggestion.original_text}"</p>
                            <p className="text-xs text-muted-foreground mt-1">→ "{suggestion.redacted_text}"</p>
                            <p className="text-xs text-muted-foreground mt-2 italic">{suggestion.reasoning}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {customRedactions.map(redaction => (
                    <div
                      key={redaction.id}
                      className={`border rounded-lg p-3 border-purple-300 bg-purple-50 ${
                        rejectedSuggestions.has(redaction.id) ? 'opacity-50' : ''
                      }`}
                      onClick={() => {
                        const newRejected = new Set(rejectedSuggestions)
                        if (newRejected.has(redaction.id)) {
                          newRejected.delete(redaction.id)
                        } else {
                          newRejected.add(redaction.id)
                        }
                        setRejectedSuggestions(newRejected)
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox checked={!rejectedSuggestions.has(redaction.id)} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <Badge variant="outline" className="text-xs">
                            Custom
                          </Badge>
                          <p className="text-sm font-mono mt-1 truncate">"{redaction.original_text}"</p>
                          <p className="text-xs text-muted-foreground mt-1">{redaction.reasoning}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Action Bar */}
              <div className="border-t p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">AI Confidence</span>
                  <span className="font-medium">{Math.round(analysis.confidence_score * 100)}%</span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setViewMode('final')}
                  disabled={!articleTitle}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Preview Final
                </Button>
              </div>
            </div>
          </>
        ) : (
          // Final Preview Mode
          <div className="flex-1 min-w-0">
            <ScrollArea className="h-full p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">{articleTitle}</h2>
                  <p className="text-sm text-muted-foreground">
                    Generated from support ticket · {acceptedSuggestions.size} redactions applied
                  </p>
                </div>

                <div className="prose prose-sm max-w-none whitespace-pre-wrap border rounded-lg p-6 bg-white">
                  {finalContent}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setViewMode('review')}>
                    Back to Review
                  </Button>
                  <Button onClick={publishKB} disabled={processing || !articleTitle}>
                    {processing ? 'Publishing...' : 'Publish KB Article'}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  )
}
