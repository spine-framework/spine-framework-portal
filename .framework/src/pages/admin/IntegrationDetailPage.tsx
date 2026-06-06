/**
 * @module src/pages/admin/IntegrationDetailPage
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/badge'
import { ArrowLeft, Pencil, Trash2, CheckCircle, XCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/utils'

interface Integration {
  id: string
  name: string
  provider: string
  integration_type: 'webhook' | 'api' | 'database' | 'file' | 'custom'
  description?: string
  config: Record<string, any>
  is_active: boolean
  is_system?: boolean
  created_at: string
  updated_at: string
  account_id: string
  last_sync?: string
  sync_status?: 'success' | 'failed' | 'pending'
  error_message?: string
}

const INTEGRATION_TYPES = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'api', label: 'API' },
  { value: 'database', label: 'Database' },
  { value: 'file', label: 'File' },
  { value: 'custom', label: 'Custom' }
]

export function IntegrationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '', provider: '', integration_type: 'api' as const, description: '', config: '{}', is_active: true
  })

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchIntegration = async () => {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (!uuidRegex.test(id!)) throw new Error('Invalid ID format')
        const response = await apiFetch(`/api/integrations?action=get&id=${id}`)
        if (!response.ok) throw new Error(response.status === 500 ? 'Integration not found' : 'Failed to fetch integration')
        const result = await response.json()
        const data = result.data
        setIntegration(data)
        setFormData({
          name: data.name, provider: data.provider, integration_type: data.integration_type,
          description: data.description || '', config: JSON.stringify(data.config, null, 2), is_active: data.is_active
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load integration')
      } finally {
        setLoading(false)
      }
    }
    fetchIntegration()
  }, [id, isCreateMode])

  const handleSave = async () => {
    try {
      let parsedConfig = {}
      try { parsedConfig = JSON.parse(formData.config) } catch { throw new Error('Invalid JSON in config') }
      const url = isCreateMode ? '/api/integrations?action=create' : `/api/integrations?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, config: parsedConfig }) })
      if (!response.ok) throw new Error('Failed to save integration')
      if (isCreateMode) {
        const result = await response.json()
        navigate(`/spine-framework/admin/configs/integrations/${result.data?.id || result.id}`)
      } else {
        setIsEditing(false)
        const result = await response.json()
        setIntegration(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleDelete = async () => {
    try {
      const response = await apiFetch(`/api/integrations?action=delete&id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete')
      navigate('/spine-framework/admin/configs/integrations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
    </div>
  )

  if (error && !isCreateMode) return (
    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
  )

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'pending': return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/integrations') : navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold">{isCreateMode ? 'Create Integration' : integration?.name}</h1>
        </div>
        {!isCreateMode && !isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
            {!integration?.is_system && <Button variant="destructive" onClick={() => setIsDeleteModalOpen(true)}><Trash2 className="h-4 w-4 mr-2" />Delete</Button>}
          </div>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => isCreateMode ? navigate(-1) : setIsEditing(false)}>Cancel</Button>
            <Button onClick={handleSave}>{isCreateMode ? 'Create' : 'Save'}</Button>
          </div>
        )}
      </div>

      <Card><CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Basic Info</h3>
            <div className="space-y-2"><Label>Name</Label>{isEditing ? <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /> : <div className="text-sm">{integration?.name}</div>}</div>
            <div className="space-y-2"><Label>Provider</Label>{isEditing ? <Input value={formData.provider} onChange={e => setFormData({...formData, provider: e.target.value})} /> : <div className="text-sm">{integration?.provider}</div>}</div>
            <div className="space-y-2"><Label>Type</Label>{isEditing ? <Select value={formData.integration_type} onValueChange={v => setFormData({...formData, integration_type: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{INTEGRATION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select> : <Badge>{integration?.integration_type}</Badge>}</div>
            <div className="space-y-2"><Label>Active</Label>{isEditing ? <div className="flex items-center gap-2"><Checkbox id="active" checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c === true})} /><Label htmlFor="active">Enabled</Label></div> : <div className="text-sm">{integration?.is_active ? 'Yes' : 'No'}</div>}</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Sync Status</h3>
            {!isCreateMode && (
              <>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Status</span><div className="flex items-center gap-2">{getStatusIcon(integration?.sync_status)}<span className="text-sm capitalize">{integration?.sync_status || '—'}</span></div></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Last Sync</span><span className="text-sm">{integration?.last_sync ? formatDateTime(integration.last_sync) : '—'}</span></div>
              </>
            )}
            <div className="space-y-2"><Label>Description</Label>{isEditing ? <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} /> : <div className="text-sm">{integration?.description || '—'}</div>}</div>
          </div>
        </div>
        <div className="mt-6 space-y-2"><Label>Configuration (JSON)</Label>{isEditing ? <Textarea value={formData.config} onChange={e => setFormData({...formData, config: e.target.value})} rows={8} className="font-mono text-sm" /> : <pre className="text-sm bg-muted p-3 rounded overflow-auto">{JSON.stringify(integration?.config || {}, null, 2)}</pre>}</div>
      </CardContent></Card>

      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Integration" description="Are you sure you want to delete this integration?" size="sm">
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button><Button variant="destructive" onClick={handleDelete}>Delete</Button></div>
      </Modal>
    </div>
  )
}
