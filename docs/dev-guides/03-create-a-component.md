# Guide 03: Create a Custom Component

## What this guide covers

How to build React components inside a custom app, using core hooks, UI primitives, and layout components.

---

## Where components live

```
custom/apps/my-app/
  components/
    MyAppSidebar.tsx     ← navigation sidebar
    MyFeatureCard.tsx    ← any reusable UI piece
    MyDataTable.tsx      ← data display
```

Components are local to your app. They are never imported by core.

---

## Import rules

```tsx
// ✅ Correct — use @core alias for anything from core
import { useAuth } from '@core/contexts/AuthContext'
import { Button } from '@core/components/ui/button'
import { AppShell } from '@core/components/layout/AppShell'

// ✅ Correct — relative imports within your own app
import MyFeatureCard from './MyFeatureCard'
import MyFeatureCard from '../components/MyFeatureCard'

// ❌ Wrong — never use relative paths to .framework
import { useAuth } from '../../../../.framework/src/contexts/AuthContext'
```

---

## Building a sidebar

Sidebars use the core `Sidebar` primitives from shadcn/ui.

```tsx
// custom/apps/my-app/components/MyAppSidebar.tsx
import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@core/contexts/AuthContext'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@core/components/ui/sidebar'
import { LayoutDashboard, Settings } from 'lucide-react'

const navItems = [
  { title: 'Dashboard', url: '/my-app/dashboard', icon: LayoutDashboard },
  { title: 'Settings', url: '/my-app/settings', icon: Settings },
]

export function MyAppSidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="font-semibold px-2">My App</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    isActive={location.pathname.startsWith(item.url)}
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
```

---

## Fetching data in a component

```tsx
import * as React from 'react'
import { apiFetch } from '@core/lib/api'
import { LoadingSpinner } from '@core/components/ui/LoadingSpinner'

interface Item {
  id: string
  title: string
}

export function ItemList() {
  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    apiFetch('/api/custom_my-feature?action=list')
      .then(r => r.json())
      .then(({ data }) => setItems(data || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingSpinner />

  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item.id} className="p-3 border rounded">
          {item.title}
        </li>
      ))}
    </ul>
  )
}
```

---

## Available core UI components

All from `@core/components/ui/...` (shadcn/ui):

| Import | Component |
|--------|-----------|
| `@core/components/ui/button` | `Button` |
| `@core/components/ui/badge` | `Badge` |
| `@core/components/ui/card` | `Card`, `CardHeader`, `CardContent` |
| `@core/components/ui/dialog` | `Dialog`, `DialogContent`, `DialogHeader` |
| `@core/components/ui/input` | `Input` |
| `@core/components/ui/label` | `Label` |
| `@core/components/ui/select` | `Select`, `SelectContent`, `SelectItem` |
| `@core/components/ui/sidebar` | `Sidebar`, `SidebarMenu`, `SidebarMenuItem`, etc. |
| `@core/components/ui/tabs` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `@core/components/ui/tooltip` | `Tooltip`, `TooltipProvider` |
| `@core/components/ui/LoadingSpinner` | `LoadingSpinner` |

---

## Available core hooks

| Import | Hook | Purpose |
|--------|------|---------|
| `@core/contexts/AuthContext` | `useAuth()` | Current user, login/logout |
| `@core/contexts/AppContext` | `useCurrentApp()` | Current app record |
| `@core/lib/api` | `apiFetch()` | Auth-aware fetch wrapper |

---

## Next steps

- [04-webhook-handlers.md](./04-webhook-handlers.md) — React to system events
- [05-testing.md](./05-testing.md) — Test your components and functions
