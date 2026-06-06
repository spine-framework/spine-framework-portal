import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { useMutation } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { ArrowLeft, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { formatDateTime } from '../../lib/utils'

interface App {
  id: string
  slug: string
  name: string
  description?: string
  app_type: string
  version: string
  icon?: string
  color?: string
  source: string
  owner_account_id: string
  is_active: boolean
  is_system: boolean
  min_role: string
  created_at: string
  updated_at?: string
  config?: Record<string, any>
  is_public?: boolean
  item_count?: number
  user_count?: number
  account_name?: string
  created_by?: string
  account_id?: string
}

export function AppDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [editData, setEditData] = useState<Record<string, any>>({
    name: '',
    slug: '',
    description: '',
    app_type: 'custom',
    version: '1.0.0',
    icon: null,
    color: null,
    source: 'custom',
    owner_account_id: '',
    is_active: true,
    is_system: false,
    min_role: 'member',
    config: {},
    is_public: false
  })
  const [configText, setConfigText] = useState(JSON.stringify({}, null, 2))

  const { data: app, loading, error, refetch } = useApi<App>(
    async () => {
      if (isCreateMode) {
        return {
          id: '',
          slug: '',
          name: '',
          description: '',
          app_type: 'custom',
          version: '1.0.0',
          icon: null,
          color: null,
          source: 'custom',
          owner_account_id: '',
          is_active: true,
          is_system: false,
          min_role: 'member',
          created_at: new Date().toISOString(),
          config: {},
          is_public: false
        }
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(id!)) {
        throw new Error('Invalid ID format')
      }
      const response = await apiFetch(`/api/apps?action=get&id=${id}`)
      if (!response.ok) {
        if (response.status === 404 || response.status === 500) {
          throw new Error('App not found')
        }
        throw new Error('Failed to fetch app')
      }
      const result = await response.json()
      return result.data || result
    },
    { immediate: true }
  )

  useEffect(() => {
    if (app) {
      const initialData = {
        name: app.name,
        slug: app.slug,
        description: app.description || '',
        app_type: app.app_type,
        version: app.version,
        icon: app.icon || null,
        color: app.color || null,
        source: app.source,
        owner_account_id: app.owner_account_id,
        is_active: app.is_active,
        is_system: app.is_system,
        min_role: app.min_role,
        config: app.config || {},
        is_public: app.is_public || false
      }
      setEditData(initialData)
      setConfigText(JSON.stringify(app.config || {}, null, 2))
    }
  }, [app])

  const handleSave = async () => {
    try {
      let parsedConfig = {}
      try {
        parsedConfig = JSON.parse(configText)
      } catch (error) {
        console.warn('Invalid JSON in config field, using default:', error)
      }
      
      const { is_public: _ip, item_count: _ic, user_count: _uc, account_name: _an, ...cleanData } = editData
      const saveData = { ...cleanData, config: parsedConfig }
      const url = isCreateMode 
        ? '/api/apps?action=create'
        : `/api/apps?action=update&id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'
      
      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
      })
      
      if (!response.ok) throw new Error('Failed to save app')
      
      if (isCreateMode) {
        const result = await response.json()
        const newId = result.data?.id || result.id
        navigate(`/spine-framework/admin/configs/apps/${newId}`)
      } else {
        await refetch()
        setIsEditing(false)
      }
    } catch (error) {
      console.error('Error saving app:', error)
    }
  }

  const handleCancel = () => {
    if (isCreateMode) {
      navigate('/spine-framework/admin/configs/apps')
      return
    }
    if (app) {
      setEditData({
        name: app.name,
        slug: app.slug,
        description: app.description || '',
        app_type: app.app_type,
        version: app.version,
        icon: app.icon || null,
        color: app.color || null,
        source: app.source,
        owner_account_id: app.owner_account_id,
        is_active: app.is_active,
        is_system: app.is_system,
        min_role: app.min_role,
        config: app.config || {},
        is_public: app.is_public || false
      })
      setConfigText(JSON.stringify(app.config || {}, null, 2))
    }
    setIsEditing(false)
  }

  const handleEdit = () => setIsEditing(true)

  const deleteMutation = useMutation(
    async () => {
      const response = await apiFetch(`/api/apps?action=delete&id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete app')
      return response.json()
    },
    { onSuccess: () => navigate('/spine-framework/admin/configs/apps') }
  )

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
      <div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load app</AlertTitle>
          <AlertDescription>{String(error)}</AlertDescription>
        </Alert>
        <Button onClick={refetch} variant="outline" className="mt-4">Retry</Button>
      </div>
    )
  }

  if (!app) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium">App not found</h3>
        <p className="mt-2 text-sm text-muted-foreground">The app you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/spine-framework/admin/configs/apps')} className="mt-4">
          Back to Apps
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/apps') : navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isCreateMode ? 'Create App' : app?.name}</h1>
            <p className="text-sm text-muted-foreground">{isCreateMode ? 'App Configuration' : 'App Details'}</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleSave}>{isCreateMode ? 'Create' : 'Save Changes'}</Button>
            </>
          ) : (
            !isCreateMode && (
              <>
                <Button variant="outline" onClick={handleEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </>
            )
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>App Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Basic Info</h3>
              
              {!isCreateMode && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">ID:</span>
                  <span className="text-sm font-mono">{app.id}</span>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Name:</span>
                {isEditing ? (
                  <Input value={editData.name} onChange={(e) => setEditData({...editData, name: e.target.value})} className="w-48" />
                ) : (
                  <span className="text-sm">{app.name}</span>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Slug:</span>
                {isEditing ? (
                  <Input value={editData.slug} onChange={(e) => setEditData({...editData, slug: e.target.value})} className="w-48" />
                ) : (
                  <span className="text-sm font-mono">{app.slug}</span>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Description:</span>
                {isEditing ? (
                  <Input value={editData.description} onChange={(e) => setEditData({...editData, description: e.target.value})} className="w-48" placeholder="Enter description" />
                ) : (
                  <span className="text-sm">{app.description || 'No description'}</span>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Type:</span>
                {isEditing ? (
                  <Select value={editData.app_type} onValueChange={(v) => setEditData({...editData, app_type: v})}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="marketplace">Marketplace</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge>{app.app_type}</Badge>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Source:</span>
                {isEditing ? (
                  <Select value={editData.source} onValueChange={(v) => setEditData({...editData, source: v})}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="marketplace">Marketplace</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{app.source}</Badge>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Min Role:</span>
                {isEditing ? (
                  <Select value={editData.min_role} onValueChange={(v) => setEditData({...editData, min_role: v})}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{app.min_role}</Badge>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Version:</span>
                {isEditing ? (
                  <Input value={editData.version} onChange={(e) => setEditData({...editData, version: e.target.value})} className="w-48" />
                ) : (
                  <span className="text-sm">{app.version}</span>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Status & Access</h3>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active:</span>
                {isEditing ? (
                  <Select value={String(editData.is_active)} onValueChange={(v) => setEditData({...editData, is_active: v === 'true'})}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={app.is_active ? 'default' : 'secondary'}>{app.is_active ? 'Active' : 'Inactive'}</Badge>
                )}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">System:</span>
                {isEditing ? (
                  <Select value={String(editData.is_system)} onValueChange={(v) => setEditData({...editData, is_system: v === 'true'})}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">System</SelectItem>
                      <SelectItem value="false">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={app.is_system ? 'secondary' : 'outline'}>{app.is_system ? 'System' : 'Custom'}</Badge>
                )}
              </div>
              
              {!isCreateMode && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Owner Account ID:</span>
                    <span className="text-sm font-mono">{app.owner_account_id || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Created:</span>
                    <span className="text-sm">{formatDateTime(app.created_at)}</span>
                  </div>
                  {app.updated_at && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Updated:</span>
                      <span className="text-sm">{formatDateTime(app.updated_at)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration JSON</CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">App Configuration (JSON)</label>
              <Textarea value={configText} onChange={(e) => setConfigText(e.target.value)} className="h-64 font-mono text-sm" placeholder="Enter JSON configuration..." />
              <p className="text-xs text-muted-foreground">Enter JSON for app configuration. Invalid JSON will be handled on save.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <pre className="text-sm font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(app.config, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">Configuration contains {Object.keys(app.config || {}).length} properties</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete App"
        description="Are you sure you want to delete this app? This action cannot be undone."
        size="sm"
      >
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.loading} variant="destructive">
            {deleteMutation.loading ? 'Deleting...' : 'Delete App'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
