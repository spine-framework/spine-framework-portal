/**
 * @module src/pages/admin/EmbeddingDetailPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Create / view / edit page for a single embedding model configuration.
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { ArrowLeft, Pencil, AlertCircle } from 'lucide-react'

interface EmbeddingModel {
  id: string
  name: string
  description?: string
  model_name: string
  provider: 'openai' | 'anthropic' | 'local' | 'custom'
  config: {
    dimension: number
    chunk_size: number
    overlap: number
    batch_size: number
  }
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string
  account_id: string
  document_count: number
  embedding_count: number
  storage_size: number
}

export function EmbeddingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'
  
  const [isEditing, setIsEditing] = useState(isCreateMode)
  const [editData, setEditData] = useState<Record<string, any>>({})

  const { data: embedding, loading, error, refetch } = useApi(
    async () => {
      if (isCreateMode) {
        return {
          id: '',
          name: '',
          description: '',
          model_name: 'text-embedding-ada-002',
          provider: 'openai' as const,
          config: {
            dimension: 1536,
            chunk_size: 1000,
            overlap: 200,
            batch_size: 100
          },
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: '',
          account_id: '',
          document_count: 0,
          embedding_count: 0,
          storage_size: 0
        }
      }
      
      const response = await apiFetch(`/api/embeddings?action=get&id=${id}`)
      if (!response.ok) throw new Error('Failed to fetch embedding')
      const result = await response.json()
      return result.data
    },
    { immediate: !isCreateMode }
  )

  useEffect(() => {
    if (embedding) {
      setEditData({
        name: embedding.name,
        description: embedding.description || '',
        model_name: embedding.model_name,
        provider: embedding.provider,
        config: embedding.config || {
          dimension: 1536,
          chunk_size: 1000,
          overlap: 200,
          batch_size: 100
        },
        is_active: embedding.is_active
      })
    }
  }, [embedding])

  const handleSave = async () => {
    try {
      const url = isCreateMode 
        ? '/api/embeddings?action=create'
        : `/api/embeddings?action=update&id=${id}`
      
      const method = isCreateMode ? 'POST' : 'PATCH'
      
      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editData)
      })
      
      if (!response.ok) throw new Error('Failed to save embedding')
      
      if (isCreateMode) {
        const result = await response.json()
        const newId = result.data?.id || result.id
        navigate(`/spine-framework/admin/configs/embeddings/${newId}`)
      } else {
        await refetch()
        setIsEditing(false)
      }
    } catch (error) {
      console.error('Error saving embedding:', error)
    }
  }

  const handleCancel = () => {
    if (isCreateMode) {
      navigate('/spine-framework/admin/configs/embeddings')
      return
    }
    
    if (embedding) {
      setEditData({
        name: embedding.name,
        description: embedding.description || '',
        model_name: embedding.model_name,
        provider: embedding.provider,
        config: embedding.config || {
          dimension: 1536,
          chunk_size: 1000,
          overlap: 200,
          batch_size: 100
        },
        is_active: embedding.is_active
      })
    }
    setIsEditing(false)
  }

  const handleEdit = () => {
    setIsEditing(true)
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
        <AlertTitle>Failed to load embedding</AlertTitle>
        <AlertDescription>{String(error)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => isCreateMode ? navigate('/spine-framework/admin/configs/embeddings') : navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isCreateMode ? 'Create Embedding Model' : embedding?.name || 'Embedding Detail'}
            </h1>
            <p className="text-sm text-muted-foreground">Embedding Model Configuration</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleSave}>
                {isCreateMode ? 'Create' : 'Save Changes'}
              </Button>
            </>
          ) : (
            !isCreateMode && (
              <Button variant="outline" onClick={handleEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )
          )}
        </div>
      </div>

      {isCreateMode ? (
        <Card>
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editData.name || ''}
                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                    placeholder="Enter model name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select value={editData.provider || 'openai'} onValueChange={(v) => setEditData({...editData, provider: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editData.description || ''}
                  onChange={(e) => setEditData({...editData, description: e.target.value})}
                  rows={3}
                  placeholder="Describe this embedding model"
                />
              </div>
              <div className="mt-4 space-y-2">
                <Label>Model Name</Label>
                <Input
                  value={editData.model_name || ''}
                  onChange={(e) => setEditData({...editData, model_name: e.target.value})}
                  placeholder="e.g., text-embedding-ada-002"
                />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-4">Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dimensions</Label>
                  <Input
                    type="number"
                    value={editData.config?.dimension || 1536}
                    onChange={(e) => setEditData({
                      ...editData,
                      config: {
                        ...editData.config,
                        dimension: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chunk Size</Label>
                  <Input
                    type="number"
                    value={editData.config?.chunk_size || 1000}
                    onChange={(e) => setEditData({
                      ...editData,
                      config: {
                        ...editData.config,
                        chunk_size: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Overlap</Label>
                  <Input
                    type="number"
                    value={editData.config?.overlap || 200}
                    onChange={(e) => setEditData({
                      ...editData,
                      config: {
                        ...editData.config,
                        overlap: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number"
                    value={editData.config?.batch_size || 100}
                    onChange={(e) => setEditData({
                      ...editData,
                      config: {
                        ...editData.config,
                        batch_size: parseInt(e.target.value)
                      }
                    })}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : embedding ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Name:</span>
                      {isEditing ? (
                        <Input
                          value={editData.name || ''}
                          onChange={(e) => setEditData({...editData, name: e.target.value})}
                          className="w-48"
                        />
                      ) : (
                        <span className="text-sm font-medium">{embedding.name}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Provider:</span>
                      {isEditing ? (
                        <Select value={editData.provider || embedding.provider} onValueChange={(v) => setEditData({...editData, provider: v})}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI</SelectItem>
                            <SelectItem value="anthropic">Anthropic</SelectItem>
                            <SelectItem value="local">Local</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{embedding.provider}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-sm text-muted-foreground">Description:</span>
                      {isEditing ? (
                        <Textarea
                          value={editData.description || ''}
                          onChange={(e) => setEditData({...editData, description: e.target.value})}
                          rows={3}
                          className="w-48"
                        />
                      ) : (
                        <span className="text-sm">{embedding.description || '—'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Model Name:</span>
                      {isEditing ? (
                        <Input
                          value={editData.model_name || embedding.model_name}
                          onChange={(e) => setEditData({...editData, model_name: e.target.value})}
                          className="w-48"
                        />
                      ) : (
                        <span className="text-sm font-mono">{embedding.model_name}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Active:</span>
                      {isEditing ? (
                        <Select value={String(editData.is_active)} onValueChange={(v) => setEditData({...editData, is_active: v === 'true'})}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-sm">{embedding.is_active ? 'Yes' : 'No'}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-4">Configuration</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Dimensions:</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.config?.dimension || embedding.config?.dimension}
                          onChange={(e) => setEditData({
                            ...editData,
                            config: {
                              ...editData.config,
                              dimension: parseInt(e.target.value)
                            }
                          })}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-sm">{embedding.config?.dimension || '—'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Chunk Size:</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.config?.chunk_size || embedding.config?.chunk_size}
                          onChange={(e) => setEditData({
                            ...editData,
                            config: {
                              ...editData.config,
                              chunk_size: parseInt(e.target.value)
                            }
                          })}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-sm">{embedding.config?.chunk_size || '—'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Overlap:</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.config?.overlap || embedding.config?.overlap}
                          onChange={(e) => setEditData({
                            ...editData,
                            config: {
                              ...editData.config,
                              overlap: parseInt(e.target.value)
                            }
                          })}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-sm">{embedding.config?.overlap || '—'}</span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Batch Size:</span>
                      {isEditing ? (
                        <Input
                          type="number"
                          value={editData.config?.batch_size || embedding.config?.batch_size}
                          onChange={(e) => setEditData({
                            ...editData,
                            config: {
                              ...editData.config,
                              batch_size: parseInt(e.target.value)
                            }
                          })}
                          className="w-24"
                        />
                      ) : (
                        <span className="text-sm">{embedding.config?.batch_size || '—'}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><dt className="text-sm text-muted-foreground">Documents</dt><dd className="font-mono text-sm">{embedding.document_count}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Embeddings</dt><dd className="font-mono text-sm">{embedding.embedding_count}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Storage Size</dt><dd className="font-mono text-sm">{Math.round(embedding.storage_size / 1024 / 1024 * 100) / 100} MB</dd></div>
                <div><dt className="text-sm text-muted-foreground">Created</dt><dd className="font-mono text-sm">{new Date(embedding.created_at).toLocaleString()}</dd></div>
              </dl>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><dt className="text-sm text-muted-foreground">ID</dt><dd className="font-mono text-sm">{embedding.id}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Updated</dt><dd className="font-mono text-sm">{new Date(embedding.updated_at).toLocaleString()}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Created By</dt><dd className="font-mono text-sm">{embedding.created_by}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Account ID</dt><dd className="font-mono text-sm">{embedding.account_id}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
