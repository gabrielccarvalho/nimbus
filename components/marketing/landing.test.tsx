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

  it("describes the stream becoming clips, with the four steps", () => {
    render(<Landing />)
    expect(
      screen.getByRole("img", { name: /^A three hour stream on a timeline/ })
    ).toBeInTheDocument()
    const how = screen.getByRole("region", { name: /Three hours in/ })
    expect(within(how).getAllByRole("listitem")).toHaveLength(4)
    expect(
      within(how).getByRole("heading", { name: "You decide" })
    ).toBeInTheDocument()
  })

  it("prices the plans and takes Free and Creator limits from the code", () => {
    render(<Landing />)
    const pricing = screen.getByRole("region", { name: /Start free/ })
    const plans = within(pricing).getAllByRole("listitem")
    expect(plans).toHaveLength(3)
    const [free, creator, studio] = plans
    expect(free).toHaveTextContent("R$0")
    expect(
      within(free!).getByText(String(PLANS.free.renderMinutes))
    ).toBeInTheDocument()
    expect(
      within(free!).getByRole("link", { name: "Get started" })
    ).toHaveAttribute("href", "/signup")

    expect(creator).toHaveTextContent("R$67,69a month")
    expect(within(creator!).getByText("Recommended")).toBeInTheDocument()
    expect(
      within(creator!).getByText(String(PLANS.creator.renderMinutes))
    ).toBeInTheDocument()
    expect(
      within(creator!).getByRole("link", { name: "Choose Creator" })
    ).toHaveAttribute("href", "/signup")

    expect(within(studio!).getAllByText("Custom")).toHaveLength(5)
    expect(within(studio!).queryByText("1,200")).not.toBeInTheDocument()
    expect(
      within(studio!).getByRole("link", { name: "Get in contact" })
    ).toHaveAttribute("href", expect.stringMatching(/^mailto:/))
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
