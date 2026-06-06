import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@core/components/ui/card'
import { Badge } from '@core/components/ui/badge'
import { Button } from '@core/components/ui/button'
import { LoadingSpinner } from '@core/components/ui/LoadingSpinner'
import { useApi } from '@core/hooks/useApi'
import { apiFetch } from '@core/lib/api'
import { Brain, TrendingUp, Users, Target, Clock, AlertCircle } from 'lucide-react'

interface FunnelSignal {
  id: string
  title: string
  data: {
    signal_type: string
    score_delta: number
    account_id?: string
    person_id?: string
    occurred_at: string
  }
  created_at: string
}

interface Account {
  id: string
  display_name: string
  data: {
    lead_score?: number
    lifecycle_stage?: string
  }
}

interface Task {
  id: string
  title: string
  data: {
    task_type: string
    priority: string
    account_id?: string
    person_id?: string
    description: string
    due_date?: string
  }
  status: string
}

interface ActivityLog {
  id: string
  title: string
  data: {
    action: string
    account_id?: string
    signal_type?: string
    score_delta?: number
    new_score?: number
    new_stage?: string
  }
  created_at: string
}

export default function IntelligencePage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [signals, setSignals] = useState<FunnelSignal[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch accounts with lead scores
  const { data: accountsData, loading: accountsLoading } = useApi(async () => {
    const res = await apiFetch('/api/admin-data?action=list&entity=accounts&limit=50')
    const json = await res.json()
    return json.data || []
  })

  // Fetch funnel signals
  const { data: signalsData, loading: signalsLoading } = useApi(async () => {
    const res = await apiFetch('/api/admin-data?action=list&entity=items&type_slug=funnel_signal&limit=20')
    const json = await res.json()
    return json.data || []
  })

  // Fetch tasks
  const { data: tasksData, loading: tasksLoading } = useApi(async () => {
    const res = await apiFetch('/api/admin-data?action=list&entity=items&type_slug=task&limit=20')
    const json = await res.json()
    return json.data || []
  })

  // Fetch activity logs
  const { data: activitiesData, loading: activitiesLoading } = useApi(async () => {
    const res = await apiFetch('/api/admin-data?action=list&entity=items&type_slug=activity_log&limit=20')
    const json = await res.json()
    return json.data || []
  })

  useEffect(() => {
    if (accountsData) {
      setAccounts(accountsData.filter((acc: any) => acc.data?.lead_score !== undefined))
    }
  }, [accountsData])

  useEffect(() => {
    if (signalsData) setSignals(signalsData)
    if (tasksData) setTasks(tasksData)
    if (activitiesData) setActivities(activitiesData)
    setLoading(false)
  }, [signalsData, tasksData, activitiesData])

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId)

  const getLifecycleStageColor = (stage?: string) => {
    switch (stage) {
      case 'product_qualified_lead': return 'bg-green-500'
      case 'engaged_lead': return 'bg-blue-500'
      case 'identified_lead': return 'bg-yellow-500'
      case 'anonymous': return 'bg-gray-500'
      default: return 'bg-gray-400'
    }
  }

  const getSignalTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'docs_view': 'bg-blue-100 text-blue-800',
      'pricing_visit': 'bg-purple-100 text-purple-800',
      'portal_account_created': 'bg-green-100 text-green-800',
      'spine_install_registered': 'bg-orange-100 text-orange-800',
      'marketplace_app_installed': 'bg-pink-100 text-pink-800'
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading || accountsLoading || signalsLoading || tasksLoading || activitiesLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cortex Intelligence</h1>
          <p className="text-muted-foreground">Funnel intelligence and lead scoring insights</p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <Brain className="w-4 h-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      {/* Account Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Account Intelligence
          </CardTitle>
          <CardDescription>Select an account to view detailed intelligence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedAccountId === account.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                }`}
                onClick={() => setSelectedAccountId(account.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{account.display_name}</h3>
                  <Badge className={getLifecycleStageColor(account.data?.lifecycle_stage)}>
                    {account.data?.lifecycle_stage || 'unknown'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-blue-600">
                    {account.data?.lead_score || 0}
                  </div>
                  <div className="text-sm text-gray-500">Lead Score</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedAccount && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Signals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Recent Funnel Signals
              </CardTitle>
              <CardDescription>Latest signals for {selectedAccount?.display_name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {signals
                  .filter(signal => signal.data.account_id === selectedAccountId)
                  .slice(0, 5)
                  .map((signal) => (
                    <div key={signal.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center space-x-3">
                        <Badge className={getSignalTypeColor(signal.data.signal_type)}>
                          {signal.data.signal_type}
                        </Badge>
                        <div>
                          <div className="font-medium">{signal.title}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(signal.data.occurred_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className={`font-bold ${
                        signal.data.score_delta > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {signal.data.score_delta > 0 ? '+' : ''}{signal.data.score_delta}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="w-5 h-5 mr-2" />
                Recommended Actions
              </CardTitle>
              <CardDescription>Tasks for {selectedAccount?.display_name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tasks
                  .filter(task => task.data.account_id === selectedAccountId)
                  .slice(0, 5)
                  .map((task) => (
                    <div key={task.id} className="p-3 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={getPriorityColor(task.data.priority)}>
                          {task.data.priority}
                        </Badge>
                        {task.data.due_date && (
                          <div className="flex items-center text-sm text-gray-500">
                            <Clock className="w-4 h-4 mr-1" />
                            {new Date(task.data.due_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <h4 className="font-medium mb-1">{task.title}</h4>
                      <p className="text-sm text-gray-600">{task.data.description}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Activity Timeline
          </CardTitle>
          <CardDescription>Recent funnel intelligence activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 p-3 border rounded">
                <AlertCircle className="w-5 h-5 mt-0.5 text-blue-500" />
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <Badge variant="outline">{activity.data.action}</Badge>
                    {activity.data.signal_type && (
                      <Badge className={getSignalTypeColor(activity.data.signal_type)}>
                        {activity.data.signal_type}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">
                    {activity.data.new_score !== undefined && (
                      <>Score updated to {activity.data.new_score}</>
                    )}
                    {activity.data.new_stage && (
                      <> · Stage: {activity.data.new_stage}</>
                    )}
                  </p>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(activity.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
