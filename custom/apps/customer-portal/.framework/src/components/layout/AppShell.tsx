/**
 * @module src/components/layout/AppShell
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Application shell with Sidebar-05 layout for professional SaaS look.
 * Wraps page content with collapsible sidebar navigation.
 */

import * as React from "react"
import { Link } from 'react-router-dom'
import { SidebarProvider, SidebarInset, SidebarTrigger } from "../ui/sidebar"
import { Separator } from "../ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb"

interface AppShellProps {
  sidebar: React.ReactNode
  children: React.ReactNode
  breadcrumbs?: { title: string; url?: string }[]
  headerActions?: React.ReactNode
}

export function AppShell({
  sidebar,
  children,
  breadcrumbs,
  headerActions,
}: AppShellProps) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            {breadcrumbs && (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.title}>
                      <BreadcrumbItem
                        className={
                          index === breadcrumbs.length - 1
                            ? "hidden md:block"
                            : ""
                        }
                      >
                        {index === breadcrumbs.length - 1 ? (
                          <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.url || "#"}>
                              {crumb.title}
                            </Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {index < breadcrumbs.length - 1 && (
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                    </React.Fragment>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
          {headerActions && (
            <div className="ml-auto flex items-center gap-2 px-4">
              {headerActions}
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
