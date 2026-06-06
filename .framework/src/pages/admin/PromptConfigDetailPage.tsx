/**
 * @module src/pages/admin/PromptConfigDetailPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Create / view / edit page for a single LLM prompt configuration.
 * Route param: `id` (UUID). Exposes `system_prompt`, `model`,
 * `temperature`, `max_tokens`, `prompt_type`, `category`, and
 * `is_default` as editable fields.
 *
 * @seeAlso src/pages/admin/PromptConfigsPage.tsx
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { ArrowLeft, FileText, AlertCircle } from 'lucide-react'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

interface PromptConfig {
  id: string
  name: string
  description?: string
  prompt_type: string
  category: string
  template: string
  variables: string[]
  model_config: Record<string, any>
  is_default: boolean
  is_active: boolean
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

const PROMPT_TYPES = [
  { value: 'system', label: 'System' },
  { value: 'user', label: 'User' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'function', label: 'Function' },
  { value: 'general', label: 'General' }
]

export function PromptConfigDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt_type: 'general',
    category: 'general',
    template: '',
    variables: '',
    model_config: '{}',
    is_default: false,
    is_active: true
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: config, loading, error } = useApi<PromptConfig>(
    async () => {
      if (isCreateMode) return null
      const response = await apiFetch(`/api/prompt-configs?action=get&id=${id}`)
      if (!response.ok) throw new Error('Failed to fetch')
      const result = await response.json()
      return result.data || result
    },
    { immediate: !isCreateMode }
  )

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name || '',
        description: config.description || '',
        prompt_type: config.prompt_type || 'general',
        category: config.category || 'general',
        template: config.template || '',
        variables: (config.variables || []).join(', '),
        model_config: JSON.stringify(config.model_config || {}, null, 2),
        is_default: config.is_default || false,
        is_active: config.is_active
      })
    }
  }, [config])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const body = {
        ...formData,
        variables: formData.variables.split(',').map(v => v.trim()).filter(Boolean),
        model_config: JSON.parse(formData.model_config)
      }
      const url = isCreateMode ? '/api/prompt-configs' : `/api/prompt-configs?id=${id}`
      const response = await apiFetch(url, {
        method: isCreateMode ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error('Failed to save')
      const result = await response.json()
      if (isCreateMode) { navigate(`/spine-framework/admin/configs/prompts/${result.config_id || result.id}`) } else { navigate(-1) }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load</AlertTitle>
        <AlertDescription>{String(error)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isCreateMode ? 'Create Prompt Config' : config?.name || 'Prompt Config'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.prompt_type} onValueChange={(v) => setFormData({ ...formData, prompt_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMPT_TYPES.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Variables</Label>
                <Input
                  value={formData.variables}
                  onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                  placeholder="var1, var2, var3"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.template}
              onChange={(e) => setFormData({ ...formData, template: e.target.value })}
              className="font-mono text-sm"
              rows={10}
              placeholder="Enter prompt template with {{variables}}"
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Config (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.model_config}
              onChange={(e) => setFormData({ ...formData, model_config: e.target.value })}
              className="font-mono text-sm"
              rows={6}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked === true })}
                />
                <Label htmlFor="is_default" className="text-sm">Default for type</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked === true })}
                />
                <Label htmlFor="is_active" className="text-sm">Active</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {!isCreateMode && config && (
          <Card>
            <CardHeader>
              <CardTitle>Info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(config.created_at)}</dd></div>
                <div><dt className="text-muted-foreground">Updated</dt><dd>{formatDateTime(config.updated_at)}</dd></div>
              </dl>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isCreateMode ? 'Create' : 'Update'}
          </Button>
        </div>
      </form>
    </div>
  )
}
