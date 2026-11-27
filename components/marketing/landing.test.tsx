import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PLANS } from "@/features/accounts/schema"

import { Landing } from "./landing"

describe("Landing", () => {
  it("has one h1 and the promise in the lede", () => {
    render(<Landing />)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Long streams in. Short clips out."
    )
    expect(
      screen.getAllByText("Nothing is published until you approve it.").length
    ).toBeGreaterThan(0)
  })

  it("sends people to sign up and sign in", () => {
    render(<Landing />)
    const starts = screen.getAllByRole("link", { name: "Get started" })
    expect(starts.length).toBeGreaterThan(1)
    for (const link of starts) expect(link).toHaveAttribute("href", "/signup")
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })
    ).toHaveAttribute("href", "/login")
  })

  it("describes the edit animation to people who can't see it", () => {
    render(<Landing />)
    expect(
      screen.getByRole("img", { name: /^A clip being edited/ })
    ).toBeInTheDocument()
  })

  it("takes the plan limits from the code and only opens Free", () => {
    render(<Landing />)
    const pricing = screen.getByRole("region", { name: /Start free/ })
    const plans = within(pricing).getAllByRole("listitem")
    expect(plans).toHaveLength(3)
    const [free, creator, studio] = plans
    expect(within(free!).getByText("$0")).toBeInTheDocument()
    expect(
      within(free!).getByText(String(PLANS.free.renderMinutes))
    ).toBeInTheDocument()
    expect(
      within(free!).getByRole("link", { name: "Get started" })
    ).toBeInTheDocument()
    for (const plan of [creator!, studio!]) {
      expect(within(plan).getByText("Soon")).toBeInTheDocument()
      expect(within(plan).queryByRole("link")).not.toBeInTheDocument()
    }
    expect(within(studio!).getByText("1,200")).toBeInTheDocument()
  })

  it("answers the questions in native disclosures", () => {
    render(<Landing />)
    const question = screen.getByText(
      "Does nimbus publish anything on its own?"
    )
    expect(question.closest("details")).not.toHaveAttribute("open")
    expect(screen.getByText(/Portuguese/)).toHaveTextContent(
      "English, Portuguese, Spanish"
    )
  })
})
