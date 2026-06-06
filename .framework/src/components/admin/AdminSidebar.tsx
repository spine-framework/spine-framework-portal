/**
 * @module src/components/admin/AdminSidebar
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Admin sidebar with proper sections, React Router navigation, and active link highlighting.
 */

import * as React from "react"
import { Link, useLocation } from "react-router-dom"
import { 
  PlusIcon, 
  Database, 
  Settings, 
  Type, 
  Users, 
  Layout, 
  FileText,
  BarChart3,
  AlertTriangle,
  Activity,
  FileSearch,
  FlaskConical,
  Brain,
  Cpu,
  Timer,
  Puzzle,
  Shield,
  MessageSquare,
  Key,
  TestTube
} from "lucide-react"
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
} from "../ui/sidebar"
import { Button } from "../ui/button"

// Navigation sections with correct admin URLs
const navigationSections = [
  {
    title: "Configs",
    items: [
      { title: "Types", url: "/spine-framework/admin/configs/types", icon: Type },
      { title: "Apps", url: "/spine-framework/admin/configs/apps", icon: Layout },
      { title: "Pipelines", url: "/spine-framework/admin/configs/pipelines", icon: Activity },
      { title: "Triggers", url: "/spine-framework/admin/configs/triggers", icon: AlertTriangle },
      { title: "AI Agents", url: "/spine-framework/admin/configs/ai-agents", icon: Brain },
      { title: "Embeddings", url: "/spine-framework/admin/configs/embeddings", icon: Cpu },
      { title: "Timers", url: "/spine-framework/admin/configs/timers", icon: Timer },
      { title: "Integrations", url: "/spine-framework/admin/configs/integrations", icon: Puzzle },
      { title: "Roles", url: "/spine-framework/admin/configs/roles", icon: Shield },
      { title: "Prompts", url: "/spine-framework/admin/configs/prompts", icon: MessageSquare },
      { title: "API Keys", url: "/spine-framework/admin/configs/api-keys", icon: Key },
    ]
  },
  {
    title: "Runtime",
    items: [
      { title: "Items", url: "/spine-framework/admin/runtime/items", icon: Database },
      { title: "Accounts", url: "/spine-framework/admin/runtime/accounts", icon: Users },
      { title: "People", url: "/spine-framework/admin/runtime/people", icon: Users },
      { title: "Threads", url: "/spine-framework/admin/runtime/threads", icon: MessageSquare },
      { title: "Messages", url: "/spine-framework/admin/runtime/messages", icon: FileText },
      { title: "Attachments", url: "/spine-framework/admin/runtime/attachments", icon: FileSearch },
      { title: "Watchers", url: "/spine-framework/admin/runtime/watchers", icon: Activity },
      { title: "Links", url: "/spine-framework/admin/runtime/links", icon: Puzzle },
      { title: "Progress", url: "/spine-framework/admin/runtime/item_progress", icon: BarChart3 },
    ]
  },
  {
    title: "Observability",
    items: [
      { title: "Dashboard", url: "/spine-framework/admin/observability", icon: BarChart3 },
      { title: "Alerts", url: "/spine-framework/admin/observability/alerts", icon: AlertTriangle },
      { title: "Executions", url: "/spine-framework/admin/observability/executions", icon: Activity },
      { title: "Logs", url: "/spine-framework/admin/observability/logs", icon: FileSearch },
    ]
  },
  {
    title: "Testing",
    items: [
      { title: "Test Runs", url: "/spine-framework/admin/testing", icon: TestTube },
    ]
  }
]

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()

  // Check if a URL is active (exact match or starts with path)
  const isActive = (url: string) => {
    return location.pathname === url || location.pathname.startsWith(url + '/')
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        {/* Brand Header */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/spine-framework/admin/configs/types">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <span className="text-sm font-bold">S</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Spine</span>
                  <span className="text-xs text-muted-foreground">Framework</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Quick Create Button */}
        <SidebarGroup className="py-2">
          <Button className="w-full" size="sm">
            <PlusIcon className="mr-2 h-4 w-4" />
            Quick Create
          </Button>
        </SidebarGroup>
      </SidebarHeader>

      <SidebarContent>
        {navigationSections.map((section) => (
          <SidebarGroup key={section.title}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground">
          Spine v2.0
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
