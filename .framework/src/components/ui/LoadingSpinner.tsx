/**
 * @module src/components/ui/LoadingSpinner
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Animated CSS spinner used to indicate loading state inline or as a
 * centred overlay. Uses `border-t-blue-600` as the active segment colour
 * and `border-slate-200` for the track.
 *
 * @seeAlso src/lib/utils.ts (cn)
 */

import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Props for `LoadingSpinner`.
 *
 * @prop size - Diameter: `'sm'` (16px), `'md'` (24px), `'lg'` (32px)
 * @prop className - Additional Tailwind classes
 */
interface LoadingSpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Inline animated spinner.
 *
 * @param props - `LoadingSpinnerProps`
 * @returns `<Loader2>` styled as a spinning ring
 * @sideEffects none (pure rendering)
 */
export function LoadingSpinner({ className, size = 'md' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <Loader2
      className={cn(
        'animate-spin',
        sizeClasses[size],
        className
      )}
    />
  )
}
