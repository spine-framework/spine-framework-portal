import { useNavigate } from 'react-router-dom'
import { Ticket, Users, BookOpen, GraduationCap, Store, ArrowRight } from 'lucide-react'
import { useAuth } from '@core/contexts/AuthContext'
import { Card, CardContent, CardHeader } from '@core/components/ui/card'
import { Button } from '@core/components/ui/button'
import { Skeleton } from '@core/components/ui/skeleton'
import { Badge } from '@core/components/ui/badge'
import { useTickets } from '../hooks/useTickets'
import { useKBArticles } from '../hooks/useKBArticles'
import { useCourseLessons } from '../hooks/useCourses'
import { useCommunityPosts } from '../hooks/useCommunity'

function StatSkeleton() {
  return <Skeleton className="h-4 w-20 mt-1" />
}

export function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { tickets, loading: ticketsLoading } = useTickets()
  const { articles, loading: articlesLoading } = useKBArticles()
  const { lessons, loading: lessonsLoading } = useCourseLessons()
  const { posts, loading: postsLoading } = useCommunityPosts()

  const openTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved').length
  const firstName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'

  const SECTIONS = [
    {
      icon: Ticket,
      label: 'Tickets',
      path: '/portal/tickets',
      description: 'Submit and track your support requests. Get help from our team and stay updated on your issues.',
      stat: ticketsLoading ? null : `${openTickets} open ticket${openTickets !== 1 ? 's' : ''}`,
      loading: ticketsLoading,
      badgeVariant: openTickets > 0 ? 'default' : 'secondary',
    },
    {
      icon: Users,
      label: 'Community',
      path: '/portal/community',
      description: 'Join discussions, ask questions, and connect with other users in our community forums.',
      stat: postsLoading ? null : `${posts.length} discussion${posts.length !== 1 ? 's' : ''}`,
      loading: postsLoading,
      badgeVariant: 'secondary',
    },
    {
      icon: GraduationCap,
      label: 'Courses',
      path: '/portal/courses',
      description: 'Learn at your own pace with guided courses and lessons tailored to help you get the most out of the platform.',
      stat: lessonsLoading ? null : `${lessons.length} lesson${lessons.length !== 1 ? 's' : ''} available`,
      loading: lessonsLoading,
      badgeVariant: 'secondary',
    },
    {
      icon: BookOpen,
      label: 'Knowledge Base',
      path: '/portal/kb',
      description: 'Browse articles, guides, and documentation to find answers quickly without waiting for support.',
      stat: articlesLoading ? null : `${articles.length} article${articles.length !== 1 ? 's' : ''}`,
      loading: articlesLoading,
      badgeVariant: 'secondary',
    },
  ] as const

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 space-y-10">
        {/* Hero */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground">
            Your portal for support, learning, and community. What do you need today?
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SECTIONS.map(({ icon: Icon, label, path, description, stat, loading, badgeVariant }) => (
            <Card
              key={path}
              className="group cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
              onClick={() => navigate(path)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-md bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <span className="font-semibold text-base">{label}</span>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                {loading ? (
                  <StatSkeleton />
                ) : (
                  <Badge variant={badgeVariant as any} className="text-xs">
                    {stat}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Marketplace — full width */}
        <Card
          className="group cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all border-dashed"
          onClick={() => navigate('/portal/marketplace')}
        >
          <CardContent className="flex items-center gap-6 py-6">
            <div className="p-3 rounded-md bg-primary/10 text-primary shrink-0">
              <Store size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base">Marketplace</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Browse plugins, integrations, and apps to extend your portal experience.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              Explore <ArrowRight size={14} />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
