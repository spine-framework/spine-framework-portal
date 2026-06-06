/**
 * @module src/pages/admin/SelectTestPage
 * @audience installer
 * @layer frontend-page
 * @stability testing
 *
 * Test page to isolate Select component issues.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Label } from '../../components/ui/label'

export function SelectTestPage() {
  const [selected, setSelected] = useState('')

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Select Component Test</h1>
        <p className="text-muted-foreground">
          Testing shadcn Select component only
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Demo</CardTitle>
          <CardDescription>Testing Select component functionality</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="select-demo">Choose an option</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger id="select-demo">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="option1">Option 1</SelectItem>
                <SelectItem value="option2">Option 2</SelectItem>
                <SelectItem value="option3">Option 3</SelectItem>
                <SelectItem value="option4">Option 4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Selected value: {selected || 'none'}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
