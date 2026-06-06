/**
 * @module src/pages/auth/LoginPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Unauthenticated login page. Renders a centred card with email/password
 * inputs. On submit, calls `AuthContext.login(email, password)` and
 * navigates to `/dashboard` on success. Displays inline error text on
 * failure. Shows a `LoadingSpinner` inside the submit button while the
 * auth request is in-flight.
 *
 * @seeAlso src/contexts/AuthContext.tsx (login implementation)
 */

import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAppsRegistry } from '../../contexts/AppContext'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const { routableApps: apps, loading } = useAppsRegistry()

  // Redirect logged-in users to their qualified app
  useEffect(() => {
    if (user && !loading) {
      // System admin gets special handling
      if (user.roles?.includes('system_admin')) {
        navigate('/spine-framework/admin', { replace: true })
        return
      }

      // Find app matching user's role
      const userRole = user.roles?.[0] // Single role per person
      if (userRole) {
        const matchingApp = apps.find(app => app.min_role === userRole)
        if (matchingApp?.route_prefix) {
          navigate(matchingApp.route_prefix, { replace: true })
          return
        }
      }

      // No matching app - show 404
      // The 404 will be handled by the catch-all route in App.tsx
    }
  }, [user, loading, apps, navigate])

  // Show loading while checking auth state (but allow redirect logic to run)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <LoadingSpinner className="w-8 h-8 mx-auto mb-4" />
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      console.log('Attempting login...')
      await login(email, password)
      // Redirect will be handled by useEffect above
      console.log('Login successful, redirect will be handled by useEffect...')
    } catch (err: any) {
      console.error('Login error:', err)
      setError(err.message || 'Login failed')
    } finally {
      console.log('Login process completed, setting loading to false')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-slate-900">
            <span className="text-white font-bold text-xl">S</span>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
            Sign in to Spine
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Or{' '}
            <Link to="/register" className="font-medium text-accent-blue hover:text-accent-blue-light">
              create a new account
            </Link>
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-[5px] shadow-sm placeholder-slate-400 focus:outline-none focus:ring-accent-blue focus:border-accent-blue sm:text-sm"
                placeholder="Enter your email"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-[5px] shadow-sm placeholder-slate-400 focus:outline-none focus:ring-accent-blue focus:border-accent-blue sm:text-sm"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-accent-blue focus:ring-accent-blue border-slate-300 rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link to="/forgot-password" className="font-medium text-accent-blue hover:text-accent-blue-light">
                Forgot your password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent rounded-[5px] shadow-sm text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-blue disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Signing in...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
