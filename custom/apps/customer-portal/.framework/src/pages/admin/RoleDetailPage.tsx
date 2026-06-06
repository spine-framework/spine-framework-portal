/**
 * @module src/pages/admin/RoleDetailPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Create / view / edit page for a single role.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Skeleton } from '../../components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert'
import { ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react'
import { useApi } from '../../hooks/useApi'
import { apiFetch } from '../../lib/api'
import { formatDateTime } from '../../lib/utils'

interface Role {
  id: string
  name: string
  slug: string
  description?: string
  permissions?: Record<string, any>
  is_system: boolean
  is_active: boolean
  app_id?: string
  created_at: string
  updated_at: string
}

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isCreateMode = !id || id === 'new'

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    is_system: false,
    is_active: true,
    permissions: {}
  })
  const [permissionsJson, setPermissionsJson] = useState('{}')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: role, loading, error: fetchError } = useApi<Role>(
    async () => {
      if (isCreateMode) return null
      const response = await apiFetch(`/api/roles?action=get&id=${id}`)
      if (!response.ok) throw new Error('Failed to fetch role')
      const result = await response.json()
      return result.data
    },
    { immediate: !isCreateMode }
  )

  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name || '',
        slug: role.slug || '',
        description: role.description || '',
        is_system: role.is_system || false,
        is_active: role.is_active !== false,
        permissions: role.permissions || {}
      })
      setPermissionsJson(JSON.stringify(role.permissions || {}, null, 2))
    }
  }, [role])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      let parsedPermissions
      try {
        parsedPermissions = JSON.parse(permissionsJson)
      } catch (e) {
        throw new Error('Invalid JSON in permissions field')
      }

      const payload = {
        ...formData,
        permissions: parsedPermissions
      }

      const url = isCreateMode ? '/api/roles' : `/api/roles?id=${id}`
      const method = isCreateMode ? 'POST' : 'PATCH'

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save role')
      }

      const result = await response.json()
      navigate(`/spine-framework/admin/configs/roles/${result.id || id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to save role')
    } finally {
      setIsSubmitting(false)
    }
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

  if (fetchError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to load role</AlertTitle>
        <AlertDescription>{fetchError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isCreateMode ? 'Create Role' : role?.name || 'Role Detail'}
        </h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Sales Manager"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="e.g., sales_manager"
                  required
                  disabled={!isCreateMode}
                />
                {!isCreateMode && (
                  <p className="text-xs text-muted-foreground">Slug cannot be changed after creation</p>
                )}
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this role can do..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_system"
                  checked={formData.is_system}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_system: checked === true })}
                  disabled={!isCreateMode}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="is_system" className="text-sm">System Role</Label>
                  <p className="text-xs text-muted-foreground">Cannot be deleted, reserved for core functions</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked === true })}
                />
                <Label htmlFor="is_active" className="text-sm">Active</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions (JSON)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Define permissions as a JSON object. Each key is a type slug, value is an array of allowed actions.
            </p>
            <Textarea
              value={permissionsJson}
              onChange={(e) => setPermissionsJson(e.target.value)}
              className="font-mono text-sm"
              placeholder={`{\n  "item": ["read", "write"],\n  "account": ["read"]\n}`}
              rows={10}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Example: <code className="bg-muted px-1 py-0.5 rounded">{`{"support_ticket": ["read", "write", "admin"]}`}</code>
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : isCreateMode ? 'Create Role' : 'Update Role'}
          </Button>
        </div>
      </form>
    </div>
  )
}
