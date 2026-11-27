import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  AppHeader,
  AppHeaderActions,
  AppHeaderBack,
  AppHeaderContext,
  AppHeaderHeading,
  AppHeaderState,
  AppHeaderTab,
  AppHeaderTabs,
  AppHeaderTitle,
  AppHeaderTitleRow,
} from "./app-header"
import { AppHeaderSlot, HEADER_STATE_SLOT_ID, HeaderSlot } from "./header-slot"

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <AppHeader>
      <AppHeaderBack href="/" label="Back to projects" />
      <AppHeaderHeading>
        <AppHeaderContext>YouTube · 1:42:07</AppHeaderContext>
        <AppHeaderTitleRow>
          <AppHeaderTitle>Friday stream</AppHeaderTitle>
          <span id={HEADER_STATE_SLOT_ID} />
        </AppHeaderTitleRow>
      </AppHeaderHeading>
      <AppHeaderTabs aria-label="Project sections">
        <AppHeaderTab href="/analytics">Overview</AppHeaderTab>
        <AppHeaderTab href="/analytics/shorts" active count={12}>
          Clips
        </AppHeaderTab>
      </AppHeaderTabs>
      <AppHeaderActions>
        <AppHeaderSlot />
      </AppHeaderActions>
      {children}
    </AppHeader>
  )
}

describe("AppHeader", () => {
  it("is a banner with the page title as its only h1", () => {
    render(<Header />)
    const header = screen.getByRole("banner")
    expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Friday stream"
    )
    expect(
      within(header).getByRole("link", { name: "Back to projects" })
    ).toHaveAttribute("href", "/")
  })

  it("marks the current tab and shows its count", () => {
    render(<Header />)
    const tabs = screen.getByRole("navigation", { name: "Project sections" })
    expect(within(tabs).getByRole("link", { name: /Clips/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(within(tabs).getByRole("link", { name: /Clips/ })).toHaveTextContent(
      "12"
    )
    expect(
      within(tabs).getByRole("link", { name: "Overview" })
    ).not.toHaveAttribute("aria-current")
  })
})

describe("HeaderSlot", () => {
  it("moves a page's actions and state into the header", () => {
    render(
      <>
        <Header />
        <main>
          <HeaderSlot>
            <button type="button">Render approved clips</button>
          </HeaderSlot>
          <HeaderSlot target={HEADER_STATE_SLOT_ID}>
            <AppHeaderState role="status">Saved</AppHeaderState>
          </HeaderSlot>
        </main>
      </>
    )
    const header = screen.getByRole("banner")
    expect(
      within(header).getByRole("button", { name: "Render approved clips" })
    ).toBeInTheDocument()
    expect(within(header).getByRole("status")).toHaveTextContent("Saved")
    expect(
      within(screen.getByRole("main")).queryByRole("button")
    ).not.toBeInTheDocument()
  })

  it("renders in place when the page has no header", () => {
    render(
      <main>
        <HeaderSlot>
          <button type="button">Make a clip</button>
        </HeaderSlot>
      </main>
    )
    expect(
      within(screen.getByRole("main")).getByRole("button", {
        name: "Make a clip",
      })
    ).toBeInTheDocument()
  })
})
