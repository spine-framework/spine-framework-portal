/**
 * @module src/pages/admin/TriggerDetailPage
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
import { ArrowLeft, Zap, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/utils'

interface Trigger {
  id: string
  name: string
  description?: string
  event_type: string
  entity_type?: string
  condition?: Record<string, any>
  action_type: string
  action_config: Record<string, any>
  is_active: boolean
  priority: number
  debounce_ms?: number
  rate_limit_per_minute?: number
  created_at: string
  updated_at: string
}

export function TriggerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [trigger, setTrigger] = useState<Trigger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formData, setFormData] = useState({
    name: '', description: '', event_type: '', entity_type: '', condition: '{}', action_type: '',
    action_config: '{}', is_active: true, priority: 0, debounce_ms: 0, rate_limit_per_minute: 0
  })

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchTrigger = async () => {
      try {
        const response = await apiFetch(`/api/triggers?action=get&id=${id}`)
        if (!response.ok) throw new Error('Failed to fetch trigger')
        const result = await response.json()
        const data = result.data
        setTrigger(data)
        setFormData({
          name: data.name, description: data.description || '', event_type: data.event_type, entity_type: data.entity_type || '',
          condition: JSON.stringify(data.condition || {}, null, 2), action_type: data.action_type,
          action_config: JSON.stringify(data.action_config || {}, null, 2), is_active: data.is_active, priority: data.priority || 0,
          debounce_ms: data.debounce_ms || 0, rate_limit_per_minute: data.rate_limit_per_minute || 0
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trigger')
      } finally {
        setLoading(false)
      }
    }
    fetchTrigger()
  }, [id, isCreateMode])

  const handleSave = async () => {
    try {
      let parsedCondition = {}, parsedActionConfig = {}
      try { parsedCondition = JSON.parse(formData.condition) } catch {}
      try { parsedActionConfig = JSON.parse(formData.action_config) } catch {}
      const url = isCreateMode ? '/api/triggers?action=create' : `/api/triggers?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      const response = await apiFetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, condition: parsedCondition, action_config: parsedActionConfig })
      })
      if (!response.ok) throw new Error('Failed to save trigger')
      if (isCreateMode) {
        const result = await response.json()
        navigate(`/spine-framework/admin/configs/triggers/${result.data?.id || result.id}`)
      } else setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
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
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/triggers') : navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold">{isCreateMode ? 'Create Trigger' : trigger?.name}</h1>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <><Button variant="outline" onClick={() => isCreateMode ? navigate(-1) : setIsEditing(false)}>Cancel</Button><Button onClick={handleSave}>{isCreateMode ? 'Create' : 'Save'}</Button></>
          ) : !isCreateMode && <Button onClick={() => setIsEditing(true)}>Edit</Button>}
        </div>
      </div>

      <Card><CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Trigger</h3>
            <div className="space-y-2"><Label>Name</Label>{isEditing ? <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /> : <div className="text-sm">{trigger?.name}</div>}</div>
            <div className="space-y-2"><Label>Event Type</Label>{isEditing ? <Input value={formData.event_type} onChange={e => setFormData({...formData, event_type: e.target.value})} placeholder="e.g., item.created" /> : <Badge>{trigger?.event_type}</Badge>}</div>
            <div className="space-y-2"><Label>Entity Type</Label>{isEditing ? <Input value={formData.entity_type} onChange={e => setFormData({...formData, entity_type: e.target.value})} placeholder="e.g., item" /> : <div className="text-sm">{trigger?.entity_type || '—'}</div>}</div>
            <div className="space-y-2"><Label>Active</Label>{isEditing ? <div className="flex items-center gap-2"><Checkbox id="active" checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c === true})} /><Label htmlFor="active">Enabled</Label></div> : <div className="text-sm">{trigger?.is_active ? 'Yes' : 'No'}</div>}</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Action</h3>
            <div className="space-y-2"><Label>Action Type</Label>{isEditing ? <Input value={formData.action_type} onChange={e => setFormData({...formData, action_type: e.target.value})} placeholder="e.g., function.execute" /> : <Badge variant="secondary">{trigger?.action_type}</Badge>}</div>
            <div className="space-y-2"><Label>Priority</Label>{isEditing ? <Input type="number" value={formData.priority} onChange={e => setFormData({...formData, priority: parseInt(e.target.value)})} /> : <div className="text-sm">{trigger?.priority}</div>}</div>
            <div className="space-y-2"><Label>Debounce (ms)</Label>{isEditing ? <Input type="number" value={formData.debounce_ms} onChange={e => setFormData({...formData, debounce_ms: parseInt(e.target.value)})} /> : <div className="text-sm">{trigger?.debounce_ms}ms</div>}</div>
            <div className="space-y-2"><Label>Rate Limit (/min)</Label>{isEditing ? <Input type="number" value={formData.rate_limit_per_minute} onChange={e => setFormData({...formData, rate_limit_per_minute: parseInt(e.target.value)})} /> : <div className="text-sm">{trigger?.rate_limit_per_minute}</div>}</div>
          </div>
        </div>
        <div className="mt-6 space-y-2"><Label>Description</Label>{isEditing ? <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={2} /> : <div className="text-sm">{trigger?.description || '—'}</div>}</div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Condition (JSON)</Label>{isEditing ? <Textarea value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} rows={6} className="font-mono text-sm" /> : <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(trigger?.condition || {}, null, 2)}</pre>}</div>
          <div className="space-y-2"><Label>Action Config (JSON)</Label>{isEditing ? <Textarea value={formData.action_config} onChange={e => setFormData({...formData, action_config: e.target.value})} rows={6} className="font-mono text-sm" /> : <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(trigger?.action_config || {}, null, 2)}</pre>}</div>
        </div>
      </CardContent></Card>
    </div>
  )
}
