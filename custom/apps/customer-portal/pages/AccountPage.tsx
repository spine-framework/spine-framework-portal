import { useAuth } from '@core/contexts/AuthContext'
import { useTickets } from '../hooks/useTickets'
import { useCommunityPosts } from '../hooks/useCommunity'
import { useCourseLessons } from '../hooks/useCourses'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Button } from '@core/components/ui/button'
import { Badge } from '@core/components/ui/badge'
import { Separator } from '@core/components/ui/separator'
import { Skeleton } from '@core/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@core/components/ui/avatar'

export function AccountPage() {
  const { user } = useAuth()
  const { tickets, loading: ticketsLoading } = useTickets()
  const { posts, loading: postsLoading } = useCommunityPosts()
  const { lessons, loading: lessonsLoading } = useCourseLessons()

  const completedLessons = lessons.filter((l) => l.status === 'completed').length
  const initials = (user?.full_name || user?.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const stats = [
    { label: 'Support Tickets', value: tickets.length, loading: ticketsLoading },
    { label: 'Community Posts', value: posts.length, loading: postsLoading },
    { label: 'Lessons Completed', value: completedLessons, loading: lessonsLoading },
  ]

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Account Overview</h1>

      {/* Profile */}
      <Card>
        <CardContent className="py-6 flex items-center gap-5">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="font-semibold text-base">{user?.full_name || '—'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="capitalize">{user?.roles?.[0] || 'member'}</Badge>
              {user?.account?.display_name && <Badge variant="outline">{user.account.display_name}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, loading }) => (
          <Card key={label}>
            <CardContent className="py-5 text-center">
              {loading ? (
                <Skeleton className="h-8 w-12 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-semibold">{value}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account details */}
      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Contact Details</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.full_name || '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium capitalize">{user?.roles?.[0] || 'member'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Settings stubs */}
      <Card>
        <CardHeader>
          <p className="text-sm font-medium">Account Settings</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: 'Email Notifications', desc: 'Receive updates about your activities' },
            { label: 'Privacy Settings', desc: 'Control your data and visibility' },
            { label: 'API Access', desc: 'Manage API keys and integrations' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Button variant="outline" size="sm">Configure</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
