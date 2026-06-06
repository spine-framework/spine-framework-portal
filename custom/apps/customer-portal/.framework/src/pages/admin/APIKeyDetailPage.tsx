/**
 * @module src/pages/admin/APIKeyDetailPage
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
import { ArrowLeft, Key, RefreshCw, Trash2, AlertCircle, Copy, Check } from 'lucide-react'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

interface APIKey {
  id: string
  name: string
  key_type: 'public' | 'private'
  key_value?: string
  key_prefix: string
  is_active: boolean
  permissions?: Record<string, any>
  rate_limit: number
  expires_at?: string
  last_used_at?: string
  usage_count: number
  integration_id?: string
  metadata?: Record<string, any>
  created_by_person?: { id: string; full_name: string; email: string }
  created_at: string
  updated_at: string
}

const KEY_TYPE_OPTIONS = [
  { value: 'private', label: 'Private (Server-side)' },
  { value: 'public', label: 'Public (Client-side)' }
]

export function APIKeyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'

  const [formData, setFormData] = useState({
    name: '',
    key_type: 'private' as 'public' | 'private',
    key_prefix: 'sk_',
    rate_limit: 1000,
    expires_at: '',
    integration_id: '',
    permissions: {},
    metadata: {},
    is_active: true
  })
  const [permissionsJson, setPermissionsJson] = useState('{}')
  const [metadataJson, setMetadataJson] = useState('{}')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: apiKey, loading, error: fetchError } = useApi<APIKey>(
    async () => {
      if (isCreateMode) return null
      const response = await apiFetch(`/api/api-keys?action=get&id=${id}`)
      if (!response.ok) throw new Error('Failed to fetch API key')
      const result = await response.json()
      return result.data || result
    },
    { immediate: !isCreateMode }
  )

  useEffect(() => {
    if (apiKey) {
      setFormData({
        name: apiKey.name || '',
        key_type: apiKey.key_type || 'private',
        key_prefix: apiKey.key_prefix || 'sk_',
        rate_limit: apiKey.rate_limit || 1000,
        expires_at: apiKey.expires_at ? apiKey.expires_at.split('T')[0] : '',
        integration_id: apiKey.integration_id || '',
        permissions: apiKey.permissions || {},
        metadata: apiKey.metadata || {},
        is_active: apiKey.is_active
      })
      setPermissionsJson(JSON.stringify(apiKey.permissions || {}, null, 2))
      setMetadataJson(JSON.stringify(apiKey.metadata || {}, null, 2))
    }
  }, [apiKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      let permissions = {}
      let metadata = {}
      try { permissions = JSON.parse(permissionsJson) } catch {}
      try { metadata = JSON.parse(metadataJson) } catch {}
      const body = { ...formData, permissions, metadata }
      const response = await apiFetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error('Failed to create API key')
      const result = await response.json()
      setGeneratedKey(result.key_value || result.data?.key_value)
      setTimeout(() => navigate(`/spine-framework/admin/configs/api-keys/${result.id || result.data?.id}`), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
    </div>
  )

  if (fetchError) return (
    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Failed to load</AlertTitle><AlertDescription>{fetchError}</AlertDescription></Alert>
  )

  if (!isCreateMode && apiKey) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold">{apiKey.name}</h1>
        </div>
        <Card><CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Key Type</span><span>{apiKey.key_type}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Prefix</span><span>{apiKey.key_prefix}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Rate Limit</span><span>{apiKey.rate_limit}/min</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{apiKey.is_active ? 'Active' : 'Inactive'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Usage</span><span>{apiKey.usage_count} requests</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(apiKey.created_at)}</span></div>
          </div>
          <div className="mt-4"><span className="text-muted-foreground">Key Value</span><div className="mt-1 font-mono text-sm bg-muted p-3 rounded">{apiKey.key_value || '***'}</div></div>
        </CardContent></Card>
      </div>
    )
  }

  if (generatedKey) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">API Key Created</h1>
        <Alert><AlertCircle className="h-4 w-4" /><AlertTitle>Save this key now</AlertTitle><AlertDescription>You won't be able to see it again. Copy it now and store it securely.</AlertDescription></Alert>
        <Card><CardContent className="p-6">
          <div className="flex items-center gap-2"><code className="flex-1 bg-muted p-4 rounded font-mono text-lg">{generatedKey}</code><Button size="icon" onClick={handleCopy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div>
          <Button className="mt-4" onClick={() => navigate('/spine-framework/admin/configs/api-keys')}>Done</Button>
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">Create API Key</h1>
      </div>
      {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card><CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name *</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="e.g., Production API Key" /></div>
            <div className="space-y-2"><Label>Key Type</Label><Select value={formData.key_type} onValueChange={v => setFormData({...formData, key_type: v as 'public' | 'private'})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KEY_TYPE_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Prefix</Label><Input value={formData.key_prefix} onChange={e => setFormData({...formData, key_prefix: e.target.value})} placeholder="e.g., sk_" /></div>
            <div className="space-y-2"><Label>Rate Limit (requests/min)</Label><Input type="number" value={formData.rate_limit} onChange={e => setFormData({...formData, rate_limit: parseInt(e.target.value)})} min={1} max={10000} /></div>
            <div className="space-y-2"><Label>Expires At</Label><Input type="date" value={formData.expires_at} onChange={e => setFormData({...formData, expires_at: e.target.value})} /></div>
          </div>
          <div className="flex items-center gap-2"><Checkbox id="active" checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c === true})} /><Label htmlFor="active">Active</Label></div>
          <div className="space-y-2"><Label>Permissions (JSON)</Label><Textarea value={permissionsJson} onChange={e => setPermissionsJson(e.target.value)} rows={4} className="font-mono text-sm" placeholder='{"resources": ["read", "write"]}' /></div>
          <div className="space-y-2"><Label>Metadata (JSON)</Label><Textarea value={metadataJson} onChange={e => setMetadataJson(e.target.value)} rows={3} className="font-mono text-sm" placeholder='{"env": "production"}' /></div>
        </CardContent></Card>
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create API Key'}</Button></div>
      </form>
    </div>
  )
}
