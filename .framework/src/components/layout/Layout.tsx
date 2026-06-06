/**
 * @module src/components/layout/Layout
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Root app shell providing the two-pane admin layout:
 * - **Desktop (`lg+`):** fixed 60-wide `<Sidebar>` on the left, scrollable
 *   main content area padded with `lg:pl-60`.
 * - **Mobile (`< lg`):** top bar with hamburger button that opens a
 *   slide-over `<Sidebar>` with a backdrop overlay.
 *
 * `isActive` is computed from the current `location.pathname` and passed
 * to `SidebarContent` for active-link highlighting.
 *
 * @seeAlso src/components/layout/Sidebar.tsx
 * @seeAlso src/contexts/AuthContext.tsx (provides `user` and `logout`)
 */

import React, { useState } from 'react'
import { Sidebar, SidebarContent } from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'
import { useLocation } from 'react-router-dom'

/** Props for `Layout`. */
interface LayoutProps {
  children: React.ReactNode
}

/**
 * Root two-pane admin shell.
 *
 * @param props - `LayoutProps`
 * @returns Full-page layout with sidebar + main content area
 * @sideEffects none (sidebar open state is local)
 */
export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/')

  return (
    <div className="min-h-screen bg-[#F2F3F8] flex lg:top-0">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </>
      )}

      {/* Desktop sidebar — visible at lg+ */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:flex-col lg:shrink-0 bg-white border-r border-slate-200 lg:top-0">
        <SidebarContent
          isActive={isActive}
          user={user}
          logout={logout}
          onClose={() => {}}
        />
      </aside>

      {/* Mobile sidebar with menu button */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Open menu"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-3">
          <img src="/spine-logo.jpg" alt="Spine Framework" className="h-8 w-auto" />
          <span className="text-lg font-semibold tracking-tight text-slate-900">Spine Framework</span>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-60">
        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
