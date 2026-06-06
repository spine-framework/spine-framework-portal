/**
 * @module PortalSidebar
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Sidebar for Customer Portal with ticket/content navigation.
 */

import * as React from "react"
import { PlusIcon, Ticket, BookOpen, GraduationCap, MessageSquare, HelpCircle, Settings, Layout } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@core/components/ui/sidebar"
import { Button } from "@core/components/ui/button"

const navItems = [
  {
    title: "Tickets",
    url: "/portal/tickets",
    icon: Ticket,
  },
  {
    title: "Knowledge Base",
    url: "/portal/kb",
    icon: BookOpen,
  },
  {
    title: "Courses",
    url: "/portal/courses",
    icon: GraduationCap,
  },
  {
    title: "Community",
    url: "/portal/community",
    icon: MessageSquare,
  },
]

const supportItems = [
  {
    title: "Help Center",
    url: "/portal/help",
    icon: HelpCircle,
  },
  {
    title: "Settings",
    url: "/portal/settings",
    icon: Settings,
  },
]

export function PortalSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        {/* Brand Header */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/portal">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-sm font-bold">P</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Portal</span>
                  <span className="text-xs text-muted-foreground">Support</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Quick Create Button */}
        <SidebarGroup className="py-2">
          <Button className="w-full" size="sm">
            <PlusIcon className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground">
          Customer Portal
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
