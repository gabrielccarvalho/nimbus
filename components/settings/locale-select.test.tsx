import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { LocaleProvider } from "@/lib/i18n/client"

import { LocaleSelect } from "./locale-select"

const refresh = vi.fn()
const setLocaleAction = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("@/features/accounts/actions", () => ({
  setLocaleAction: (locale: unknown) => setLocaleAction(locale),
}))

describe("LocaleSelect", () => {
  beforeEach(() => {
    refresh.mockClear()
    setLocaleAction.mockReset().mockResolvedValue({ ok: true, value: null })
  })

  it("shows the active language", () => {
    render(
      <LocaleProvider locale="pt-BR">
        <LocaleSelect />
      </LocaleProvider>
    )
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveTextContent(
      "Português"
    )
  })

  it("saves the choice and refreshes the page", async () => {
    const user = userEvent.setup()
    render(<LocaleSelect />)
    await user.click(screen.getByRole("combobox", { name: "Language" }))
    await user.click(await screen.findByRole("option", { name: "Português" }))
    await waitFor(() => expect(setLocaleAction).toHaveBeenCalledWith("pt-BR"))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("does nothing when the active language is picked again", async () => {
    const user = userEvent.setup()
    render(<LocaleSelect />)
    await user.click(screen.getByRole("combobox", { name: "Language" }))
    await user.click(await screen.findByRole("option", { name: "English" }))
    expect(setLocaleAction).not.toHaveBeenCalled()
  })
})
