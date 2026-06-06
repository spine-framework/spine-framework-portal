# Spine Framework Customer Portal

A self-service portal for customers to access tickets, knowledge base, courses, and community built on the Spine Framework.

## Overview

Customer Portal provides a comprehensive self-service experience for your customers:

- **Tickets** - Submit and track support requests
- **Knowledge Base** - Browse articles and documentation
- **Courses** - Access learning content and lessons
- **Community** - Join discussions and connect with other users
- **Marketplace** - Discover apps and integrations

## Installation

### Prerequisites

- Spine Framework installed
- Node.js 18+ 
- PostgreSQL database
- Supabase project (for database and auth)

### Setup

1. **Install the package**:
   ```bash
   npm install spine-framework-portal
   ```

2. **Configure the database**:
   See [docs/configuration.md](custom/apps/customer-portal/docs/configuration.md) for complete database setup instructions.

3. **Install the app**:
   ```bash
   npx spine install-app customer-portal
   ```

## Configuration

### Database Setup

Customer Portal requires specific database tables and configurations:

```sql
-- Insert Customer Portal app
INSERT INTO public.apps (
  slug, name, description, route_prefix, renderer, 
  required_roles, nav_items, is_active, is_public, auth_required
) VALUES (
  'customer-portal', 'Customer Portal', 
  'Self-service portal for customers to access tickets, knowledge base, courses, and community',
  '/portal', 'custom', '["member"]', 
  -- nav_items JSON from manifest.json
  true, true, true
);

-- Install for your account
INSERT INTO public.app_installations (account_id, app_slug, is_enabled)
VALUES ('your-account-id', 'customer-portal', true);
```

### Route Configuration

By default, Customer Portal serves from `/portal`. To serve from root:

```sql
UPDATE public.apps SET route_prefix = '/' WHERE slug = 'customer-portal';
```

See [docs/configuration.md](custom/apps/customer-portal/docs/configuration.md) for detailed configuration options.

## Features

### Tickets
- Submit new support requests
- Track ticket status and progress
- View ticket history and communications
- AI-powered triage and routing

### Knowledge Base
- Browse articles and documentation
- Search functionality with AI-powered results
- Category and tag organization
- Article ratings and feedback

### Courses
- Access structured learning content
- Track progress and completion
- Interactive lessons and quizzes
- Certificates and achievements

### Community
- Join discussion forums
- Ask questions and share experiences
- Connect with other users
- Community moderation

### Marketplace
- Discover apps and integrations
- Browse plugins and extensions
- Installation and configuration guides
- User reviews and ratings

## Development

### Project Structure

```
custom/apps/customer-portal/
├── index.tsx              # Main app component
├── manifest.json          # App configuration
├── components/            # Reusable components
│   ├── PortalHeader.tsx   # Navigation header
│   └── PortalFooter.tsx   # Footer component
├── pages/                 # Page components
│   ├── HomePage.tsx       # Dashboard/landing page
│   ├── TicketsPage.tsx    # Ticket management
│   ├── KnowledgePage.tsx  # Knowledge base
│   ├── CoursesPage.tsx    # Course listing
│   ├── CommunityPage.tsx  # Community forums
│   └── MarketplacePage.tsx # App marketplace
├── hooks/                # Custom React hooks
│   ├── useTickets.ts     # Ticket management
│   ├── useKBArticles.ts  # Knowledge base
│   ├── useCourses.ts     # Course data
│   └── useCommunity.ts   # Community features
├── config/               # Configuration files
├── seed/                 # Seed data
├── functions/            # Serverless functions
├── migrations/           # Database migrations
└── docs/                 # Documentation
```

### Prefix-Aware Routing

Customer Portal uses prefix-aware routing that automatically adapts to the configured `route_prefix`:

```typescript
// Automatically works for both /portal and / serving
const base = app.route_prefix === '/' ? '' : (app.route_prefix || '')
const NavLink to={`${base}${path}`}
```

### Customization

1. **Branding**: Update `PortalHeader.tsx` and `PortalFooter.tsx`
2. **Features**: Modify `manifest.json` routes and nav_items
3. **Workflows**: Add custom functions in `functions/`
4. **Data**: Extend with custom migrations in `migrations/`

## Deployment

### Subdirectory Deployment (Default)

- Access: `https://yourdomain.com/portal`
- Safe for multi-app deployments
- Default configuration

### Root Deployment

- Access: `https://yourdomain.com/`
- Set `route_prefix: "/"` in database
- For dedicated customer portal deployments

## Authentication & Authorization

Customer Portal requires users to have the `member` role:

```sql
-- Create member role
INSERT INTO public.roles (slug, name, description) 
VALUES ('member', 'Member', 'Can access customer portal features');

-- Assign to users
INSERT INTO public.people (account_id, user_id, role_id)
VALUES ('account-id', 'user-id', (SELECT id FROM roles WHERE slug = 'member'));
```

### Authentication Flow

1. **Public Access**: Landing page visible without login
2. **Authentication Required**: Users must sign in to access features
3. **Role-Based Access**: Only users with `member` role can use the portal

## Required Dependencies

Customer Portal requires these Spine Framework types:

- `support_ticket` - For ticket management
- `kb_article` - For knowledge base articles
- `course_lesson` - For course content
- `community_post` - For community discussions

Ensure these types exist in your `types` table or install appropriate seed data.

## API Integration

Customer Portal integrates with Spine Framework APIs:

- `/api/apps?action=list` - App discovery
- `/.netlify/functions/admin-data` - Data management
- `/.netlify/functions/custom_support-triage` - AI triage
- `/.netlify/functions/ai-agents` - AI features
- Custom functions in `functions/` directory

## Feature Configuration

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

## Support

- **Documentation**: [docs/configuration.md](custom/apps/customer-portal/docs/configuration.md)
- **Issues**: Report via your Spine Framework support channel
- **Community**: Join the Spine Framework community

## License

This package is licensed under the [Spine Framework Internal Use License](LICENSE.md).

- ✅ Free for internal business use
- ❌ Commercial redistribution requires separate license
- 📞 Contact: spine-framework.com for commercial licensing

## Version History

See [manifest.json](custom/apps/customer-portal/manifest.json) for version information and changelog.
