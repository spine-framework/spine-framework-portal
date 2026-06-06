import React, { ReactNode } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Skeleton } from '../ui/skeleton'
import { Search } from 'lucide-react'
import { LucideIcon } from 'lucide-react'
import { AdminStatsCard } from './AdminStatsCard'
import { cn } from '../../lib/utils'

interface AdminListPageProps {
  title: string
  description: string
  newButtonText?: string
  newButtonHref?: string
  onNewClick?: () => void
  statsCards: Array<{
    title: string
    value: string | number
    icon: LucideIcon
    iconColor?: string
  }>
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  filters?: Array<{
    label: string
    value: string
    options: Array<{ value: string; label: string }>
    onChange: (value: string) => void
  }>
  children: ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyMessage?: string
  emptyIcon?: LucideIcon
}

export function AdminListPage({
  title,
  description,
  newButtonText,
  newButtonHref = '#',
  onNewClick,
  statsCards,
  searchPlaceholder = "Search...",
  searchValue = "",
  onSearchChange,
  filters = [],
  children,
  loading = false,
  error = null,
  onRetry,
}: AdminListPageProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        
        {newButtonText && (
          <Button onClick={() => onNewClick ? onNewClick() : (window.location.href = newButtonHref!)}>
            {newButtonText}
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <AdminStatsCard
            key={index}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            iconColor={stat.iconColor}
          />
        ))}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            {onSearchChange && (
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            )}

            {/* Filters */}
            {filters.map((filter, index) => (
              <div key={index} className="sm:w-48">
                <Select value={filter.value} onValueChange={filter.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {filter.options.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        {loading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-destructive">Error: {error}</p>
            {onRetry && (
              <Button onClick={onRetry} className="mt-4">
                Retry
              </Button>
            )}
          </div>
        ) : (
          <CardContent className="p-0">
            {children}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
