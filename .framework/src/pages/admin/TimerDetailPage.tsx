/**
 * @module src/pages/admin/TimerDetailPage
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
import { ArrowLeft, Clock, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/utils'

interface Timer {
  id: string
  name: string
  description?: string
  schedule: string
  timer_type: 'interval' | 'cron' | 'once'
  interval_seconds?: number
  next_run?: string
  last_run?: string
  last_run_status?: 'success' | 'failed'
  is_active: boolean
  target_type: string
  target_action: string
  target_config: Record<string, any>
  created_at: string
  updated_at: string
}

const TIMER_TYPES = [
  { value: 'interval', label: 'Interval' },
  { value: 'cron', label: 'Cron Expression' },
  { value: 'once', label: 'One-time' }
]

export function TimerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [timer, setTimer] = useState<Timer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formData, setFormData] = useState({ name: '', description: '', schedule: '', timer_type: 'interval' as const, interval_seconds: 3600, is_active: true, target_type: '', target_action: '', target_config: '{}' })

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchTimer = async () => {
      try {
        const response = await apiFetch(`/api/timers?action=get&id=${id}`)
        if (!response.ok) throw new Error('Failed to fetch timer')
        const result = await response.json()
        const data = result.data
        setTimer(data)
        setFormData({
          name: data.name, description: data.description || '', schedule: data.schedule, timer_type: data.timer_type,
          interval_seconds: data.interval_seconds || 3600, is_active: data.is_active, target_type: data.target_type,
          target_action: data.target_action, target_config: JSON.stringify(data.target_config || {}, null, 2)
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load timer')
      } finally {
        setLoading(false)
      }
    }
    fetchTimer()
  }, [id, isCreateMode])

  const handleSave = async () => {
    try {
      let parsedConfig = {}
      try { parsedConfig = JSON.parse(formData.target_config) } catch { throw new Error('Invalid target config JSON') }
      const url = isCreateMode ? '/api/timers?action=create' : `/api/timers?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, target_config: parsedConfig }) })
      if (!response.ok) throw new Error('Failed to save timer')
      if (isCreateMode) {
        const result = await response.json()
        navigate(`/spine-framework/admin/configs/timers/${result.data?.id || result.id}`)
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
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/timers') : navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <h1 className="text-2xl font-bold">{isCreateMode ? 'Create Timer' : timer?.name}</h1>
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
            <h3 className="text-sm font-medium text-muted-foreground">Configuration</h3>
            <div className="space-y-2"><Label>Name</Label>{isEditing ? <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /> : <div className="text-sm">{timer?.name}</div>}</div>
            <div className="space-y-2"><Label>Type</Label>{isEditing ? <Select value={formData.timer_type} onValueChange={v => setFormData({...formData, timer_type: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select> : <Badge>{timer?.timer_type}</Badge>}</div>
            {formData.timer_type === 'interval' && <div className="space-y-2"><Label>Interval (seconds)</Label>{isEditing ? <Input type="number" value={formData.interval_seconds} onChange={e => setFormData({...formData, interval_seconds: parseInt(e.target.value)})} /> : <div className="text-sm">{timer?.interval_seconds}s</div>}</div>}
            <div className="space-y-2"><Label>Schedule/Cron</Label>{isEditing ? <Input value={formData.schedule} onChange={e => setFormData({...formData, schedule: e.target.value})} placeholder={formData.timer_type === 'interval' ? '3600' : '0 */6 * * *'} /> : <div className="text-sm font-mono">{timer?.schedule}</div>}</div>
            <div className="space-y-2"><Label>Active</Label>{isEditing ? <div className="flex items-center gap-2"><Checkbox id="active" checked={formData.is_active} onCheckedChange={c => setFormData({...formData, is_active: c === true})} /><Label htmlFor="active">Enabled</Label></div> : <div className="text-sm">{timer?.is_active ? 'Yes' : 'No'}</div>}</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Execution</h3>
            {!isCreateMode && (
              <>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Next Run</span><span className="text-sm">{timer?.next_run ? formatDateTime(timer.next_run) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Last Run</span><span className="text-sm">{timer?.last_run ? formatDateTime(timer.last_run) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Last Status</span><Badge variant={timer?.last_run_status === 'success' ? 'default' : 'destructive'}>{timer?.last_run_status || '—'}</Badge></div>
              </>
            )}
            <div className="space-y-2"><Label>Target Type</Label>{isEditing ? <Input value={formData.target_type} onChange={e => setFormData({...formData, target_type: e.target.value})} placeholder="e.g., function, pipeline" /> : <div className="text-sm">{timer?.target_type}</div>}</div>
            <div className="space-y-2"><Label>Target Action</Label>{isEditing ? <Input value={formData.target_action} onChange={e => setFormData({...formData, target_action: e.target.value})} placeholder="e.g., execute" /> : <div className="text-sm">{timer?.target_action}</div>}</div>
          </div>
        </div>
        <div className="mt-6 space-y-2"><Label>Description</Label>{isEditing ? <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} /> : <div className="text-sm">{timer?.description || '—'}</div>}</div>
        <div className="mt-6 space-y-2"><Label>Target Config (JSON)</Label>{isEditing ? <Textarea value={formData.target_config} onChange={e => setFormData({...formData, target_config: e.target.value})} rows={6} className="font-mono text-sm" /> : <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(timer?.target_config || {}, null, 2)}</pre>}</div>
      </CardContent></Card>
    </div>
  )
}
