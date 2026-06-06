/**
 * @module src/pages/admin/IncrementalShadcnTestPage
 * @audience installer
 * @layer frontend-page
 * @stability testing
 *
 * Incremental test page to identify problematic shadcn component imports.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'

export function IncrementalShadcnTestPage() {
  const [count, setCount] = useState(0)
  const [text, setText] = useState('')

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Incremental shadcn Test</h1>
        <p className="text-muted-foreground">
          Testing 4 shadcn components: Card, Button, Badge, Input, Label
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Form Components</CardTitle>
            <CardDescription>Testing Input and Label</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="text-input">Text Input</Label>
              <Input
                id="text-input"
                placeholder="Type something..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              You typed: {text || 'nothing'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interactive Components</CardTitle>
            <CardDescription>Testing Button and Badge interaction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={() => setCount(count + 1)}>
                Increment
              </Button>
              <Button variant="outline" onClick={() => setCount(0)}>
                Reset
              </Button>
            </div>
            <div className="flex gap-2">
              <Badge>Count: {count}</Badge>
              <Badge variant={count > 5 ? "destructive" : "default"}>
                {count > 5 ? "High" : "Low"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Combined Test</CardTitle>
          <CardDescription>All components working together</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="combined-input">Enter a number</Label>
              <Input
                id="combined-input"
                type="number"
                placeholder="Enter count"
                value={text}
                onChange={(e) => {
                  const val = e.target.value
                  setText(val)
                  const num = parseInt(val) || 0
                  if (num >= 0) setCount(num)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setCount(count + 10)}>
                Add 10
              </Button>
              <Badge variant="outline">Current: {count}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
