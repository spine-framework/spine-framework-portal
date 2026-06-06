/**
 * @module src/pages/admin/MinimalShadcnTestPage
 * @audience installer
 * @layer frontend-page
 * @stability testing
 *
 * Minimal test page with basic shadcn components to isolate import issues.
 */

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'

export function MinimalShadcnTestPage() {
  const [count, setCount] = useState(0)

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Minimal shadcn Test</h1>
        <p className="text-muted-foreground">
          Testing basic shadcn components: Card, Button, Badge
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Button Test</CardTitle>
            <CardDescription>Testing shadcn Button component</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={() => setCount(count + 1)}>
                Count: {count}
              </Button>
              <Button variant="outline" onClick={() => setCount(0)}>
                Reset
              </Button>
              <Button variant="secondary">
                Secondary
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badge Test</CardTitle>
            <CardDescription>Testing shadcn Badge component</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
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
          <CardTitle>Card Test</CardTitle>
          <CardDescription>Testing shadcn Card layout</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This is a test of the basic shadcn components working together.
            If you can see this page and interact with the buttons and badges,
            the basic shadcn setup is working correctly.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
