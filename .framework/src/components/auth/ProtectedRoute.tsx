/**
 * @module src/components/auth/ProtectedRoute
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * React Router route guard that enforces authentication and optional
 * system-admin role checks. Wrap any `<Route>` element that requires
 * a logged-in user.
 *
 * **Auth check:** If `AuthContext.user` is null (not yet logged in or
 * session expired), redirects to `/login` using `<Navigate replace>`.
 *
 * **System-admin check:** When `requireSystemAdmin=true`, verifies that
 * `user.roles` includes `'system_admin'`. On failure it renders an
 * access-denied screen rather than redirecting, to avoid redirect loops.
 *
 * @example
 * ```tsx
 * <Route path="/admin" element={
 *   <ProtectedRoute requireSystemAdmin>
 *     <AdminLayout />
 *   </ProtectedRoute>
 * } />
 * ```
 *
 * @seeAlso src/contexts/AuthContext.tsx
 */

import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Props for `ProtectedRoute`.
 *
 * @prop children - The protected route content
 * @prop requireSystemAdmin - If true, also requires the `system_admin` role
 */
interface ProtectedRouteProps {
  children: React.ReactNode
  requireSystemAdmin?: boolean
}

/**
 * Route guard component.
 *
 * @param props - `ProtectedRouteProps`
 * @returns `children` when authorised, a redirect to `/login` when
 *   unauthenticated, or an access-denied screen when role check fails
 * @sideEffects none (navigation is declarative via `<Navigate>`)
 */
export function ProtectedRoute({ children, requireSystemAdmin = false }: ProtectedRouteProps) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireSystemAdmin && !user.roles?.includes('system_admin')) {
    // Show access denied message instead of redirect to avoid loops
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">You need system administrator privileges to access this page.</p>
          <div className="bg-slate-100 rounded-lg p-4 text-left">
            <p className="text-sm text-slate-600 mb-2"><strong>Your roles:</strong> {user.roles?.join(', ') || 'None'}</p>
            <p className="text-sm text-slate-600"><strong>Required:</strong> system_admin</p>
          </div>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="mt-6 px-4 py-2 bg-navy text-white rounded-lg hover:bg-navy/90 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
