import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useEntityRecord } from '../../hooks/useEntityRecord'
import { DataDetailHeader } from './DataDetailHeader'
import { SchemaDetailForm } from './SchemaDetailForm'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Skeleton } from '../ui/skeleton'

export function DataDetailPage() {
  const { entity, id, typeSlug } = useParams<{ entity: string; id: string; typeSlug?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const isCreating = !id
  const isEditing = searchParams.get('edit') === 'true' || isCreating
  
  const config = {
    entity: entity || '',
    typeSlug: typeSlug || undefined,
    icon: 'database',
    displayField: 'display_name',
    api: {
      endpoint: 'admin-data',
      getAction: 'get',
      createAction: 'create',
      updateAction: 'update'
    }
  }
  
  const { 
    record, 
    fieldPermissions,
    loading, 
    error, 
    refetch,
    save,
    delete: deleteRecord,
    saving,
    deleting
  } = useEntityRecord(entity!, id, config)
  
  const schema = record?.design_schema || null
  const view = schema?.views?.default_detail || null

  const displayField = schema?.display_field || config.displayField
  const FALLBACK_FIELDS = ['full_name', 'display_name', 'name', 'title', 'slug', 'email']
  const recordTitle = record?.[displayField]
    ?? FALLBACK_FIELDS.map(f => record?.[f]).find(v => v != null)
    ?? 'Untitled'

  const [formData, setFormData] = useState<Record<string, any>>({})

  useEffect(() => {
    if (record && view) {
      const initialData: Record<string, any> = {}
      view.sections?.forEach((section: any) => {
        const fieldNames = Array.isArray(section.fields) ? section.fields : Object.keys(section.fields || {})
        fieldNames.forEach((fieldName: string) => {
          const fieldDef = schema?.fields?.[fieldName]
          if (fieldDef?.system) {
            initialData[fieldName] = record[fieldName]
          } else {
            initialData[fieldName] = record.data?.[fieldName]
          }
        })
      })
      setFormData(initialData)
    } else if (isCreating) {
      setFormData({})
    }
  }, [record, isCreating, view, schema])
  
  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }
  
  const handleEdit = () => {
    setSearchParams({ edit: 'true' })
  }
  
  const handleCancel = () => {
    if (isCreating) {
      window.location.href = `/spine-framework/admin/runtime/${entity}`
    } else {
      setSearchParams({})
      if (record && view) {
        const initialData: Record<string, any> = {}
        view.sections?.forEach((section: any) => {
          const fieldNames = Array.isArray(section.fields) ? section.fields : Object.keys(section.fields || {})
          fieldNames.forEach((fieldName: string) => {
            const fieldDef = schema?.fields?.[fieldName]
            if (fieldDef?.system) {
              initialData[fieldName] = record[fieldName]
            } else {
              initialData[fieldName] = record.data?.[fieldName]
            }
          })
        })
        setFormData(initialData)
      }
    }
  }
  
  const handleSave = async () => {
    await save(formData)
    if (!isCreating) {
      setSearchParams({})
    } else {
      window.location.href = `/spine-framework/admin/runtime/${entity}`
    }
  }
  
  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete this ${config?.entity?.slice(0, -1) || 'record'}?`)) {
      await deleteRecord()
      window.location.href = `/spine-framework/admin/runtime/${entity}`
    }
  }
  
  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    )
  }
  
  if (error || !schema || !view) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive">Error: {error || 'Failed to load record or schema'}</p>
          <Button onClick={refetch} variant="outline" className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <div className="space-y-6">
      <DataDetailHeader
        entity={config.entity}
        icon={config.icon}
        title={isCreating ? `New ${config.entity.slice(0, -1)}` : recordTitle}
        isEditing={isEditing}
        isCreating={isCreating}
        onEdit={handleEdit}
        onSave={handleSave}
        onCancel={handleCancel}
        onDelete={!isCreating ? handleDelete : undefined}
        saving={saving}
        deleting={deleting}
      />
      
      <SchemaDetailForm
        schema={schema}
        view={view}
        record={record}
        isEditing={isEditing}
        isCreating={isCreating}
        permissions={fieldPermissions}
        formData={formData}
        onFieldChange={handleFieldChange}
      />
    </div>
  )
}
