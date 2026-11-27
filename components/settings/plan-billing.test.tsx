import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/lib/i18n/client"

import { PlanBilling } from "./plan-billing"

const checkout = vi.fn()
const portal = vi.fn()
const assign = vi.fn()

vi.mock("@/features/billing/actions", () => ({
  startCreatorCheckoutAction: () => checkout(),
  billingPortalAction: () => portal(),
}))

const paidUntil = new Date("2026-12-20T10:00:00Z")

describe("PlanBilling", () => {
  beforeEach(() => {
    checkout.mockReset()
    portal.mockReset()
    assign.mockReset()
    vi.stubGlobal("location", { ...window.location, assign })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("offers Creator at its price and goes to the payment page", async () => {
    checkout.mockResolvedValue({ ok: true, value: "https://pay.example.com/1" })
    render(
      <PlanBilling
        billing={{ status: "can_upgrade", paidUntil: null }}
        pending={false}
      />
    )
    expect(screen.getByText("Creator · R$67.69 a month")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade to Creator" })
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://pay.example.com/1")
    )
  })

  it("shows why the checkout couldn't open", async () => {
    checkout.mockResolvedValue({
      ok: false,
      error: { code: "EXTERNAL", message: "AbacatePay didn't answer" },
    })
    render(
      <PlanBilling
        billing={{ status: "can_upgrade", paidUntil: null }}
        pending={false}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: "Upgrade to Creator" })
    )
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AbacatePay didn't answer"
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it("lets a subscriber manage billing, and says when a cancelled plan ends", async () => {
    portal.mockResolvedValue({ ok: true, value: "https://portal.example.com" })
    const { rerender } = render(
      <PlanBilling billing={{ status: "active", paidUntil }} pending={false} />
    )
    expect(screen.getByText(/Renews on December 20\./)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Manage billing" })
    )
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://portal.example.com")
    )

    rerender(
      <PlanBilling billing={{ status: "ending", paidUntil }} pending={false} />
    )
    expect(
      screen.getByText(/You keep Creator until December 20/)
    ).toBeInTheDocument()
  })

  it("speaks Portuguese and stays out of the way when there's nothing to buy", () => {
    const { container } = render(
      <PlanBilling billing={{ status: "none", paidUntil: null }} pending />
    )
    expect(container).toBeEmptyDOMElement()

    render(
      <LocaleProvider locale="pt-BR">
        <PlanBilling
          billing={{ status: "can_upgrade", paidUntil: null }}
          pending
        />
      </LocaleProvider>
    )
    expect(screen.getByText("Creator · R$ 67,69 por mês")).toBeInTheDocument()
    expect(screen.getByText(/Pagamento recebido/)).toBeInTheDocument()
  })
})
