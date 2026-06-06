import { EntityStat } from '../../types/types'
import { Card, CardContent } from '../ui/card'
import * as Icons from 'lucide-react'

interface DataStatsProps {
  stats: EntityStat[]
  data: any[]
  loading?: boolean
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-500',
  green: 'bg-green-500/10 text-green-500',
  red: 'bg-red-500/10 text-red-500',
  orange: 'bg-orange-500/10 text-orange-500',
  purple: 'bg-purple-500/10 text-purple-500',
  gray: 'bg-muted text-muted-foreground'
}

export function DataStats({ stats, data, loading }: DataStatsProps) {
  const calculateStat = (stat: EntityStat): number => {
    if (!data) return 0
    
    switch (stat.type) {
      case 'count':
        return data.length
      case 'filter_count':
        return data.filter(item => {
          if (!stat.filter) return true
          return Object.entries(stat.filter).every(([key, value]) => {
            const itemValue = key.includes('.') 
              ? key.split('.').reduce((obj, k) => obj?.[k], item)
              : item[key]
            return itemValue === value
          })
        }).length
      default:
        return 0
    }
  }
  
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const IconComponent = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[stat.icon] || Icons.Box
        const value = loading ? '-' : calculateStat(stat)
        
        return (
          <Card key={index}>
            <CardContent className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 rounded-md p-3 ${colorMap[stat.color] || colorMap.gray}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <p className="text-sm font-medium text-muted-foreground truncate">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-semibold text-foreground">
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
