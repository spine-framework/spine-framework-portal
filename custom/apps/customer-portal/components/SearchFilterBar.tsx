import React from 'react'
import { Search } from 'lucide-react'
import { Input } from '@core/components/ui/input'

interface SearchFilterBarProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  children?: React.ReactNode
}

export function SearchFilterBar({ placeholder = 'Search…', value, onChange, children }: SearchFilterBarProps) {
  return (
    <div className="relative flex-1">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 h-9"
      />
      {children}
    </div>
  )
}
