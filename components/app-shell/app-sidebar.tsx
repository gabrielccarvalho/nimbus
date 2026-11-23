"use client"

import {
  FilmSlateIcon,
  FolderSimpleIcon,
  GearSixIcon,
  VideoCameraIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"

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
} from "@/components/ui/sidebar"

type RecentProject = { id: string; name: string }

export function AppSidebar({ recent }: { recent: RecentProject[] }) {
  const pathname = usePathname()
  const isProjects = pathname === "/" || pathname.startsWith("/projects")

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" />}
              tooltip="Nimbus"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <FilmSlateIcon weight="bold" aria-hidden />
              </span>
              <span className="font-heading text-xl font-extrabold">
                Nimbus
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/" />}
                  isActive={isProjects}
                  tooltip="Projects"
                >
                  <FolderSimpleIcon aria-hidden />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/settings" />}
                  isActive={pathname.startsWith("/settings")}
                  tooltip="Settings"
                >
                  <GearSixIcon aria-hidden />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {recent.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent projects</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recent.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      render={<Link href={`/projects/${project.id}`} />}
                      isActive={pathname.startsWith(`/projects/${project.id}`)}
                    >
                      <VideoCameraIcon aria-hidden />
                      <span className="truncate">{project.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  )
}
