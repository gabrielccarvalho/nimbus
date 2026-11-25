import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getChannelSettings } from "@/features/accounts/queries"
import { accountRepository } from "@/features/accounts/repository"
import { account, user } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

const viewer: { user: { id: string }; workspace: { id: string } } = {
  user: { id: "" },
  workspace: { id: "" },
}

vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/features/accounts/session", () => ({
  requireViewer: async () => viewer,
}))

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("getChannelSettings", () => {
  it("names the account row Better Auth unlinks, not the provider's user id", async () => {
    const userId = crypto.randomUUID()
    const created = { id: userId, name: "A", email: `${userId}@example.com` }
    await env.db.insert(user).values(created)
    const workspace = await accountRepository(env.db).createPersonalWorkspace(
      created
    )
    viewer.user.id = userId
    viewer.workspace.id = workspace.id
    await env.db.insert(account).values({
      id: "twitch-row",
      accountId: "twitch-user-42",
      providerId: "twitch",
      userId,
    })

    const channels = await getChannelSettings()

    expect(channels.find((c) => c.id === "twitch")?.accountId).toBe(
      "twitch-row"
    )
  })
})
