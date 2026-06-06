import { EntityFilter } from '../../types/types'
import { Card, CardContent } from '../ui/card'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Button } from '../ui/button'
import { Label } from '../ui/label'

interface DataFiltersProps {
  filters: EntityFilter[]
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  onClear: () => void
}

export function DataFilters({ filters, values, onChange, onClear }: DataFiltersProps) {
  const handleFilterChange = (key: string, value: any) => {
    onChange({ ...values, [key]: value })
  }
  
  const hasActiveFilters = Object.values(values).some(v => v !== undefined && v !== '' && v !== 'all')
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {filters.map((filter) => (
            <div key={filter.key} className="sm:w-48">
              <Label className="text-xs font-medium text-muted-foreground mb-2 block">
                {filter.label}
              </Label>
              
              {filter.type === 'search' && (
                <Input
                  type="text"
                  value={values[filter.key] || ''}
                  onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                  placeholder={`Search ${filter.label.toLowerCase()}...`}
                />
              )}
              
              {filter.type === 'enum' && (
                <Select 
                  value={values[filter.key] || 'all'} 
                  onValueChange={(value) => handleFilterChange(filter.key, value === 'all' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`All ${filter.label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {filter.label}</SelectItem>
                    {filter.options?.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {filter.type === 'boolean' && (
                <Select 
                  value={values[filter.key]?.toString() || 'all'}
                  onValueChange={(value) => {
                    handleFilterChange(filter.key, value === 'all' ? undefined : value === 'true')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          
          {hasActiveFilters && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
