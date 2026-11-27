import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PLANS } from "@/features/accounts/schema"
import { LocaleProvider } from "@/lib/i18n/client"
import type { Locale } from "@/lib/i18n/config"

import { Landing } from "./landing"

const active = vi.hoisted(() => ({ locale: "en-US" as Locale }))

vi.mock("@/lib/i18n/server", () => ({
  getLocale: async () => active.locale,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock("@/features/accounts/actions", () => ({
  setLocaleAction: vi.fn(),
}))

describe("Landing", () => {
  beforeEach(() => {
    active.locale = "en-US"
  })

  it("has one h1 and the promise in the lede", async () => {
    render(await Landing())
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Long streams in. Short clips out."
    )
    expect(
      screen.getAllByText("Nothing is published until you approve it.").length
    ).toBeGreaterThan(0)
  })

  it("sends people to sign up and sign in", async () => {
    render(await Landing())
    const starts = screen.getAllByRole("link", { name: "Get started" })
    expect(starts.length).toBeGreaterThan(1)
    for (const link of starts) expect(link).toHaveAttribute("href", "/signup")
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })
    ).toHaveAttribute("href", "/login")
  })

  it("describes the edit animation to people who can't see it", async () => {
    render(await Landing())
    expect(
      screen.getByRole("img", { name: /^A clip being edited/ })
    ).toBeInTheDocument()
  })

  it("describes the stream becoming clips, with the four steps", async () => {
    render(await Landing())
    expect(
      screen.getByRole("img", { name: /^A three hour stream on a timeline/ })
    ).toBeInTheDocument()
    const how = screen.getByRole("region", { name: /Three hours in/ })
    expect(within(how).getAllByRole("listitem")).toHaveLength(4)
    expect(
      within(how).getByRole("heading", { name: "You decide" })
    ).toBeInTheDocument()
  })

  it("prices the plans and takes Free and Creator limits from the code", async () => {
    render(await Landing())
    const pricing = screen.getByRole("region", { name: /Start free/ })
    const plans = within(pricing).getAllByRole("listitem")
    expect(plans).toHaveLength(3)
    const [free, creator, studio] = plans
    expect(within(free!).getAllByText("Free")).toHaveLength(2)
    expect(free).not.toHaveTextContent("R$")
    expect(
      within(free!).getByText(String(PLANS.free.renderMinutes))
    ).toBeInTheDocument()
    expect(
      within(free!).getByRole("link", { name: "Get started" })
    ).toHaveAttribute("href", "/signup")

    expect(creator).toHaveTextContent("R$67.69a month")
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

  it("answers the questions in native disclosures", async () => {
    render(await Landing())
    const question = screen.getByText(
      "Does nimbus publish anything on its own?"
    )
    expect(question.closest("details")).not.toHaveAttribute("open")
    expect(screen.getByText(/Portuguese/)).toHaveTextContent(
      "English, Portuguese, Spanish"
    )
  })

  it("reads in Brazilian Portuguese, with the price still in reais", async () => {
    active.locale = "pt-BR"
    render(<LocaleProvider locale="pt-BR">{await Landing()}</LocaleProvider>)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Entra a live inteira. Saem os cortes."
    )
    const banner = within(screen.getByRole("banner"))
    expect(banner.getByRole("combobox", { name: "Idioma" })).toHaveTextContent(
      "Português"
    )
    expect(banner.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login"
    )
    const [free, creator] = within(
      screen.getByRole("region", { name: /Comece de graça/ })
    ).getAllByRole("listitem")
    expect(within(free!).getAllByText("Grátis")).toHaveLength(2)
    expect(creator).toHaveTextContent("R$67,69por mês")
    expect(screen.getByText(/português/)).toHaveTextContent(
      "inglês, português, espanhol"
    )
  })
})
