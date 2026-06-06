# Spine v2 → shadcn/ui Migration Plan

**Scope:** Complete migration of all v2-core and v2-custom UI components to shadcn/ui
**Approach:** Full replacement (no hybrid)
**Timeline:** 4-6 weeks
**Design System:** [Custom Preset](https://ui.shadcn.com/create?preset=b1a0RuXXE&item=preview)

---

## Design System Specification

**Preset URL:** https://ui.shadcn.com/create?preset=b1a0RuXXE&item=preview

| Attribute | Value |
|-----------|-------|
| **Style** | Mira |
| **Base Color** | Zinc |
| **Theme** | Blue |
| **Chart Color** | Blue |
| **Heading Font** | Inter |
| **Body Font** | Inter |

### Visual Characteristics
- Clean, modern aesthetic with subtle borders
- Zinc grayscale foundation (neutral grays)
- Blue primary accent (#2563eb style blue)
- Card-based layouts with soft shadows
- Rounded corners (modern radius)
- Lucide icons throughout

### UI Patterns from Preset

**Layout:**
- Bento-box grid layouts (sidebar + main content cards)
- Left sidebar with dark background (zinc-900) for navigation
- Main content area with white/light cards on subtle background
- Card-based information architecture

**Components:**
- **Buttons**: Blue primary (`bg-blue-600`), secondary/outline variants
- **Cards**: White background, subtle shadow (`shadow-sm`), rounded-xl
- **Inputs**: Clean borders, focus ring in blue
- **Badges**: Rounded-full pills with status colors
- **Progress**: Blue fill on neutral track
- **Navigation**: Sidebar with icon + text items

**Data Display:**
- Stat cards with large numbers and context labels
- Bar charts with blue color scheme
- Tables with subtle row separators
- Form sections with clear hierarchy

**Typography:**
- Inter font family throughout
- Semibold headings (600 weight)
- Medium weight for labels and buttons (500)
- Clear hierarchy: 24px+ for stats, 16px for body, 14px for captions

---

## Phase 0: Pre-Migration Inventory

### Current Component Count
| Directory | Files | Components to Migrate |
|-----------|-------|---------------------|
| `v2-core/src/components/ui/` | 10 | 10 |
| `v2-core/src/components/admin/` | 3 | 3 |
| `v2-core/src/components/app-shell/` | 3 | 3 |
| `v2-core/src/components/auth/` | 1 | 1 |
| `v2-core/src/components/layout/` | 3 | 3 |
| `v2-core/src/components/runtime/` | 9 | 9 |
| `v2-core/src/components/shared/` | 3 | 3 |
| `v2-custom/src/apps/*/components/` | ~15 | ~15 |
| **Total** | **~47** | **~47** |

### Component Mapping: Current → shadcn

| Current Component | shadcn Replacement | Notes |
|------------------|-------------------|-------|
| `ui/Button.tsx` | `button` | Map custom variants (primary/navy) to shadcn |
| `ui/Badge.tsx` | `badge` | Custom color variants |
| `ui/Modal.tsx` + `ModalFooter` | `dialog` | Combine into single Dialog pattern |
| `ui/Popover.tsx` | `popover` | Drop custom implementation |
| `ui/Table.tsx` | `table` | Replace custom with shadcn table primitives |
| `ui/DataTable.tsx` | `table` + `@tanstack/react-table` | Keep Tanstack logic, use shadcn table UI |
| `ui/Form.tsx` + `FormField` + `FormSection` + `FormRow` + `FormColumn` | `form` + `input` + `label` + `textarea` | Refactor to shadcn form patterns |
| `ui/ItemCard.tsx` | Custom card | Build on `card` primitive |
| `ui/ItemListView.tsx` | Custom list | Build on shadcn primitives |
| `ui/LoadingSpinner.tsx` | `skeleton` | Replace with shadcn Skeleton |
| `ui/DataTable.tsx` | `table` | Migrate styling |
| `admin/AdminListPage.tsx` | Custom page shell | Refactor to use shadcn Card, Button |
| `admin/AdminStatsCard.tsx` | `card` + custom | Rebuild on Card primitive |
| `admin/SortableTableHeader.tsx` | `table` | Migrate to shadcn Table |
| `app-shell/GenericAppShell.tsx` | Custom layout | Refactor with shadcn Sidebar, Nav |
| `app-shell/GenericListPage.tsx` | Custom page | Refactor with shadcn components |
| `app-shell/GenericDetailPage.tsx` | Custom page | Refactor with shadcn components |
| `auth/ProtectedRoute.tsx` | No change | Logic-only component |
| `layout/Header.tsx` | Custom header | Refactor with shadcn components |
| `layout/Layout.tsx` | Custom layout | Refactor with shadcn Sidebar |
| `layout/Sidebar.tsx` | `sidebar` | Replace with shadcn Sidebar |
| `runtime/DataHeader.tsx` | Custom header | Refactor with shadcn Button, Card |
| `runtime/DataStats.tsx` | `card` | Rebuild on Card |
| `runtime/DataTable.tsx` | `table` | Migrate to shadcn Table |
| `shared/AgentView.tsx` | Custom component | Refactor styling |
| `shared/FieldRenderer.tsx` | Custom form fields | Build on shadcn Form, Input, Select, etc. |
| `shared/SchemaFields.tsx` | Custom fields | Build on shadcn Form primitives |

### shadcn Components to Install

```bash
# Core UI primitives
npx shadcn add button badge card dialog popover tooltip separator avatar
npx shadcn add input textarea label select checkbox radio-group switch
npx shadcn add table dropdown-menu navigation-menu menubar
npx shadcn add sheet drawer sidebar scroll-area
npx shadcn add form skeleton alert alert-dialog
npx shadcn add tabs accordion collapsible toggle toggle-group
npx shadcn add breadcrumb pagination calendar date-picker
npx shadcn add command combobox hover-card
npx shadcn add resizable aspect-ratio scroll-area
npx shadcn add sonner toast
```

---

## Phase 1: Foundation Setup (Week 1)

### 1.1 Initialize shadcn

```bash
# From project root
cd v2-core
# Initialize with user's preset: Mira style + Zinc base + Blue theme
npx shadcn@latest init --yes --style mira --base-color zinc
```

**Preset Configuration:**
- Style: `mira` (modern, clean aesthetic)
- Base Color: `zinc` (neutral grayscale)
- CSS Variables: Enabled (for theming)

### 1.2 Update components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "mira",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 1.3 Theme Configuration

Update `v2-core/src/index.css` with the **Blue Theme** from the preset:

```css
@layer base {
  :root {
    /* User Preset: Zinc base + Blue theme */
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    
    /* Blue Theme → Primary (from preset b1a0RuXXE) */
    --primary: 217 91% 60%;        /* #2563eb - Bright Blue */
    --primary-foreground: 0 0% 100%;
    
    --secondary: 240 4.8% 95.9%;   /* Zinc-100 */
    --secondary-foreground: 240 5.9% 10%;
    
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    
    /* Blue accent to match theme */
    --accent: 217 91% 60%;         /* Same as primary for consistency */
    --accent-foreground: 0 0% 100%;
    
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 217 91% 60%;           /* Blue ring for focus states */
    
    --radius: 0.625rem;
    
    /* Chart colors for data visualization */
    --chart-1: 217 91% 60%;        /* Blue */
    --chart-2: 221 83% 53%;        /* Darker blue */
    --chart-3: 213 94% 68%;        /* Lighter blue */
    --chart-4: 226 71% 40%;        /* Navy blue */
    --chart-5: 212 100% 87%;       /* Pale blue */
  }
  
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 217 91% 60%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 217 91% 60%;
  }
}
```

### 1.4 Install Core shadcn Components

```bash
cd v2-core
npx shadcn add button badge card dialog popover tooltip separator avatar
npx shadcn add input textarea label select checkbox switch table
npx shadcn add form skeleton dropdown-menu sheet sidebar scroll-area
```

### 1.5 Font Configuration

Add Inter font to `v2-core/src/index.css`:

```css
/* Inter font for both heading and body (per preset) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground font-sans;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-weight: 600;
  }
}
```

Update `tailwind.config.ts`:

```typescript
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  heading: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
}
```

### 1.6 Update Assembly Scripts

Modify `scripts/assemble-v2-frontend.sh` to copy shadcn components:

```bash
# After copying v2-core/src, ensure shadcn components are available
# shadcn installs to src/components/ui/ which will be auto-copied
```

---

## Phase 2: Core UI Components Migration (Week 1-2)

### 2.1 Button Migration

**Current:** `v2-core/src/components/ui/Button.tsx`
**Replacement:** shadcn `button` with preset theme variants

```typescript
// v2-core/src/components/ui/button-spine.tsx
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors",
  {
    variants: {
      variant: {
        // Use CSS variables for theme consistency
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Preset-specific: Blue accent variant
        blue: "bg-blue-600 text-white hover:bg-blue-700",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 py-2 text-sm",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

// Extend shadcn Button with loading prop
export interface SpineButtonProps extends ButtonProps {
  loading?: boolean
  icon?: React.ReactNode
}
```

**Visual Changes:**
| Old (Spine Navy) | New (Blue Preset) |
|-----------------|-------------------|
| `bg-[#0D1B3E]` | `bg-primary` (#2563eb) |
| Dark navy primary | Bright blue primary |
| Rounded-[5px] | Rounded-md |
| Custom color values | CSS variable-based |

**Migration Steps:**
1. Delete old `Button.tsx`
2. Create `button-spine.tsx` extending shadcn
3. Update all imports from `'../ui/Button'` to `'../ui/button'`

### 2.2 Badge Migration

**Current:** `v2-core/src/components/ui/Badge.tsx`
**Replacement:** shadcn `badge` with Spine colors

```typescript
// Map Spine status colors to shadcn variants
const statusVariantMap = {
  active: "default",      // primary color
  inactive: "secondary",
  pending: "warning",     // extend shadcn
  error: "destructive",
  success: "success",     // extend shadcn
}
```

### 2.3 Modal → Dialog Migration

**Current:** `Modal.tsx` + `ModalFooter`
**Replacement:** shadcn `dialog`

**Breaking Changes:**
- `isOpen` → `open`
- `onClose` → `onOpenChange`
- `ModalFooter` → inline footer in DialogContent

**Migration Pattern:**
```typescript
// Before:
<Modal isOpen={show} onClose={() => setShow(false)} title="Create Item">
  <form>...</form>
  <ModalFooter>
    <Button onClick={onCancel}>Cancel</Button>
    <Button onClick={onSubmit}>Save</Button>
  </ModalFooter>
</Modal>

// After:
<Dialog open={show} onOpenChange={setShow}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Item</DialogTitle>
    </DialogHeader>
    <form>...</form>
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button onClick={onSubmit}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2.4 Popover Migration

**Current:** Custom `Popover.tsx`
**Replacement:** shadcn `popover`

Drop-in replacement - APIs are similar.

### 2.5 Table Migration

**Current:** `Table.tsx`, `DataTable.tsx`
**Replacement:** shadcn `table` primitives

```typescript
// DataTable becomes:
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Keep Tanstack React Table for logic
// Replace rendering with shadcn Table components
```

### 2.6 Form Migration (Complex)

**Current:** `Form.tsx`, `FormField`, `FormSection`, `FormRow`, `FormColumn`
**Replacement:** shadcn `form` + `input` + `label` + `textarea` + `select`

**Major Refactor:**
- Adopt React Hook Form (shadcn pattern)
- Replace custom FormField with shadcn FormField/FormItem/FormLabel/FormControl
- Drop FormSection/FormRow/FormColumn in favor of CSS Grid

```typescript
// Before:
<Form fields={fields} data={data} onSubmit={onSubmit} />

// After:
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map(field => (
        <FormField
          control={form.control}
          name={field.name}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{field.label}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
    <Button type="submit">Submit</Button>
  </form>
</Form>
```

### 2.7 LoadingSpinner → Skeleton

**Current:** `LoadingSpinner.tsx`
**Replacement:** shadcn `skeleton`

Drop-in replacement at component usage sites.

---

## Phase 3: Layout & Navigation Migration (Week 2-3)

### 3.1 Sidebar Migration

**Current:** `layout/Sidebar.tsx`
**Replacement:** shadcn `sidebar`

**Major structural change** - shadcn Sidebar has different API:
- `SidebarProvider` context
- `Sidebar` / `SidebarHeader` / `SidebarContent` / `SidebarFooter`
- `SidebarMenu` / `SidebarMenuItem` / `SidebarMenuButton`

### 3.2 Header Migration

**Current:** `layout/Header.tsx`
**Replacement:** Custom component using shadcn primitives

```typescript
// Use shadcn:
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
```

### 3.3 Layout Migration

**Current:** `layout/Layout.tsx`
**Replacement:** Combine shadcn Sidebar + custom layout

---

## Phase 4: Admin & Runtime Components (Week 3-4)

### 4.1 AdminListPage Refactor

Replace custom cards/buttons with shadcn:
- Stats cards → `Card` component
- New button → `Button` with icon
- Filter inputs → `Input` + `Select`

### 4.2 AdminStatsCard Refactor

Rebuild on `Card`:
```typescript
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">{title}</CardTitle>
    <Icon className={cn("h-4 w-4", iconColor)} />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{value}</div>
  </CardContent>
</Card>
```

### 4.3 DataTable Refactor

Migrate to shadcn Table primitives while keeping Tanstack logic.

### 4.4 FieldRenderer Refactor

Major refactor - replace all field type renderers with shadcn components:
- `text` → `Input`
- `textarea` → `Textarea`
- `select` → `Select` (shadcn)
- `multiselect` → `MultiSelect` (custom on shadcn)
- `radio` → `RadioGroup`
- `checkbox` → `Checkbox`
- `date` → shadcn `Calendar` + `Popover`
- `number` → `Input type="number"`
- `email` → `Input type="email"`
- `url` → `Input type="url"`
- `uuid` → `Input` with validation

---

## Phase 5: Custom Apps Migration (Week 4-5)

### 5.1 Customer Portal

| Component | shadcn Replacement |
|-----------|-------------------|
| `SearchFilterBar` | `Input` + `Button` |
| `StatusBadge` | `Badge` |
| `ParticipationIndicator` | Custom on `Badge` |
| `PortalHeader` | Custom with `NavigationMenu` |
| `TicketsPage` | Refactor with shadcn `Card`, `Table`, `Dialog` |
| `CommunityPage` | Refactor with shadcn `Card`, `Dialog` |
| `CoursesPage` | Refactor with shadcn `Card`, `Progress`, `Accordion` |
| `KnowledgePage` | Refactor with shadcn `Card`, `Input`, `Badge` |
| `MarketplacePage` | Refactor with shadcn `Card`, `Badge` |

### 5.2 Other Custom Apps

Apply same pattern - audit each component, replace with shadcn primitives.

---

## Phase 6: Testing & Validation (Week 5-6)

### 6.1 Visual Regression Testing

```bash
# Install Playwright if not present
npm install -D @playwright/test

# Create visual regression tests for key pages
npx playwright test visual-regression/
```

### 6.2 Component API Testing

Ensure all shadcn components render correctly:
```typescript
// Button.test.tsx
import { render, screen } from '@testing-library/react'
import { Button } from '@/components/ui/button'

test('Button renders with Spine variants', () => {
  render(<Button variant="navy">Test</Button>)
  expect(screen.getByText('Test')).toBeInTheDocument()
})
```

### 6.3 Integration Testing

Test critical user flows:
1. Create ticket flow
2. Community post + reply
3. Admin data management
4. Course completion

### 6.4 Accessibility Audit

```bash
# Install axe-core
npm install -D @axe-core/react

# Run accessibility tests
npm run test:a11y
```

---

## Migration Commands Quick Reference

```bash
# Phase 1: Setup
cd v2-core && npx shadcn@latest init --yes --defaults --base-color slate

# Phase 2: Core components
npx shadcn add button badge card dialog popover tooltip separator avatar
npx shadcn add input textarea label select checkbox radio-group switch
npx shadcn add table dropdown-menu navigation-menu
npx shadcn add form skeleton sheet sidebar scroll-area

# Phase 3: Advanced components
npx shadcn add tabs accordion collapsible toggle toggle-group
npx shadcn add breadcrumb pagination command combobox
npx shadcn add alert alert-dialog sonner toast
npx shadcn add calendar date-picker hover-card drawer
npx shadcn add resizable aspect-ratio

# Verify assembly
npm run assemble:v2
npm run build
```

---

## Breaking Changes Summary

| Change | Impact | Mitigation |
|--------|--------|------------|
| Button API | All Button usages | Update variant prop values |
| Modal → Dialog | All modal usages | Refactor to Dialog pattern |
| Form system | All forms | Major refactor to RHF + shadcn Form |
| Table styling | All tables | Update className references |
| Sidebar API | Layout components | Refactor to shadcn Sidebar |
| CSS variables | Global styling | Update index.css with Spine colors |

---

## Rollback Plan

1. Keep git branch `pre-shadcn-migration` as backup
2. Migrate one phase at a time with PRs
3. Feature flag critical components if needed
4. Monitor error tracking for UI regressions

---

## Success Criteria

- [ ] All 47+ components migrated to shadcn
- [ ] Zero console errors/warnings
- [ ] Visual parity with pre-migration (or improved)
- [ ] All tests passing
- [ ] Accessibility audit score ≥ 95
- [ ] Bundle size documented (before/after)
