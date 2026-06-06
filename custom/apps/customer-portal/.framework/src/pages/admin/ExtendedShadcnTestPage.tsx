/**
 * @module src/pages/admin/ExtendedShadcnTestPage
 * @audience installer
 * @layer frontend-page
 * @stability testing
 *
 * Extended test page with more shadcn components to identify problematic imports.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Checkbox } from '../../components/ui/checkbox'

export function ExtendedShadcnTestPage() {
  const [count, setCount] = useState(0)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState('')
  const [checked, setChecked] = useState(false)

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Extended shadcn Test</h1>
        <p className="text-muted-foreground">
          Testing 7 shadcn components: Card, Button, Badge, Input, Label, Select, Checkbox
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Form Controls</CardTitle>
            <CardDescription>Testing Select and Checkbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="select-demo">Select Demo</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="select-demo">
                  <SelectValue placeholder="Choose an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="option1">Option 1</SelectItem>
                  <SelectItem value="option2">Option 2</SelectItem>
                  <SelectItem value="option3">Option 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="checkbox-demo" 
                checked={checked}
                onCheckedChange={(checked) => setChecked(checked as boolean)}
              />
              <Label htmlFor="checkbox-demo">
                Enable notifications
              </Label>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Selected: {selected || 'none'}<br/>
              Checked: {checked ? 'yes' : 'no'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interactive Demo</CardTitle>
            <CardDescription>Combining multiple components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="input-demo">Text Input</Label>
              <Input
                id="input-demo"
                placeholder="Type something..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={() => setCount(count + 1)}>
                Add Count
              </Button>
              <Button variant="outline" onClick={() => setCount(0)}>
                Reset
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Badge>Count: {count}</Badge>
              <Badge variant={checked ? "default" : "secondary"}>
                {checked ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Combined Component Test</CardTitle>
          <CardDescription>All components working together</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="combined-input">Your Name</Label>
              <Input
                id="combined-input"
                placeholder="Enter name"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="combined-select">Role</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger id="combined-select">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={() => setCount(count + 1)}
                disabled={!text || !selected}
                className="w-full"
              >
                Submit ({count})
              </Button>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="agree-terms"
                checked={checked}
                onCheckedChange={(checked) => setChecked(checked as boolean)}
              />
              <Label htmlFor="agree-terms">
                I agree to the terms
              </Label>
            </div>
            
            <Badge variant={checked ? "default" : "outline"}>
              {checked ? "Ready" : "Not Ready"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
