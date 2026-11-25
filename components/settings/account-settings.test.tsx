import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { ChannelRow } from "@/features/accounts/queries"

import { authClient } from "@/components/auth/auth-client"

import { ChannelList } from "./account-settings"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("@/components/auth/auth-client", () => ({
  authClient: { linkSocial: vi.fn(), unlinkAccount: vi.fn() },
}))

const youtube: ChannelRow = {
  id: "youtube",
  name: "YouTube",
  configured: true,
  connectedAt: new Date(),
  providerId: "google",
  accountId: "account-row-1",
  needsReconnect: false,
  channelTitle: "Mine",
  channelError: null,
}

describe("ChannelList", () => {
  it("offers Reconnect when YouTube needs reauthorization", () => {
    render(<ChannelList channels={[{ ...youtube, needsReconnect: true }]} />)
    expect(
      screen.getByRole("button", { name: "Reconnect YouTube" })
    ).toBeVisible()
  })

  it("offers Reconnect for a kept channel after Google was unlinked", () => {
    render(
      <ChannelList
        channels={[
          {
            ...youtube,
            connectedAt: null,
            accountId: null,
            needsReconnect: true,
          },
        ]}
      />
    )
    expect(screen.getByText("Mine")).toBeVisible()
    expect(screen.getByText("Needs reconnect")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Reconnect YouTube" })
    ).toBeVisible()
    expect(screen.queryByRole("button", { name: /^Connect/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull()
  })

  it("shows Disconnect when YouTube is healthy", () => {
    render(<ChannelList channels={[youtube]} />)
    expect(screen.queryByRole("button", { name: /Reconnect/ })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Disconnect YouTube" })
    ).toBeVisible()
  })

  it("shows why the YouTube channel could not be linked", () => {
    render(
      <ChannelList
        channels={[
          { ...youtube, channelTitle: null, channelError: "No channel found" },
        ]}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("No channel found")
  })

  it("unlinks the account row and refreshes", async () => {
    vi.mocked(authClient.unlinkAccount).mockResolvedValue({
      data: { status: true },
      error: null,
    } as never)
    render(<ChannelList channels={[youtube]} />)
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Disconnect YouTube" }))
    expect(authClient.unlinkAccount).toHaveBeenCalledWith({
      accountId: "account-row-1",
    })
    expect(screen.queryByText(/didn't work/)).toBeNull()
  })

  it("says why a disconnect failed", async () => {
    vi.mocked(authClient.unlinkAccount).mockResolvedValue({
      data: null,
      error: { code: "ACCOUNT_NOT_FOUND", message: "Account not found" },
    } as never)
    render(<ChannelList channels={[youtube]} />)
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Disconnect YouTube" }))
    expect(await screen.findByText("Account not found")).toBeVisible()
  })

  it("asks for a fresh sign-in when the session is too old to disconnect", async () => {
    vi.mocked(authClient.unlinkAccount).mockResolvedValue({
      data: null,
      error: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" },
    } as never)
    render(<ChannelList channels={[youtube]} />)
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Disconnect YouTube" }))
    expect(
      await screen.findByText(
        "Sign out and back in, then disconnect YouTube again."
      )
    ).toBeVisible()
  })
})
