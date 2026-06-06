/**
 * @module src/contexts/AuthContext
 * @audience installer
 * @layer frontend-hook
 * @stability stable
 *
 * React authentication context and provider for the Spine frontend.
 * Manages the full Supabase auth lifecycle: initial session hydration,
 * login, logout, auth state change events, and a server-side user context
 * fetch (principal, account, roles, permissions).
 *
 * **Session hydration strategy:**
 * 1. On mount, restore user from `sessionStorage` (survives page reloads
 *    without a loading flash)
 * 2. If no stored user, call `checkAuth` → `fetchUserContext` → `setAccountId`
 * 3. Subscribe to `supabase.auth.onAuthStateChange` for `SIGNED_IN`,
 *    `TOKEN_REFRESHED`, and `SIGNED_OUT` events
 *
 * **Race-condition guards:**
 * - `isLoggingIn` flag prevents `onAuthStateChange` from re-fetching context
 *   while `login()` is already in progress
 * - `SIGNED_IN` / `TOKEN_REFRESHED` handler skips re-fetch if user is already
 *   loaded (prevents blocking page data fetches on browser focus)
 * - `checkAuth` exits early if user is already loaded from `sessionStorage`
 *
 * **Account scope:** Calls `setAccountId(userContext.account_id)` after
 * every successful context fetch, keeping `src/lib/api.ts` in sync.
 *
 * @seeAlso src/lib/supabase.ts (supabase client singleton)
 * @seeAlso src/lib/api.ts (setAccountId, apiFetch)
 * @seeAlso src/types/auth.ts (User shape)
 * @seeAlso functions/auth.ts (backend `/api/auth?action=context` endpoint)
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setAccountId, apiFetch } from '../lib/api'
import { User } from '../types/auth'

// ─── TYPES ───────────────────────────────────────────────────────────────────

/**
 * Shape of the value provided by `AuthContext`.
 *
 * @prop user - Resolved server-side user context, or null if unauthenticated
 * @prop isLoading - True during initial `checkAuth` (prevents premature redirects)
 * @prop login - Sign in with email/password and hydrate user context
 * @prop logout - Sign out and clear user + account scope
 * @prop refreshUser - Re-fetch user context from the server (e.g. after role change)
 */
interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ─── useAuth ─────────────────────────────────────────────────────────────────

/**
 * Hook to access the authentication context. Must be called inside `AuthProvider`.
 *
 * @returns `AuthContextType` — user, isLoading, login, logout, refreshUser
 * @throws Error('useAuth must be used within an AuthProvider') if called outside provider
 * @sideEffects none (read-only context access)
 * @calledBy every component that needs the current user or auth actions
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

// ─── INTERNAL HELPERS ───────────────────────────────────────────────────────────

/**
 * Fetches the server-side user context from `GET /api/auth`. Returns null on
 * any error (network, auth, or API) rather than throwing, so callers can
 * apply fallback logic without try/catch.
 *
 * @returns Resolved `User` object or null on failure
 * @throws never (all errors are caught internally)
 * @sideEffects Network request via apiFetch; console logging
 * @calledBy AuthProvider.login, AuthProvider.refreshUser, AuthProvider.checkAuth
 */
async function fetchUserContext(): Promise<User | null> {
  try {
    console.log('Fetching user context from backend API')

    // Use backend API to get user context - backend handles all security
    const response = await apiFetch('/api/auth', {
      method: 'GET'
    })

    if (!response.ok) {
      console.error('Backend API error:', response.status, response.statusText)
      return null
    }

    const data = await response.json()
    
    if (data.error) {
      console.error('Backend returned error:', data.error)
      return null
    }

    if (!data.data) {
      console.error('No user data returned from backend')
      return null
    }

    console.log('User context loaded from backend:', {
      id: data.data.id,
      email: data.data.email,
      account: data.data.account?.slug,
      role: data.data.roles?.[0]
    })

    return data.data
  } catch (error) {
    console.error('Error fetching user context from backend:', error)
    return null
  }
}

// ─── AuthProvider ──────────────────────────────────────────────────────────────

/**
 * Root authentication provider. Wrap the entire application with this component
 * to enable `useAuth()` in any descendant.
 *
 * @param children - React subtree to wrap
 * @sideEffects
 *   - Reads/writes `sessionStorage` key `spine_user` for persistence
 *   - Calls `setAccountId` (mutates `src/lib/api.ts` module state)
 *   - Subscribes to `supabase.auth.onAuthStateChange`; unsubscribes on unmount
 * @calledBy src/main.tsx (app root)
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // Initialize user from sessionStorage to survive full page reloads
  const getStoredUser = (): User | null => {
    try {
      const stored = sessionStorage.getItem('spine_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }

  const [user, setUser] = useState<User | null>(getStoredUser)
  const [isLoading, setIsLoading] = useState(false) // Start with false, will set to true only if we need to check
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Save user to sessionStorage whenever it changes
  const setUserWithStorage = (user: User | null) => {
    setUser(user)
    try {
      if (user) {
        sessionStorage.setItem('spine_user', JSON.stringify(user))
      } else {
        sessionStorage.removeItem('spine_user')
      }
    } catch (error) {
      console.warn('Failed to save user to sessionStorage:', error)
    }
  }

  const login = async (email: string, password: string) => {
    console.log('Login function called with:', email)
    setIsLoggingIn(true)
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    console.log('Supabase auth response:', { data, error })

    if (error) {
      console.error('Supabase auth error:', error)
      setIsLoggingIn(false)
      throw error
    }

    if (data.user) {
      console.log('User logged in, fetching server context...')
      
      // Wait a moment for the session to be properly established
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Fetch user context from server instead of hardcoding
      const userContext = await fetchUserContext()
      if (userContext) {
        console.log('Setting server-derived user context:', userContext)
        setUserWithStorage(userContext)
        setAccountId(userContext.account_id)
      } else {
        console.error('Failed to get user context from server')
        // Fallback to minimal user object
        const fallbackUser = {
          id: data.user.id,
          email: data.user.email || '',
          full_name: data.user.user_metadata?.full_name || data.user.email || 'User',
          account_id: '',
          roles: [],
          permissions: [],
        }
        setUserWithStorage(fallbackUser)
        setAccountId(fallbackUser.account_id)
      }
    }
    
    setIsLoggingIn(false)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUserWithStorage(null)
    setAccountId(null)
  }

  const refreshUser = async () => {
    try {
      console.log('Refreshing user...')
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Got session:', session)
      
      if (!session?.user) {
        console.log('No session user, setting user to null')
        setUser(null)
        return
      }

      // Fetch user context from server instead of hardcoding
      const userContext = await fetchUserContext()
      if (userContext) {
        console.log('Setting server-derived user context:', userContext)
        setUser(userContext)
        setAccountId(userContext.account_id)
      } else {
        console.error('Failed to get user context from server')
        setUser(null)
        setAccountId(null)
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
      setUser(null)
      setAccountId(null)
    }
  }

  useEffect(() => {
    // Check initial auth state
    const checkAuth = async () => {
      try {
        // Early exit if user is already loaded
        if (user) {
          console.log('User already loaded, skipping auth check:', user.id)
          return
        }
        
        // Only show loading if we actually need to check auth
        setIsLoading(true)
        console.log('Checking initial auth state...')
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Initial session check:', session?.user?.id ? 'User found' : 'No user')
        
        if (session?.user) {
          // Fetch user context from server instead of hardcoding
          const userContext = await fetchUserContext()
          if (userContext) {
            console.log('Setting server-derived user context from session:', userContext)
            setUserWithStorage(userContext)
            setAccountId(userContext.account_id)
          } else {
            console.error('Failed to get user context from server')
            setUserWithStorage(null)
            setAccountId(null)
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        setUserWithStorage(null)
        setAccountId(null)
      } finally {
        // Always set loading to false after checking
        setIsLoading(false)
        console.log('Auth check completed, loading set to false')
      }
    }

    checkAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id)
        
        // Don't refresh during login to avoid conflicts
        if (isLoggingIn) {
          console.log('Skipping refresh during login')
          return
        }
        
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            // Skip re-fetching if user is already loaded — prevents blocking
            // page fetches when Supabase re-fires SIGNED_IN on browser focus
            setUser(currentUser => {
              if (currentUser) {
                console.log('Auth state changed: user already loaded, skipping re-fetch')
                return currentUser
              }
              // No user yet — fetch context asynchronously
              fetchUserContext().then(userContext => {
                if (userContext) {
                  console.log('Setting server-derived user context from auth state change:', userContext)
                  setUserWithStorage(userContext)
                  setAccountId(userContext.account_id)
                } else {
                  console.error('Failed to get user context from server')
                  setUserWithStorage(null)
                  setAccountId(null)
                }
              })
              return currentUser
            })
          }
        } else if (event === 'SIGNED_OUT') {
          setUserWithStorage(null)
          setAccountId(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [isLoggingIn])

  const value = {
    user,
    isLoading,
    login,
    logout,
    refreshUser
  }

  // Debug: Log loading state changes
  console.log('AuthContext state:', { user: user?.id, isLoading, userEmail: user?.email })

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
