import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AppRecord } from '../../hooks/useApps'
import { GenericListPage } from './GenericListPage'
import { GenericDetailPage } from './GenericDetailPage'

interface NavItem {
  id: string
  label: string
  icon?: string
  path: string
  type_slug?: string
  view?: string
  min_role?: string
}

interface GenericAppShellProps {
  app: AppRecord
}

/**
 * Data-driven app shell. Reads nav_items from the app record to build
 * a sidebar and child routes. Each nav entry with a type_slug renders
 * a GenericListPage (at path) and GenericDetailPage (at path/:id).
 */
export function GenericAppShell({ app }: GenericAppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems: NavItem[] = (app.nav_items || []) as NavItem[]

  // Derive relative paths from app's route_prefix
  const prefix = app.route_prefix || `/${app.slug}`

  // Check if a nav item is active
  const isActive = (item: NavItem) => {
    const fullPath = item.path.startsWith('/') ? item.path : `${prefix}/${item.path}`
    return location.pathname.startsWith(fullPath)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200
        transform transition-transform duration-200 ease-in-out
        lg:translate-x-0 lg:static lg:inset-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center gap-3 h-16 px-6 border-b border-slate-200">
          {app.icon && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold`}
              style={{ backgroundColor: app.color || '#475569' }}>
              {app.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">{app.name}</h2>
            {app.description && (
              <p className="text-xs text-slate-500 truncate max-w-[160px]">{app.description}</p>
            )}
          </div>
        </div>

        <nav className="px-3 py-4 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id || item.path}
              onClick={() => {
                const target = item.path.startsWith('/') ? item.path : `${prefix}/${item.path}`
                navigate(target)
                setSidebarOpen(false)
              }}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive(item)
                  ? 'bg-slate-100 text-slate-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
              `}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center h-16 px-4 border-b border-slate-200 bg-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 font-semibold text-slate-900">{app.name}</span>
        </div>

        <main className="p-6">
          <Routes>
            {/* Default: redirect to first nav item */}
            {navItems.length > 0 && (
              <Route index element={
                <Navigate to={navItems[0].path.startsWith('/') ? navItems[0].path : navItems[0].path} replace />
              } />
            )}

            {/* Generate list + detail routes for each nav item with type_slug */}
            {navItems.filter(item => item.type_slug).map(item => {
              // Strip leading prefix to get relative route path
              const relativePath = item.path.startsWith(prefix)
                ? item.path.slice(prefix.length).replace(/^\//, '')
                : item.path.replace(/^\//, '')

              return [
                <Route
                  key={`${item.id}-list`}
                  path={relativePath}
                  element={
                    <GenericListPage
                      typeSlug={item.type_slug!}
                      viewSlug={item.view}
                      appPrefix={prefix}
                      detailPath={`${relativePath}`}
                    />
                  }
                />,
                <Route
                  key={`${item.id}-new`}
                  path={`${relativePath}/new`}
                  element={
                    <GenericDetailPage
                      typeSlug={item.type_slug!}
                      viewSlug={item.view}
                      isCreating={true}
                    />
                  }
                />,
                <Route
                  key={`${item.id}-detail`}
                  path={`${relativePath}/:id`}
                  element={
                    <GenericDetailPage
                      typeSlug={item.type_slug!}
                      viewSlug={item.view}
                    />
                  }
                />
              ]
            })}

            {/* Empty state */}
            {navItems.length === 0 && (
              <Route path="*" element={
                <div className="text-center py-16">
                  <h2 className="text-lg font-medium text-slate-900">No pages configured</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Add nav_items to this app's record to create pages.
                  </p>
                </div>
              } />
            )}
          </Routes>
        </main>
      </div>
    </div>
  )
}
