/**
 * @module src/components/cortex/CortexSidebar
 * @audience installer
 * @layer frontend-component
 * @stability stable
 *
 * Sidebar for the Cortex internal operations application.
 */

import * as React from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "@core/contexts/AuthContext"
import {
  LayoutDashboard,
  Building2,
  Headphones,
  Users,
  BookOpen,
  GraduationCap,
  Handshake,
  Activity,
  Heart,
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
} from "@core/components/ui/sidebar"

const crmItems = [
  { title: "Dashboard", url: "/cortex/dashboard", icon: LayoutDashboard },
  { title: "Accounts", url: "/cortex/crm/accounts", icon: Building2 },
  { title: "Contacts", url: "/cortex/crm/contacts", icon: Users },
  { title: "Deals", url: "/cortex/crm/deals", icon: Handshake },
  { title: "Health", url: "/cortex/crm/health", icon: Heart },
  { title: "Activity", url: "/cortex/crm/activity", icon: Activity },
]

const opsItems = [
  { title: "Support", url: "/cortex/support", icon: Headphones },
  { title: "Community", url: "/cortex/community", icon: Users },
  { title: "Knowledge Base", url: "/cortex/kb", icon: BookOpen },
  { title: "Courses", url: "/cortex/courses", icon: GraduationCap },
]

export function CortexSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const isActive = (url: string) => location.pathname.startsWith(url)

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => navigate("/cortex/dashboard")}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-sm font-bold">Cx</span>
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">Cortex</span>
                <span className="text-xs text-muted-foreground">Operations</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>CRM</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {crmItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                  >
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
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {opsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                  >
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
        <div className="text-xs text-muted-foreground truncate">{user?.email || ''}</div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
