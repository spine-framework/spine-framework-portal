# Spine v2 Frontend

This is the frontend shell for Spine v2, built with React, TypeScript, and Tailwind CSS.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase project

### Installation

1. Copy the environment file:
```bash
cp .env.example .env.local
```

2. Configure your Supabase credentials in `.env.local`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Install dependencies:
```bash
npm install
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:3001`.

### Build

Build for production:
```bash
npm run build
```

### Functions

Start the Netlify functions server:
```bash
npm run functions:dev
```

## Project Structure

```
src/
├── components/
│   ├── layout/          # Layout components (Header, Sidebar, etc.)
│   └── ui/              # Reusable UI components
├── contexts/            # React contexts (Auth, etc.)
├── lib/                 # Utility functions and configurations
├── pages/               # Page components
│   ├── auth/           # Authentication pages
│   └── admin/          # Admin pages
├── types/               # TypeScript type definitions
├── App.tsx             # Main app component
├── main.tsx            # App entry point
└── index.css           # Global styles
```

## Features

- **Authentication**: Secure login/logout with Supabase
- **Layout**: Responsive sidebar navigation and header
- **Admin Interface**: Full admin pages for managing accounts, people, types, and apps
- **Item Management**: Generic item viewing and management
- **Dashboard**: Overview with statistics and recent activity
- **Type Safety**: Full TypeScript support throughout

## Key Components

### Authentication
- Uses Supabase Auth for secure authentication
- JWT token management with automatic refresh
- Role-based access control

### Layout System
- Responsive sidebar navigation
- Mobile-friendly with collapsible menu
- User profile and logout functionality

### Admin Pages
- **Accounts**: Multi-tenant account management
- **People**: User management across accounts
- **Types**: Item type schema management
- **Apps**: Application configuration and management

### Styling
- Tailwind CSS for utility-first styling
- Custom CSS variables for theming
- Component-based styling approach

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `VITE_NETLIFY_FUNCTIONS_URL` | Netlify functions URL | No |

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run functions:dev` - Start functions server

## Contributing

1. Follow the existing code style
2. Use TypeScript for all new code
3. Add proper error handling
4. Include loading states where appropriate
5. Test responsive design

## License

This project is part of the Spine v2 framework.
