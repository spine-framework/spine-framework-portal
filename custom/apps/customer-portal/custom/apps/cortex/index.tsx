import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { LoadingSpinner } from '@core/components/ui/LoadingSpinner'
import { AppShell } from '@core/components/layout/AppShell'
import { CortexSidebar } from './components/CortexSidebar'
import { TooltipProvider } from '@core/components/ui/tooltip'

const CortexDashboard = lazy(() => import('./pages/CortexDashboard'))

// CRM
const AccountsPage = lazy(() => import('./pages/crm/AccountsPage'))
const AccountDetailPage = lazy(() => import('./pages/crm/AccountDetailPage'))
const ContactsPage = lazy(() => import('./pages/crm/ContactsPage'))
const DealsPage = lazy(() => import('./pages/crm/DealsPage'))
const DealDetailPage = lazy(() => import('./pages/crm/DealDetailPage'))
const HealthPage = lazy(() => import('./pages/crm/HealthPage'))
const ActivityPage = lazy(() => import('./pages/crm/ActivityPage'))

// Support
const SupportPage = lazy(() => import('./pages/support/SupportPage'))
const TicketDetailPage = lazy(() => import('./pages/support/TicketDetailPage'))
const RedactionReview = lazy(() => import('./pages/support/RedactionReview'))

// Community
const CommunityPage = lazy(() => import('./pages/community/CommunityPage'))

// KB
const KBPage = lazy(() => import('./pages/kb/KBPage'))
const KBEditorPage = lazy(() => import('./pages/kb/KBEditorPage'))
const KBIngestionPage = lazy(() => import('./pages/kb/KBIngestionPage'))

// Courses
const CoursesPage = lazy(() => import('./pages/courses/CoursesPage'))

// Intelligence
const IntelligencePage = lazy(() => import('./pages/intelligence/IntelligencePage'))

const Fallback = <div className="min-h-[400px] flex items-center justify-center"><LoadingSpinner /></div>

function CortexLayout() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  const breadcrumbs: { title: string; url?: string }[] = [{ title: 'Cortex', url: '/cortex/dashboard' }]
  if (segments[1] && segments[1] !== 'dashboard') {
    breadcrumbs.push({ title: segments[1].charAt(0).toUpperCase() + segments[1].slice(1) })
  }
  if (segments[2]) {
    breadcrumbs.push({ title: segments[2].charAt(0).toUpperCase() + segments[2].slice(1) })
  }

  return (
    <AppShell sidebar={<CortexSidebar />} breadcrumbs={breadcrumbs}>
      <Suspense fallback={Fallback}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<CortexDashboard />} />

          {/* CRM */}
          <Route path="crm/accounts/:id" element={<AccountDetailPage />} />
          <Route path="crm/accounts" element={<AccountsPage />} />
          <Route path="crm/contacts" element={<ContactsPage />} />
          <Route path="crm/deals/new" element={<DealDetailPage />} />
          <Route path="crm/deals/:id" element={<DealDetailPage />} />
          <Route path="crm/deals" element={<DealsPage />} />
          <Route path="crm/health" element={<HealthPage />} />
          <Route path="crm/activity" element={<ActivityPage />} />

          {/* Support */}
          <Route path="support/:id/kb-review" element={<RedactionReview />} />
          <Route path="support/:id" element={<TicketDetailPage />} />
          <Route path="support" element={<SupportPage />} />

          {/* Community */}
          <Route path="community" element={<CommunityPage />} />

          {/* KB */}
          <Route path="kb/new" element={<KBEditorPage />} />
          <Route path="kb/:id/edit" element={<KBEditorPage />} />
          <Route path="kb/ingestion" element={<KBIngestionPage />} />
          <Route path="kb" element={<KBPage />} />

          {/* Courses */}
          <Route path="courses/*" element={<CoursesPage />} />

          {/* Intelligence */}
          <Route path="intelligence" element={<IntelligencePage />} />

          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}

export default function CortexApp() {
  return (
    <TooltipProvider>
      <CortexLayout />
    </TooltipProvider>
  )
}
