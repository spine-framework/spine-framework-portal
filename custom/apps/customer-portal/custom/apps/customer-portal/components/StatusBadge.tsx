import { Badge } from '@core/components/ui/badge'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  new:         'default',
  open:        'default',
  working:     'outline',
  pending:     'outline',
  in_progress: 'outline',
  returned:    'destructive',
  resolved:    'secondary',
  completed:   'secondary',
  closed:      'secondary',
  not_started: 'secondary',
}

const STATUS_LABELS: Record<string, string> = {
  new:         'New',
  working:     'Working',
  pending:     'Pending',
  returned:    'Returned',
  resolved:    'Resolved',
  closed:      'Closed',
  open:        'Open',
  completed:   'Completed',
  not_started: 'Not Started',
  in_progress: 'In Progress',
}

interface StatusBadgeProps {
  status: string
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = STATUS_VARIANTS[status] ?? 'secondary'
  const label = STATUS_LABELS[status] ?? status

  return (
    <Badge variant={variant} className="text-xs">
      {label}
    </Badge>
  )
}
