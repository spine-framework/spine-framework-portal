/**
 * @module src/pages/admin/PipelineDetailPage
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
import { Badge } from '../../components/ui/badge'
import { ArrowLeft, Play, Pause, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/utils'

interface Pipeline {
  id: string
  name: string
  description?: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  steps: Array<{ id: string; name: string; type: string; config: Record<string, any> }>
  trigger_type: 'manual' | 'scheduled' | 'webhook' | 'event'
  schedule?: string
  is_active: boolean
  last_run?: string
  last_run_status?: 'success' | 'failed' | 'running'
  run_count: number
  created_at: string
  updated_at: string
}

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' }
]

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'event', label: 'Event' }
]

export function PipelineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formData, setFormData] = useState({ name: '', description: '', status: 'draft' as const, trigger_type: 'manual' as const, schedule: '', is_active: true, steps: [] as any[] })

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchPipeline = async () => {
      try {
        const response = await apiFetch(`/api/pipelines?action=get&id=${id}`)
        if (!response.ok) throw new Error('Failed to fetch pipeline')
        const result = await response.json()
        const data = result.data
        setPipeline(data)
        setFormData({
          name: data.name, description: data.description || '', status: data.status, trigger_type: data.trigger_type,
          schedule: data.schedule || '', is_active: data.is_active, steps: data.steps || []
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pipeline')
      } finally {
        setLoading(false)
      }
    }
    fetchPipeline()
  }, [id, isCreateMode])

  const handleSave = async () => {
    try {
      const url = isCreateMode ? '/api/pipelines?action=create' : `/api/pipelines?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      if (!response.ok) throw new Error('Failed to save')
      if (isCreateMode) {
        const result = await response.json()
        navigate(`/spine-framework/admin/configs/pipelines/${result.data?.id || result.id}`)
      } else setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const toggleStatus = async () => {
    if (!pipeline) return
    const newStatus = pipeline.status === 'active' ? 'paused' : 'active'
    try {
      const response = await apiFetch(`/api/pipelines?action=update&id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) })
      if (!response.ok) throw new Error('Failed to update status')
      setPipeline({ ...pipeline, status: newStatus })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/pipelines') : navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{isCreateMode ? 'Create Pipeline' : pipeline?.name}</h1>
            {pipeline && <Badge variant={pipeline.status === 'active' ? 'default' : pipeline.status === 'paused' ? 'secondary' : 'outline'}>{pipeline.status}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {!isCreateMode && pipeline?.status !== 'archived' && (
            <Button variant="outline" onClick={toggleStatus}>{pipeline?.status === 'active' ? <><Pause className="h-4 w-4 mr-2" />Pause</> : <><Play className="h-4 w-4 mr-2" />Activate</>}</Button>
          )}
          {isEditing ? (
            <><Button variant="outline" onClick={() => isCreateMode ? navigate(-1) : setIsEditing(false)}>Cancel</Button><Button onClick={handleSave}>{isCreateMode ? 'Create' : 'Save'}</Button></>
          ) : !isCreateMode && <Button onClick={() => setIsEditing(true)}>Edit</Button>}
        </div>
      </div>

      <Card><CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Configuration</h3>
            <div className="space-y-2"><Label>Name</Label>{isEditing ? <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /> : <div className="text-sm">{pipeline?.name}</div>}</div>
            <div className="space-y-2"><Label>Status</Label>{isEditing ? <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select> : <Badge>{pipeline?.status}</Badge>}</div>
            <div className="space-y-2"><Label>Trigger Type</Label>{isEditing ? <Select value={formData.trigger_type} onValueChange={v => setFormData({...formData, trigger_type: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select> : <div className="text-sm">{pipeline?.trigger_type}</div>}</div>
            {formData.trigger_type === 'scheduled' && <div className="space-y-2"><Label>Schedule (cron)</Label>{isEditing ? <Input value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} placeholder="0 0 * * *" /> : <div className="text-sm font-mono">{pipeline?.schedule || '—'}</div>}</div>}
            <div className="space-y-2"><Label>Active</Label>{isEditing ? <div className="flex items-center gap-2"><Checkbox id="active" checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c === true})} /><Label htmlFor="active">Enabled</Label></div> : <div className="text-sm">{pipeline?.is_active ? 'Yes' : 'No'}</div>}</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Execution Info</h3>
            {!isCreateMode && (
              <>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Last Run</span><span className="text-sm">{pipeline?.last_run ? formatDateTime(pipeline.last_run) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Last Status</span><Badge variant={pipeline?.last_run_status === 'success' ? 'default' : pipeline?.last_run_status === 'failed' ? 'destructive' : 'outline'}>{pipeline?.last_run_status || '—'}</Badge></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Runs</span><span className="text-sm">{pipeline?.run_count || 0}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Steps</span><span className="text-sm">{pipeline?.steps?.length || 0}</span></div>
              </>
            )}
          </div>
        </div>
        <div className="mt-6 space-y-2"><Label>Description</Label>{isEditing ? <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} /> : <div className="text-sm">{pipeline?.description || '—'}</div>}</div>
      </CardContent></Card>

      {!isCreateMode && pipeline?.steps && (
        <Card><CardHeader><CardTitle>Steps ({pipeline.steps.length})</CardTitle></CardHeader><CardContent>
          <div className="space-y-2">
            {pipeline.steps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-4 p-3 bg-muted rounded">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">{idx + 1}</div>
                <div className="flex-1"><div className="font-medium">{step.name}</div><div className="text-sm text-muted-foreground">{step.type}</div></div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  )
}
