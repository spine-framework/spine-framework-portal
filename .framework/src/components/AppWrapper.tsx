import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AppProvider } from '../contexts/AppContext'
import { AppRecord } from '../hooks/useApps'

interface AppWrapperProps {
  app: AppRecord
  children: React.ReactNode
}

/**
 * Shared wrapper for all apps. Provides:
 * - Auth gate: redirects to /login if unauthenticated
 * - Role gate: shows 403 if user lacks app's min_role
 * - App context: makes app record available via useCurrentApp()
 */
export function AppWrapper({ app, children }: AppWrapperProps) {
  const { user } = useAuth()

  // Auth gate
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Role gate
  if (app.min_role) {
    const hasRole = user.roles?.includes('system_admin') || user.roles?.includes(app.min_role)
    if (!hasRole) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
            <p className="text-slate-600 mb-6">You don't have permission to access {app.name}.</p>
            <div className="bg-slate-100 rounded-lg p-4 text-left">
              <p className="text-sm text-slate-600 mb-2"><strong>Your roles:</strong> {user.roles?.join(', ') || 'None'}</p>
              <p className="text-sm text-slate-600"><strong>Required:</strong> {app.min_role}</p>
            </div>
          </div>
        </div>
      )
    }
  }

  // App context
  return (
    <AppProvider app={app}>
      {children}
    </AppProvider>
  )
}
