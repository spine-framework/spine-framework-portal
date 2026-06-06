/**
 * @module src/pages/NotFoundPage
 * @audience installer
 * @layer frontend-page
 * @stability stable
 *
 * Generic 404 page rendered by the catch-all route. Displays a large
 * "404" heading and a "Go back home" link to `/dashboard`.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-9xl font-bold text-slate-900">404</h1>
          <h2 className="mt-4 text-3xl font-bold text-slate-900">Page not found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Sorry, we couldn't find the page you're looking for.
          </p>
          
          <div className="mt-6">
            <Link
              to="/dashboard"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Home className="w-4 h-4 mr-2" />
              Go back home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
