import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import { 
  Home, 
  Box, 
  Users, 
  Settings, 
  FileText, 
  Sparkles, 
  LogOut, 
  Building2, 
  RefreshCw, 
  Zap, 
  Clock, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Link as LinkIcon, 
  User, 
  MoreVertical, 
  ShieldCheck, 
  Key, 
  FlaskConical, 
  BarChart3, 
  Bell
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navigation = [
  { name: 'Dashboard', href: '/spine-framework/admin/configs/types', icon: Home },
]

const configsNavigation = [
  { name: 'Item Types', href: '/spine-framework/admin/configs/types', icon: Box },
  { divider: true },
  { name: 'Apps', href: '/spine-framework/admin/configs/apps', icon: Settings },
  { name: 'Roles', href: '/spine-framework/admin/configs/roles', icon: ShieldCheck },
  { divider: true },
  { name: 'AI Agents', href: '/spine-framework/admin/configs/ai-agents', icon: Sparkles },
  { name: 'Prompt Configs', href: '/spine-framework/admin/configs/prompts', icon: FileText },
  { name: 'Embeddings', href: '/spine-framework/admin/configs/embeddings', icon: FileText },
  { divider: true },
  { name: 'Pipelines', href: '/spine-framework/admin/configs/pipelines', icon: RefreshCw },
  { name: 'Triggers', href: '/spine-framework/admin/configs/triggers', icon: Zap },
  { name: 'Timers', href: '/spine-framework/admin/configs/timers', icon: Clock },
  { divider: true },
  { name: 'Integrations', href: '/spine-framework/admin/configs/integrations', icon: LinkIcon },
  { name: 'API Keys', href: '/spine-framework/admin/configs/api-keys', icon: Key },
] as const

const observabilityNavigation = [
  { name: 'Dashboard', href: '/spine-framework/admin/observability', icon: BarChart3 },
  { name: 'Alerts', href: '/spine-framework/admin/observability/alerts', icon: Bell },
  { name: 'Executions', href: '/spine-framework/admin/observability/executions', icon: FlaskConical },
  { name: 'Logs', href: '/spine-framework/admin/observability/logs', icon: FileText },
]

// Database entities that should be shown in runtime navigation
const runtimeEntities = [
  { name: 'Items', href: '/spine-framework/admin/runtime/items', icon: Box },
  { name: 'Accounts', href: '/spine-framework/admin/runtime/accounts', icon: Building2 },
  { name: 'People', href: '/spine-framework/admin/runtime/people', icon: User },
  { name: 'Person Types', href: '/spine-framework/admin/runtime/person-types', icon: Users },
]

function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile sidebar */}
      <div className={classNames(open && 'fixed inset-0 z-40 flex')}> 
        {open && (
          <div className="fixed inset-0 z-40 flex">
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity" 
              onClick={onClose}
            />
            <div className="relative flex w-full max-w-xs flex-1 flex-col bg-sidebar pb-4">
              <div className="absolute right-0 top-0 -mr-12 pt-2">
                <button
                  type="button"
                  className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  onClick={onClose}
                >
                  <span className="sr-only">Close sidebar</span>
                  <X className="h-6 w-6 text-white" aria-hidden="true" />
                </button>
              </div>
              <div className="h-0 flex-1 overflow-y-auto pt-5">
                <div className="flex flex-shrink-0 items-center px-4">
                  <span className="text-xl font-bold text-sidebar-foreground">Spine</span>
                </div>
                <SidebarContent onNavClick={onClose} />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

interface SidebarContentProps {
  onNavClick?: () => void
}

export function SidebarContent({ onNavClick }: SidebarContentProps) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const isSystemAdmin = user?.roles?.includes('system_admin')

  // Collapsible sections state
  const [configsOpen, setConfigsOpen] = useState(() => 
    location.pathname.includes('/admin/configs')
  )
  const [runtimeOpen, setRuntimeOpen] = useState(() => 
    location.pathname.includes('/admin/runtime')
  )
  const [observabilityOpen, setObservabilityOpen] = useState(() =>
    location.pathname.includes('/admin/observability')
  )

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  return (
    <nav className="mt-5 flex flex-1 flex-col px-2">
      {/* Main nav */}
      <div className="space-y-1">
        {navigation.map((item) => (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavClick}
            className={classNames(
              isActive(item.href)
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              'group flex items-center rounded-md px-2 py-2 text-sm font-medium'
            )}
          >
            <item.icon
              className={classNames(
                isActive(item.href) ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground',
                'mr-3 h-5 w-5 flex-shrink-0'
              )}
              aria-hidden="true"
            />
            {item.name}
          </Link>
        ))}
      </div>

      {/* Configs Section */}
      {isSystemAdmin && (
        <>
          <div className="mt-6">
            <button
              onClick={() => setConfigsOpen(!configsOpen)}
              className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
            >
              <span>Configuration</span>
              {configsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            
            {configsOpen && (
              <div className="mt-1 space-y-1">
                {configsNavigation.map((item, index) => (
                  'divider' in item ? (
                    <div key={`divider-${index}`} className="my-2 border-t border-sidebar-border" />
                  ) : (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onNavClick}
                      className={classNames(
                        isActive(item.href)
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        'group flex items-center rounded-md px-2 py-2 text-sm font-medium pl-4'
                      )}
                    >
                      <item.icon
                        className={classNames(
                          isActive(item.href) ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground',
                          'mr-3 h-4 w-4 flex-shrink-0'
                        )}
                        aria-hidden="true"
                      />
                      {item.name}
                    </Link>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Runtime Section */}
          <div className="mt-4">
            <button
              onClick={() => setRuntimeOpen(!runtimeOpen)}
              className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
            >
              <span>Data</span>
              {runtimeOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            
            {runtimeOpen && (
              <div className="mt-1 space-y-1">
                {runtimeEntities.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={onNavClick}
                    className={classNames(
                      isActive(item.href)
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      'group flex items-center rounded-md px-2 py-2 text-sm font-medium pl-4'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        isActive(item.href) ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground',
                        'mr-3 h-4 w-4 flex-shrink-0'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Observability Section */}
          <div className="mt-4">
            <button
              onClick={() => setObservabilityOpen(!observabilityOpen)}
              className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md"
            >
              <span>Observability</span>
              {observabilityOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            
            {observabilityOpen && (
              <div className="mt-1 space-y-1">
                {observabilityNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={onNavClick}
                    className={classNames(
                      isActive(item.href)
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      'group flex items-center rounded-md px-2 py-2 text-sm font-medium pl-4'
                    )}
                  >
                    <item.icon
                      className={classNames(
                        isActive(item.href) ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground',
                        'mr-3 h-4 w-4 flex-shrink-0'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* User section */}
      <div className="mt-auto border-t border-sidebar-border pt-4">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1 text-left">
                <p className="truncate text-sm font-medium">{user?.email || 'User'}</p>
              </div>
              <MoreVertical className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="space-y-1">
              <button
                onClick={() => {
                  logout()
                }}
                className="flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  )
}
