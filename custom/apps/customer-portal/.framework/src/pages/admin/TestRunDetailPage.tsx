/**
 * @module src/pages/admin/TestRunDetailPage
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
import { DataTable } from '../../components/ui/DataTable'
import { ArrowLeft, Beaker, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../../lib/utils'

interface TestRun {
  id: string
  name: string
  description?: string
  test_type: 'unit' | 'integration' | 'e2e' | 'performance'
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped'
  started_at?: string
  completed_at?: string
  duration_ms?: number
  results: Array<{ name: string; status: string; message?: string; duration_ms?: number }>
  config: Record<string, any>
  created_at: string
  updated_at: string
}

const TEST_TYPES = [
  { value: 'unit', label: 'Unit Test' },
  { value: 'integration', label: 'Integration Test' },
  { value: 'e2e', label: 'End-to-End Test' },
  { value: 'performance', label: 'Performance Test' }
]

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' }
]

export function TestRunDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [testRun, setTestRun] = useState<TestRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [formData, setFormData] = useState({
    name: '', description: '', test_type: 'unit' as const, config: '{}', status: 'pending' as const
  })

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false)
      return
    }
    setLoading(true)
    const fetchTestRun = async () => {
      try {
        const response = await apiFetch(`/api/test-runs?action=get&id=${id}`)
        if (!response.ok) throw new Error('Failed to fetch test run')
        const result = await response.json()
        const data = result.data
        setTestRun(data)
        setFormData({
          name: data.name, description: data.description || '', test_type: data.test_type, status: data.status,
          config: JSON.stringify(data.config || {}, null, 2)
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test run')
      } finally {
        setLoading(false)
      }
    }
    fetchTestRun()
  }, [id, isCreateMode])

  const handleSave = async () => {
    try {
      let parsedConfig = {}
      try { parsedConfig = JSON.parse(formData.config) } catch {}
      const url = isCreateMode ? '/api/test-runs?action=create' : `/api/test-runs?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      const response = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...formData, config: parsedConfig }) })
      if (!response.ok) throw new Error('Failed to save test run')
      if (isCreateMode) {
        const result = await response.json()
        navigate(`/spine-framework/admin/configs/test-runs/${result.data?.id || result.id}`)
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

  const resultColumns = [
    { key: 'name' as keyof any, title: 'Test' },
    { key: 'status' as keyof any, title: 'Status', render: (v: string) => <Badge variant={v === 'passed' ? 'default' : v === 'failed' ? 'destructive' : 'outline'}>{v}</Badge> },
    { key: 'duration_ms' as keyof any, title: 'Duration', render: (v?: number) => v ? `${v}ms` : '—' },
    { key: 'message' as keyof any, title: 'Message' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/testing') : navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{isCreateMode ? 'Create Test Run' : testRun?.name}</h1>
            {testRun && <Badge variant={testRun.status === 'passed' ? 'default' : testRun.status === 'failed' ? 'destructive' : 'secondary'}>{testRun.status}</Badge>}
          </div>
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
            <h3 className="text-sm font-medium text-muted-foreground">Test Configuration</h3>
            <div className="space-y-2"><Label>Name</Label>{isEditing ? <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /> : <div className="text-sm">{testRun?.name}</div>}</div>
            <div className="space-y-2"><Label>Type</Label>{isEditing ? <Select value={formData.test_type} onValueChange={v => setFormData({...formData, test_type: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TEST_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select> : <Badge>{testRun?.test_type}</Badge>}</div>
            <div className="space-y-2"><Label>Status</Label>{isEditing ? <Select value={formData.status} onValueChange={v => setFormData({...formData, status: v as any})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select> : <Badge>{testRun?.status}</Badge>}</div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Execution Info</h3>
            {!isCreateMode && (
              <>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Started</span><span className="text-sm">{testRun?.started_at ? formatDateTime(testRun.started_at) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Completed</span><span className="text-sm">{testRun?.completed_at ? formatDateTime(testRun.completed_at) : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Duration</span><span className="text-sm">{testRun?.duration_ms ? `${testRun.duration_ms}ms` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-muted-foreground">Results</span><span className="text-sm">{testRun?.results?.length || 0} tests</span></div>
              </>
            )}
          </div>
        </div>
        <div className="mt-6 space-y-2"><Label>Description</Label>{isEditing ? <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} /> : <div className="text-sm">{testRun?.description || '—'}</div>}</div>
        <div className="mt-6 space-y-2"><Label>Config (JSON)</Label>{isEditing ? <Textarea value={formData.config} onChange={e => setFormData({...formData, config: e.target.value})} rows={6} className="font-mono text-sm" /> : <pre className="text-sm bg-muted p-3 rounded">{JSON.stringify(testRun?.config || {}, null, 2)}</pre>}</div>
      </CardContent></Card>

      {!isCreateMode && testRun?.results && (
        <Card><CardHeader><CardTitle>Results ({testRun.results.length})</CardTitle></CardHeader><CardContent>
          <DataTable data={testRun.results} columns={resultColumns as any} />
        </CardContent></Card>
      )}
    </div>
  )
}
