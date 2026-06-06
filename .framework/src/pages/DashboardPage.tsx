/**
 * @module src/pages/DashboardPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Admin home page. On mount, fetches all active item types (`kind=item`)
 * from `/api/types` and then fans out parallel requests to
 * `/api/admin-data?action=stats&entity=items&type_slug=…` to collect
 * per-type item counts (capped at 8 types). Renders:
 * - **Entity overview grid** — one stat card per type + a "Configuration"
 *   shortcut card
 * - **Quick Actions row** — "New <Type>" buttons for the first 4 types plus
 *   a "Configure Types" shortcut
 *
 * @seeAlso src/contexts/AuthContext.tsx (provides current user)
 * @seeAlso src/lib/api.ts (apiFetch)
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'
import { apiFetch } from '../lib/api'
import { useNavigate } from 'react-router-dom'
import { Box, UserGroupIcon, FileText, BarChart3, Settings, Plus } from 'lucide-react';

interface TypeStat {
  name: string
  count: number
  slug: string
  icon: any
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Array<{
    title: string
    value: number
    icon: any
    color: string
    href: string
  }>>([])
  const [typeStats, setTypeStats] = useState<TypeStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch active types with their counts
        const typesResponse = await apiFetch('/api/types?kind=item&is_active=true')
        if (typesResponse.ok) {
          const response = await typesResponse.json()
          const types = response.data || response // Handle both wrapped and unwrapped responses
          
          if (!Array.isArray(types)) {
            console.error('Expected array of types, got:', types)
            setTypeStats([])
            return
          }
          
          // Get counts for each type
          const statsPromises = types.map(async (type: any) => {
            const countResponse = await apiFetch(`/api/admin-data?action=stats&entity=items&type_slug=${type.slug}`)
            if (countResponse.ok) {
              const countData = await countResponse.json()
              return {
                name: type.name,
                count: countData.count || 0,
                slug: type.slug,
                icon: CubeIcon // Default icon, could be enhanced to use type.icon
              }
            }
            return null
          })
          
          const resolvedStats = await Promise.all(statsPromises)
          const validStats = resolvedStats.filter((s): s is NonNullable<typeof s> => s !== null).slice(0, 8) // Limit to 8 types
          setTypeStats(validStats)
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [apiFetch])

  const handleCreateNewItem = (typeSlug: string) => {
    navigate(`/spine-framework/admin/data/items/create?typeSlug=${typeSlug}`)
  }

  const handleViewItems = (typeSlug: string) => {
    navigate(`/spine-framework/admin/data/items?typeSlug=${typeSlug}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Type Stats */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Entity Overview</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {typeStats.map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.slug}
                className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewItems(stat.slug)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{stat.name}</p>
                    <p className="text-xl font-semibold text-slate-900">{stat.count.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )
          })}
          
          {/* Quick Actions Card */}
          <div
            className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate('/spine-framework/admin/configs/types')}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Configuration</p>
                <p className="text-xl font-semibold text-slate-900">Manage</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          Quick Actions
        </h3>
        
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {typeStats.slice(0, 4).map((stat) => (
            <button
              key={`create-${stat.slug}`}
              onClick={() => handleCreateNewItem(stat.slug)}
              className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-5 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">New {stat.name}</span>
            </button>
          ))}
          
          <button 
            onClick={() => navigate('/spine-framework/admin/configs/types')}
            className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-5 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Settings className="h-6 w-6" />
            <span className="text-sm font-medium">Configure Types</span>
          </button>
        </div>
      </div>
    </div>
  )
}
