import React, { lazy, Suspense, Component } from 'react'
import type { ReactNode } from 'react'
import { LoadingSpinner } from './ui/LoadingSpinner'

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  slug: string
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center p-8 max-w-lg">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">App Load Error</h1>
            <p className="text-slate-600 mb-4">
              Failed to load the <strong>{this.props.slug}</strong> app.
            </p>
            <pre className="bg-slate-100 rounded-lg p-4 text-left text-sm text-red-600 overflow-auto mb-4">
              {this.state.error.message}
            </pre>
            <p className="text-sm text-slate-500">
              Check that <code>apps/{this.props.slug}/index.tsx</code> exists and exports a default component.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ─── LOADER ───────────────────────────────────────────────────────────────────

// Static glob maps — Vite analyzes these at build time and builds a complete
// module map. Runtime lookup is just a map key lookup, no dynamic string eval.
// Custom apps take precedence over core apps with the same slug.
const customAppModules = import.meta.glob('../../../custom/apps/*/index.tsx')
const coreAppModules   = import.meta.glob('../apps/*/index.tsx')

// Module-level cache for lazy components to avoid re-creating on each render
const appModuleCache = new Map<string, React.LazyExoticComponent<React.ComponentType>>()

// Resolve the glob key for a given slug from the custom or core map.
function resolveAppLoader(slug: string): (() => Promise<{ default: React.ComponentType }>) | null {
  // Check custom first (custom/apps/{slug}/index.tsx)
  const customKey = `../../../custom/apps/${slug}/index.tsx`
  if (customAppModules[customKey]) {
    return customAppModules[customKey] as () => Promise<{ default: React.ComponentType }>
  }
  // Fall back to core (../apps/{slug}/index.tsx relative to this file)
  const coreKey = `../apps/${slug}/index.tsx`
  if (coreAppModules[coreKey]) {
    return coreAppModules[coreKey] as () => Promise<{ default: React.ComponentType }>
  }
  return null
}

function getAppComponent(slug: string): React.LazyExoticComponent<React.ComponentType> {
  if (!appModuleCache.has(slug)) {
    const loader = resolveAppLoader(slug)
    const LazyComponent = lazy(
      loader
        ? loader
        : () => Promise.reject(new Error(`App "${slug}" not found. Expected apps/${slug}/index.tsx in custom/apps or .framework/src/apps.`))
    )
    appModuleCache.set(slug, LazyComponent)
  }
  return appModuleCache.get(slug)!
}

interface CustomAppLoaderProps {
  slug: string
}

/**
 * Lazy-loads a custom app component from apps/{slug}/index.tsx.
 * Wraps in an error boundary so a broken app doesn't crash the entire site.
 */
export function CustomAppLoader({ slug }: CustomAppLoaderProps) {
  const AppComponent = getAppComponent(slug)

  return (
    <AppErrorBoundary slug={slug}>
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner />
        </div>
      }>
        <AppComponent />
      </Suspense>
    </AppErrorBoundary>
  )
}
