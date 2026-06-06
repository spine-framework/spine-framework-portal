import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Ticket, Users, BookOpen, GraduationCap, Store, LayoutGrid, User, LogOut, Save } from 'lucide-react'
import { useAuth } from '@core/contexts/AuthContext'
import { Button } from '@core/components/ui/button'
import { Avatar, AvatarFallback } from '@core/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@core/components/ui/dialog'
import { Input } from '@core/components/ui/input'
import { Label } from '@core/components/ui/label'
import { Separator } from '@core/components/ui/separator'

const NAV_ITEMS = [
  { label: 'Tickets',        path: '/portal/tickets',     icon: Ticket },
  { label: 'Knowledge Base', path: '/portal/kb',          icon: BookOpen },
  { label: 'Courses',        path: '/portal/courses',     icon: GraduationCap },
  { label: 'Community',      path: '/portal/community',   icon: Users },
  { label: 'Marketplace',    path: '/portal/marketplace', icon: Store },
]

export function PortalHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)
  const [displayName, setDisplayName] = useState(user?.full_name || user?.email?.split('@')[0] || '')

  const initials = (displayName || user?.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleSave = () => {
    setAccountOpen(false)
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
        <div className="flex items-center h-14 px-6 gap-6">
          <NavLink to="/portal" className="flex items-center gap-2 shrink-0 text-foreground hover:text-primary transition-colors">
            <LayoutGrid size={18} className="text-primary" />
            <span className="font-semibold tracking-tight text-sm">Customer Portal</span>
          </NavLink>

          <nav className="flex items-center gap-1 flex-1">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  ].join(' ')
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>

          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => setAccountOpen(true)}
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium hidden sm:inline">{displayName || user?.email}</span>
          </Button>
        </div>
      </header>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{displayName || '—'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled className="text-muted-foreground" />
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account Info</p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Role: <span className="text-foreground font-medium capitalize">{user?.roles?.[0] || 'member'}</span></p>
                <p>Account: <span className="text-foreground font-medium">{user?.account?.display_name || '—'}</span></p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive gap-2 sm:mr-auto"
              onClick={handleSignOut}
            >
              <LogOut size={14} />
              Sign Out
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Save size={14} />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
