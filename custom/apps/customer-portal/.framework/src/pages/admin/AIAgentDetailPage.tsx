/**
 * @module src/pages/admin/AIAgentDetailPage
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
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
import { ArrowLeft, Bot, AlertCircle } from 'lucide-react'

interface AIAgent {
  id: string
  name: string
  description?: string
  agent_type: 'chat' | 'analysis' | 'automation' | 'custom'
  model_config: { model: string; max_tokens?: number; temperature?: number }
  system_prompt: string
  tools: string[]
  capabilities?: Record<string, any>
  constraints?: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
}

const AGENT_TYPES = [
  { value: 'chat', label: 'Chat' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'automation', label: 'Automation' },
  { value: 'custom', label: 'Custom' }
]

export function AIAgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [editData, setEditData] = useState<Record<string, any>>({})

  const { data: agent, loading, error } = useApi<AIAgent>(
    async () => {
      if (isCreateMode) return {
        id: '', name: '', description: '', agent_type: 'chat' as const,
        model_config: { model: 'gpt-4', max_tokens: 2048, temperature: 0.7 },
        system_prompt: '', tools: [], capabilities: {}, constraints: {},
        is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      const response = await apiFetch(`/api/ai-agents?method=GET&id=${id}`)
      if (!response.ok) throw new Error('Failed to fetch AI agent')
      const result = await response.json()
      return result.data
    },
    { immediate: !isCreateMode }
  )

  useEffect(() => {
    if (agent) {
      setEditData({
        name: agent.name, description: agent.description || '', agent_type: agent.agent_type,
        model_config: agent.model_config || { model: 'gpt-4', max_tokens: 2048, temperature: 0.7 },
        system_prompt: agent.system_prompt || '', tools: (agent.tools || []).join('\n'),
        capabilities: JSON.stringify(agent.capabilities || {}, null, 2),
        constraints: JSON.stringify(agent.constraints || {}, null, 2),
        is_active: agent.is_active
      })
    }
  }, [agent])

  const handleSave = async () => {
    try {
      const payload = {
        ...editData,
        tools: editData.tools?.split('\n').filter(Boolean) || [],
        capabilities: JSON.parse(editData.capabilities || '{}'),
        constraints: JSON.parse(editData.constraints || '{}')
      }
      const url = isCreateMode ? '/api/ai-agents' : `/api/ai-agents?id=${id}`
      const response = await apiFetch(url, {
        method: isCreateMode ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) throw new Error('Failed to save')
      const result = await response.json()
      if (isCreateMode) navigate(`/spine-framework/admin/configs/ai-agents/${result.id}`)
      else setIsEditing(false)
    } catch (err) {
      console.error('Error saving:', err)
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card>
    </div>
  )

  if (error) return (
    <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Failed to load</AlertTitle><AlertDescription>{String(error)}</AlertDescription></Alert>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">{isCreateMode ? 'Create AI Agent' : agent?.name}</h1>
      </div>
      
      <div className="flex justify-end gap-2">
        {isEditing ? (
          <><Button variant="outline" onClick={() => isCreateMode ? navigate(-1) : setIsEditing(false)}>Cancel</Button><Button onClick={handleSave}>{isCreateMode ? 'Create' : 'Save'}</Button></>
        ) : <Button onClick={() => setIsEditing(true)}>Edit</Button>}
      </div>

      {isEditing ? (
        <Card><CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editData.name || ''} onChange={e => setEditData({...editData, name: e.target.value})} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={editData.agent_type || 'chat'} onValueChange={v => setEditData({...editData, agent_type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AGENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Model</Label><Input value={editData.model_config?.model || ''} onChange={e => setEditData({...editData, model_config: {...editData.model_config, model: e.target.value}})} /></div>
            <div className="space-y-2"><Label>Max Tokens</Label><Input type="number" value={editData.model_config?.max_tokens || ''} onChange={e => setEditData({...editData, model_config: {...editData.model_config, max_tokens: parseInt(e.target.value)}})} /></div>
            <div className="space-y-2"><Label>Temperature</Label><Input type="number" step="0.1" min="0" max="2" value={editData.model_config?.temperature || ''} onChange={e => setEditData({...editData, model_config: {...editData.model_config, temperature: parseFloat(e.target.value)}})} /></div>
          </div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={editData.description || ''} onChange={e => setEditData({...editData, description: e.target.value})} rows={2} /></div>
          <div className="space-y-2"><Label>System Prompt</Label><Textarea value={editData.system_prompt || ''} onChange={e => setEditData({...editData, system_prompt: e.target.value})} rows={4} /></div>
          <div className="space-y-2"><Label>Tools (one per line)</Label><Textarea value={editData.tools || ''} onChange={e => setEditData({...editData, tools: e.target.value})} rows={3} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Capabilities (JSON)</Label><Textarea value={editData.capabilities || '{}'} onChange={e => setEditData({...editData, capabilities: e.target.value})} rows={4} className="font-mono text-sm" /></div>
            <div className="space-y-2"><Label>Constraints (JSON)</Label><Textarea value={editData.constraints || '{}'} onChange={e => setEditData({...editData, constraints: e.target.value})} rows={4} className="font-mono text-sm" /></div>
          </div>
          <div className="flex items-center gap-2"><Checkbox id="active" checked={editData.is_active} onCheckedChange={c => setEditData({...editData, is_active: c === true})} /><Label htmlFor="active">Active</Label></div>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          <Card><CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{agent?.agent_type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{agent?.model_config?.model}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Max Tokens</span><span>{agent?.model_config?.max_tokens}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Temperature</span><span>{agent?.model_config?.temperature}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Active</span><span>{agent?.is_active ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(agent?.created_at || '').toLocaleDateString()}</span></div>
            </div>
            <div className="mt-4"><span className="text-muted-foreground">Description</span><p className="mt-1">{agent?.description || '—'}</p></div>
            <div className="mt-4"><span className="text-muted-foreground">System Prompt</span><p className="mt-1 text-sm bg-muted p-3 rounded">{agent?.system_prompt || '—'}</p></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Tools ({agent?.tools?.length || 0})</CardTitle></CardHeader><CardContent>{agent?.tools?.length ? <ul className="list-disc list-inside">{agent.tools.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-muted-foreground">No tools configured</p>}</CardContent></Card>
        </div>
      )}
    </div>
  )
}
