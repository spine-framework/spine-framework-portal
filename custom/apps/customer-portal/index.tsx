import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { LoadingSpinner } from '@core/components/ui/LoadingSpinner'
import { TooltipProvider } from '@core/components/ui/tooltip'
import { PortalHeader } from './components/PortalHeader'
import { PortalFooter } from './components/PortalFooter'
import { useCurrentApp } from '@core/contexts/AppContext'

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const TicketsPage = lazy(() => import('./pages/TicketsPage').then(m => ({ default: m.TicketsPage })))
const CommunityPage = lazy(() => import('./pages/CommunityPage').then(m => ({ default: m.CommunityPage })))
const CoursesPage = lazy(() => import('./pages/CoursesPage').then(m => ({ default: m.CoursesPage })))
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then(m => ({ default: m.KnowledgePage })))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })))

function PortalLayout() {
  const location = useLocation()
  const app = useCurrentApp()

  // Normalize route_prefix: '/' → '' so paths are /, /tickets, /kb, etc.
  const base = app.route_prefix === '/' ? '' : (app.route_prefix || '')
  const prefixDepth = base.split('/').filter(Boolean).length

  const segments = location.pathname.split('/').filter(Boolean)
  const appSegments = segments.slice(prefixDepth) // strips the prefix segments

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      <PortalHeader />
      <main className="flex-1 flex flex-col min-h-0">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><LoadingSpinner /></div>}>
          <div className="flex-1 flex flex-col min-h-0">
            <Routes>
              <Route index element={<HomePage />} />
              <Route path="tickets" element={<TicketsPage />} />
              <Route path="tickets/:id" element={<TicketsPage />} />
              <Route path="kb" element={<KnowledgePage />} />
              <Route path="knowledge" element={<Navigate to="kb" replace />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="marketplace" element={<MarketplacePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </Suspense>
      </main>
      <PortalFooter />
    </div>
  )
}

export default function CustomerPortalApp() {
  return (
    <TooltipProvider>
      <PortalLayout />
    </TooltipProvider>
  )
}
