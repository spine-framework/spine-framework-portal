# Customer Portal App Configuration

This guide explains how to configure and deploy the Customer Portal app for self-service customer access.

## Database Configuration

### 1. Apps Table Entry

Insert the Customer Portal app into the `public.apps` table:

```sql
INSERT INTO public.apps (
  id,
  slug, 
  name,
  description,
  version,
  app_type,
  source,
  owner_account_id,
  is_active,
  is_system,
  min_role,
  config,
  nav_items,
  route_prefix,
  renderer,
  created_at
) VALUES (
  gen_random_uuid(),
  'customer-portal',
  'Customer Portal',
  'Self-service portal for customers to access tickets, knowledge base, courses, and community',
  '1.0.0',
  'custom',
  'spine-framework',
  'd3ab4cf8-33de-4ca5-97a2-dbc288c94338', -- spine-system account
  true,
  false,
  'member',
  '{}',
  '[
    {
      "title": "Home",
      "path": "/",
      "icon": "Home",
      "order": 1
    },
    {
      "title": "Tickets",
      "path": "/tickets",
      "icon": "Ticket",
      "order": 2
    },
    {
      "title": "Knowledge Base",
      "path": "/kb",
      "icon": "BookOpen",
      "order": 3
    },
    {
      "title": "Courses",
      "path": "/courses",
      "icon": "GraduationCap",
      "order": 4
    },
    {
      "title": "Community",
      "path": "/community",
      "icon": "Users",
      "order": 5
    },
    {
      "title": "Marketplace",
      "path": "/marketplace",
      "icon": "Store",
      "order": 6
    }
  ]',
  '/portal', -- Change to '/' for root serving
  'custom',
  now()
);
```

### 2. App Installation

Install Customer Portal for your account:

```sql
INSERT INTO public.app_installations (
  account_id,
  app_slug,
  is_enabled
) VALUES (
  'your-account-id', -- Replace with your account ID
  'customer-portal', 
  true
);
```

### 3. Required Roles

Customer Portal requires users to have the `member` role. Create this role if it doesn't exist:

```sql
INSERT INTO public.roles (
  slug,
  name,
  description,
  is_system,
  is_active
) VALUES (
  'member',
  'Member',
  'Can access customer portal features',
  false,
  true
) ON CONFLICT (slug) DO NOTHING;
```

Assign the member role to users who need portal access:

```sql
INSERT INTO public.people (
  account_id,
  user_id,
  role_id,
  is_active
) VALUES (
  'your-account-id',
  'user-id',
  (SELECT id FROM public.roles WHERE slug = 'member'),
  true
);
```

## Manifest Configuration

The `manifest.json` file controls app behavior and routing:

### Key Settings

- **`required_roles`**: `["member"]` - Users must have member role
- **`routes`**: Define all available routes in the app
- **`nav_items`**: Navigation structure and icons
- **`route_prefix`**: Where the app is served from
- **`is_public`**: `true` - App allows public access with auth
- **`auth_required`**: `true` - Authentication required

### Route Prefix Configuration

#### Subdirectory Serving (Default)
```json
{
  "route_prefix": "/portal"
}
```
- App accessible at: `http://domain.com/portal`
- Safe for multi-app deployments
- Default configuration

#### Root Serving
```json
{
  "route_prefix": "/"
}
```
- App accessible at: `http://domain.com/`
- Use for dedicated customer portal deployments
- Requires updating database `route_prefix` field

### Prefix-Aware Routing

Customer Portal uses prefix-aware routing that automatically adapts to the `route_prefix`:

- Navigation links automatically include the base path
- Route definitions work regardless of serving location
- All internal redirects are prefix-aware

No code changes needed when switching between subdirectory and root serving.

## Required Dependencies

The Customer Portal requires these Spine framework types to be available:

- **`support_ticket`** - For ticket management
- **`kb_article`** - For knowledge base articles
- **`course_lesson`** - For course content
- **`community_post`** - For community discussions

Ensure these types exist in your `types` table or install the appropriate seed data.

## Deployment Options

### Option 1: Subdirectory Deployment (Recommended)

1. Set `route_prefix: "/portal"` in database
2. App available at `/portal/*` URLs
3. Multiple apps can coexist safely
4. Customers access via `yourdomain.com/portal`

### Option 2: Root Deployment

1. Set `route_prefix: "/"` in database  
2. App available at root URLs (`/`, `/tickets`, etc.)
3. Use for dedicated customer portal sites
4. Customers access directly via `yourdomain.com`

## Authentication Flow

Customer Portal supports both authenticated and public access patterns:

1. **Public Access**: Landing page visible without login
2. **Authentication Required**: Users must sign in to access features
3. **Role-Based Access**: Only users with `member` role can use the portal

## Verification

Test the configuration:

1. Check `/api/apps?action=list` returns customer-portal
2. Navigate to the configured route prefix
3. Verify authentication flow works
4. Confirm all navigation links work
5. Test all major features (tickets, KB, courses, community)

## Troubleshooting

- **404 errors**: Check `route_prefix` matches database entry
- **Access denied**: Verify user has `member` role
- **Navigation broken**: Ensure prefix-aware routing is enabled
- **Missing features**: Check required types exist in database
- **Module errors**: Verify all hooks and components are assembled correctly

## Customization

### Adding New Features

1. Update `manifest.json` routes and nav_items
2. Create new page components in `pages/` directory
3. Add corresponding hooks in `hooks/` directory
4. Update database types if needed

### Branding

Update the following files for custom branding:
- `components/PortalHeader.tsx` - Header and navigation
- `components/PortalFooter.tsx` - Footer content
- `pages/HomePage.tsx` - Welcome messaging and layout

### Feature Flags

Control feature availability via the `config` field in the apps table:
```json
{
  "features": {
    "tickets": true,
    "kb": true, 
    "courses": true,
    "community": true,
    "marketplace": false
  }
}
```
