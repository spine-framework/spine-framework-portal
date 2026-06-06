import React, { createContext, useContext, useState, useEffect } from 'react'
import { AppRecord } from '../hooks/useApps'
import { apiFetch } from '../lib/api'
import { useAuth } from './AuthContext'

// ─── Current App Context (per-route) ───────────────────────────────────────────

interface AppContextType {
  app: AppRecord
}

const AppContext = createContext<AppContextType | undefined>(undefined)

/**
 * Returns the current app record from the nearest AppProvider.
 * Must be called inside an AppProvider (i.e., inside an app route).
 */
export function useCurrentApp(): AppRecord {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useCurrentApp must be used within an AppProvider')
  }
  return context.app
}

interface AppProviderProps {
  app: AppRecord
  children: React.ReactNode
}

/**
 * Provides the current app record to all descendants via useCurrentApp().
 */
export function AppProvider({ app, children }: AppProviderProps) {
  return (
    <AppContext.Provider value={{ app }}>
      {children}
    </AppContext.Provider>
  )
}

// ─── Apps Registry Context (global, fetch-once) ─────────────────────────────

interface AppsRegistryContextType {
  apps: AppRecord[]
  routableApps: AppRecord[]
  loading: boolean
  error: string | null
  refetch: () => void
}

const AppsRegistryContext = createContext<AppsRegistryContextType | undefined>(undefined)

/**
 * Returns the global apps registry (all accessible apps for this user).
 * Fetches once on mount after auth, cached for the session.
 * Use this instead of useApps() to avoid per-page refetches.
 */
export function useAppsRegistry(): AppsRegistryContextType {
  const context = useContext(AppsRegistryContext)
  if (context === undefined) {
    throw new Error('useAppsRegistry must be used within an AppsRegistryProvider')
  }
  return context
}

interface AppsRegistryProviderProps {
  children: React.ReactNode
}

/**
 * Fetches all accessible apps once after authentication and provides them
 * globally. Wrap this around AuthenticatedRouter so routes don't re-fetch
 * on every navigation.
 */
export function AppsRegistryProvider({ children }: AppsRegistryProviderProps) {
  const { user } = useAuth()
  const [apps, setApps] = useState<AppRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchApps = async () => {
    if (!user) {
      setApps([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch('/api/apps?action=list')
      if (!response.ok) throw new Error(`Failed to fetch apps: ${response.statusText}`)

      const data = await response.json()
      if (data.error) throw new Error(data.error)

      const allApps: AppRecord[] = data.data || data || []

      const accessible = allApps.filter(app => {
        if (!app.is_active) return false
        const requiredRoles = app.required_roles || (app.min_role ? [app.min_role] : [])
        if (requiredRoles.length === 0) return true
        if (!user.roles || user.roles.length === 0) return false
        if (user.roles.includes('system_admin')) return true
        return requiredRoles.some(role => user.roles!.includes(role))
      })

      setApps(accessible)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load apps')
      setApps([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch once when user changes (login/logout), not on every render
  useEffect(() => {
    fetchApps()
  }, [user?.id, user?.account_id])

  const routableApps = apps.filter(
    app => app.route_prefix != null && app.renderer !== 'none'
  )

  return (
    <AppsRegistryContext.Provider value={{ apps, routableApps, loading, error, refetch: fetchApps }}>
      {children}
    </AppsRegistryContext.Provider>
  )
}
