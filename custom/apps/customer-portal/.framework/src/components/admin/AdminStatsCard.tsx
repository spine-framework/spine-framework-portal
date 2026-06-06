/**
 * @module src/components/admin/AdminStatsCard
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Single stat card used in admin list page headers. Renders an icon,
 * a title, and a numeric or string value inside a white rounded panel.
 * Icon colour defaults to `'text-blue-500'` but can be overridden per card.
 *
 * @seeAlso src/components/admin/AdminListPage.tsx (mounts this component)
 */

import React from 'react'
import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '../ui/card'

/**
 * Props for `AdminStatsCard`.
 *
 * @prop title - Stat label
 * @prop value - Numeric or formatted string value to display
 * @prop icon - Lucide icon component
 * @prop iconColor - Tailwind text-colour class (default: `'text-blue-500'`)
 */
interface AdminStatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  iconColor?: string
}

/**
 * Single stat card.
 *
 * @param props - `AdminStatsCardProps`
 * @returns White rounded card with icon and stat value
 * @sideEffects none (pure rendering)
 */
export function AdminStatsCard({ title, value, icon: Icon, iconColor = "text-primary" }: AdminStatsCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-muted-foreground truncate">
                {title}
              </dt>
              <dd className="text-lg font-semibold text-foreground">
                {value}
              </dd>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
