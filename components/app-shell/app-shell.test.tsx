import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { projectSignal } from "@/components/projects/status-badge"
import { TooltipProvider } from "@/components/ui/tooltip"

import { AppSidebar } from "./app-sidebar"

const push = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1/clips",
  useRouter: () => ({ push }),
}))

describe("projectSignal", () => {
  it("marks what needs you in amber", () => {
    expect(
      projectSignal({ status: "selecting", awaitingManualSelection: true })
    ).toMatchObject({
      tone: "amber",
      label: "Needs you",
      detail: "Paste highlights",
      needsYou: true,
    })
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
    {
      id: "p1",
      name: "Ranked",
      status: "selecting" as const,
      awaitingManualSelection: true,
    },
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
  }

  it("lists recent projects with their status and marks the current one", () => {
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    const link = screen.getByRole("link", { name: /Ranked/ })
    expect(link).toHaveAttribute("aria-current", "page")
    expect(link).toHaveTextContent("Needs you · paste highlights")
    expect(screen.getByRole("link", { name: /Projects/ })).toHaveTextContent(
      "4"
    )
  })

  it("lists Projects, Analytics and Channels in that order", () => {
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    const nav = screen.getByRole("navigation", { name: "Sections" })
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Projects4", "Analytics", "Channels"])
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
    expect(screen.queryByText("Render minutes")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /g@example.com/ })).toBeVisible()
  })

  it("lists a page's own shortcuts before the app's", async () => {
    render(
      <TooltipProvider>
        <AppSidebar
          {...shell}
          shortcuts={[{ keys: ["S"], label: "Split at the playhead" }]}
        />
      </TooltipProvider>
    )
    await userEvent.keyboard("?")
    const dialog = await screen.findByRole("dialog", {
      name: "Keyboard shortcuts",
    })
    expect(
      within(dialog)
        .getAllByRole("term")
        .map((term) => term.textContent)
        .slice(0, 2)
    ).toEqual(["Split at the playhead", "Search recordings and clips"])
  })

  it("has the search button, icon-only when collapsed", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    render(
      <TooltipProvider>
        <AppSidebar {...shell} />
      </TooltipProvider>
    )
    const search = screen.getByRole("button", { name: "Search" })
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K")
    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" })
    )
    expect(
      within(screen.getByRole("button", { name: "Search" })).getByText("Search")
    ).toHaveClass("md:sr-only")
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
