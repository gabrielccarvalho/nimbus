import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ChannelRow } from "@/features/accounts/queries"

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
  accountId: "g-1",
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
})
