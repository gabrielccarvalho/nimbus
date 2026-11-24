import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { projectSignal } from "@/components/projects/status-badge"
import { TooltipProvider } from "@/components/ui/tooltip"

import { AppSidebar } from "./app-sidebar"
import { buildCrumbs } from "./breadcrumbs"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1/clips",
  useRouter: () => ({ push }),
}))

describe("buildCrumbs", () => {
  it("skips project tabs but keeps clips", () => {
    const labels = { p1: "Ranked", c1: "Big jump" }
    expect(buildCrumbs("/projects/p1/clips", labels)).toEqual([
      { href: "/", label: "Projects" },
      { href: "/projects/p1", label: "Ranked" },
    ])
    expect(buildCrumbs("/projects/p1/clips/c1", labels).at(-1)).toEqual({
      href: "/projects/p1/clips/c1",
      label: "Big jump",
    })
  })

  it("roots settings at Settings", () => {
    expect(buildCrumbs("/settings/channels", {})).toEqual([
      { href: "/settings", label: "Settings" },
      { href: "/settings/channels", label: "Channels" },
    ])
    expect(buildCrumbs("/channels", {})).toEqual([
      { href: "/channels", label: "Channels" },
    ])
  })
})

describe("projectSignal", () => {
  it("marks what needs you in amber", () => {
    expect(projectSignal({ status: "awaiting_layout" })).toMatchObject({
      tone: "amber",
      label: "Needs you",
      needsYou: true,
    })
    expect(
      projectSignal({ status: "selecting", awaitingManualSelection: true })
    ).toMatchObject({ tone: "amber", detail: "Paste highlights" })
  })

  it("counts clips to review and names the failed step", () => {
    expect(
      projectSignal({ status: "ready_for_review", reviewCount: 9 })
    ).toMatchObject({ tone: "mint", label: "9 to review" })
    expect(
      projectSignal({ status: "failed", failedStep: "downloading" })
    ).toMatchObject({ tone: "pink", label: "Downloading failed" })
    expect(projectSignal({ status: "transcribing" }).tone).toBe("lav")
    expect(projectSignal({ status: "done" }).tone).toBe("sky")
  })
})

describe("AppSidebar", () => {
  const recent = [
    { id: "p1", name: "Ranked", status: "awaiting_layout" as const },
  ]
  const shell = {
    recent,
    projectCount: 4,
    account: {
      name: "Gabe",
      email: "g@example.com",
      initials: "G",
      image: null,
    },
    workspace: {
      name: "Gabe's studio",
      initials: "GS",
      image: null,
      planName: "Free",
    },
    usage: {
      renderMinutes: 12,
      renderMinutesLimit: 60,
      resetsAt: "2026-12-01T00:00:00.000Z",
    },
  }

  it("lists recent projects with their status and marks the current one", () => {
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    const link = screen.getByRole("link", { name: /Ranked/ })
    expect(link).toHaveAttribute("aria-current", "page")
    expect(link).toHaveTextContent("Needs you · confirm layout")
    expect(screen.getByRole("link", { name: /Projects/ })).toHaveTextContent(
      "4"
    )
  })

  it("collapses to a rail and remembers it in a cookie", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" })
    )
    expect(
      screen.getByRole("complementary", { name: "Main navigation" })
    ).toHaveAttribute("data-state", "collapsed")
    expect(document.cookie).toContain("sidebar_state=false")
  })

  it("shows the workspace, render minutes and the account", () => {
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    expect(
      screen.getByRole("button", { name: /Gabe's studio/ })
    ).toHaveTextContent("Personal · Free plan")
    expect(screen.getByText("12 / 60")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /g@example.com/ })).toBeVisible()
  })

  it("shows unlimited render minutes without a meter", () => {
    render(
      <TooltipProvider>
        <AppSidebar
          {...shell}
          workspace={{ ...shell.workspace, planName: "Admin" }}
          usage={{ ...shell.usage, renderMinutesLimit: null }}
        />
      </TooltipProvider>
    )
    expect(
      screen.getByRole("button", { name: /Gabe's studio/ })
    ).toHaveTextContent("Personal · Admin plan")
    expect(screen.getByText("12 · Unlimited")).toBeInTheDocument()
    expect(
      screen.queryByLabelText("Render minutes used this month")
    ).not.toBeInTheDocument()
  })

  it("opens a new project with N", async () => {
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    await userEvent.keyboard("n")
    expect(push).toHaveBeenCalledWith("/#import")
  })
})
