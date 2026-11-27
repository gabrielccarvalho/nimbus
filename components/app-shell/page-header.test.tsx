import { render, screen, within } from "@testing-library/react"
import type { Route } from "next"
import { describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import {
  PageHeader,
  PageHeaderActions,
  PageHeaderBack,
  PageHeaderContext,
  PageHeaderDivider,
  PageHeaderHeading,
  PageHeaderState,
  PageHeaderTabs,
  PageHeaderTitle,
  PageHeaderTitleLine,
} from "./page-header"

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/p1/clips",
}))

function renderHeader() {
  return render(
    <TooltipProvider>
      <PageHeader className="custom">
        <PageHeaderBack href="/" label="Back to projects" />
        <PageHeaderHeading>
          <PageHeaderContext>Upload · 12:41</PageHeaderContext>
          <PageHeaderTitleLine>
            <PageHeaderTitle>Ranked</PageHeaderTitle>
            <PageHeaderState>
              <span role="status">Saved</span>
            </PageHeaderState>
          </PageHeaderTitleLine>
        </PageHeaderHeading>
        <PageHeaderTabs
          aria-label="Project sections"
          tabs={[
            { href: "/projects/p1" as Route, label: "Overview", exact: true },
            { href: "/projects/p1/transcript" as Route, label: "Transcript" },
            { href: "/projects/p1/clips" as Route, label: "Clips", count: 9 },
          ]}
        />
        <PageHeaderDivider />
        <PageHeaderActions>
          <button type="button">Render 8 approved</button>
        </PageHeaderActions>
      </PageHeader>
    </TooltipProvider>
  )
}

describe("PageHeader", () => {
  it("puts the title in the h1 with its context and state", () => {
    renderHeader()
    const header = screen.getByRole("banner")
    expect(header).toHaveAttribute("data-slot", "page-header")
    expect(header).toHaveClass("custom")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Ranked"
    )
    expect(screen.getByText("Upload · 12:41")).toHaveAttribute(
      "data-slot",
      "page-header-context"
    )
    expect(screen.getByRole("status")).toHaveTextContent("Saved")
  })

  it("links back to the parent", () => {
    renderHeader()
    expect(
      screen.getByRole("link", { name: "Back to projects" })
    ).toHaveAttribute("href", "/")
  })

  it("marks the current section and shows counts", () => {
    renderHeader()
    const nav = screen.getByRole("navigation", { name: "Project sections" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Transcript",
      "Clips9",
    ])
    expect(links[2]).toHaveAttribute("aria-current", "page")
    expect(links[0]).not.toHaveAttribute("aria-current")
    expect(links[1]).not.toHaveAttribute("aria-current")
  })

  it("keeps the order: back, heading, tabs, divider, actions", () => {
    renderHeader()
    const slots = Array.from(screen.getByRole("banner").children).map((child) =>
      child.getAttribute("data-slot")
    )
    expect(slots).toEqual([
      "page-header-back",
      "page-header-heading",
      "page-header-tabs",
      "page-header-divider",
      "page-header-actions",
    ])
  })
})
