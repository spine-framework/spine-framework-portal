# Guide 01: Create a Custom App

## What this guide covers

How to scaffold, configure, and run a new custom app on Spine.

---

## Step 1: Scaffold with the CLI

```bash
npm run spine-framework create-app my-app -- --name "My App" --role member
```

This creates:
```
custom/apps/my-app/
  manifest.json      ← app metadata, routes, nav, roles
  index.tsx          ← React entry point
  components/        ← your components go here
```

And inserts a row into the `apps` table in the database.

**Options:**
```bash
--name "My App"   # Display name (defaults to title-cased slug)
--role member     # Required role: member | support | system_admin (default: member)
--force           # Overwrite if directory already exists
```

---

## Step 2: Configure manifest.json

`custom/apps/my-app/manifest.json` controls everything about the app.

```json
{
  "name": "My App",
  "slug": "my-app",
  "description": "What this app does",
  "version": "1.0.0",
  "required_roles": ["member"],
  "routes": [
    "/my-app",
    "/my-app/dashboard",
    "/my-app/settings"
  ],
  "nav_items": [
    {
      "title": "Dashboard",
      "path": "/my-app/dashboard",
      "icon": "LayoutDashboard",
      "order": 1
    },
    {
      "title": "Settings",
      "path": "/my-app/settings",
      "icon": "Settings",
      "order": 2
    }
  ],
  "features": [],
  "entry_point": "./index.tsx"
}
```

**Key fields:**
- `required_roles` — array of roles that can access this app. Any match grants access.
- `routes` — informational; actual routing is handled by `index.tsx`
- `nav_items` — used by generic app shells; custom apps render their own sidebar

---

## Step 3: Build index.tsx

`index.tsx` is the React entry point. Core mounts it at `/{slug}/*`.

```tsx
import * as React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@core/components/layout/AppShell'
import { useAuth } from '@core/contexts/AuthContext'
import MyAppSidebar from './components/MyAppSidebar'

function Dashboard() {
  const { user } = useAuth()
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-slate-500">Welcome, {user?.full_name}</p>
    </div>
  )
}

export default function MyApp() {
  return (
    <AppShell sidebar={<MyAppSidebar />}>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
      </Routes>
    </AppShell>
  )
}
```

**Rules for index.tsx:**
- Always `export default` the root component
- Use `@core/...` imports for anything from core — never relative paths to `.framework/`
- Routes are relative — `/my-app/dashboard` is just `path="dashboard"` here

---

## Step 4: Assemble and run

```bash
npm run assemble
netlify dev
```

Navigate to `http://localhost:8888/my-app`.

---

## Step 5: Verify

```bash
# App files exist
ls custom/apps/my-app/

# App is in the database
# Check: GET /api/apps?action=list should include your slug
```

---

## File structure reference

```
custom/apps/my-app/
  manifest.json              ← required
  index.tsx                  ← required: default export = root component
  components/
    MyAppSidebar.tsx         ← optional: custom sidebar
    MyFeatureCard.tsx        ← optional: any component
  pages/
    DashboardPage.tsx        ← optional: split pages out for readability
```

---

## Core imports available in custom apps

```tsx
// Auth
import { useAuth } from '@core/contexts/AuthContext'

// Layout
import { AppShell } from '@core/components/layout/AppShell'

// UI primitives
import { Button } from '@core/components/ui/button'
import { LoadingSpinner } from '@core/components/ui/LoadingSpinner'
import { Sidebar, SidebarMenu, SidebarMenuItem } from '@core/components/ui/sidebar'

// Data fetching
import { apiFetch } from '@core/lib/api'

// Router (re-exported from react-router-dom)
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
```

> **Rule:** Always use `@core/...` for core imports. Never use relative paths like `../../../../.framework/src/...`.
> `@core` resolves to `.assembled/src` in both dev and build.

---

## Next steps

- [02-create-a-function.md](./02-create-a-function.md) — Add a backend API to your app
- [03-create-a-component.md](./03-create-a-component.md) — Build reusable components
