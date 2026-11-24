import { eq } from "drizzle-orm"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { googleAccessToken } from "@/features/publishing/google-token"
import {
  publishingRepository,
  type YouTubeChannel,
} from "@/features/publishing/repository"
import { resetEnvCache } from "@/lib/env"
import { account, user, workspaces } from "@/lib/db/schema"

import { server } from "../utils/msw"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const TOKEN_URL = "https://oauth2.googleapis.com/token"

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv({
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
  })
})
afterEach(() => env.cleanup())

async function seed(expiresInMs: number) {
  const userId = crypto.randomUUID()
  const accountId = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id: userId, name: "A", email: `${userId}@example.com` })
  await env.db.insert(account).values({
    id: accountId,
    accountId: "g-1",
    providerId: "google",
    userId,
    accessToken: "stored-token",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: new Date(Date.now() + expiresInMs),
  })
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId,
    accountId,
    channelId: "UC1",
    title: "Channel",
  })
  return { accountId, channel }
}

function tokenEndpoint(response: () => Response) {
  const bodies: URLSearchParams[] = []
  server.use(
    http.post(TOKEN_URL, async ({ request }) => {
      bodies.push(new URLSearchParams(await request.text()))
      return response()
    })
  )
  return bodies
}

const savedAccount = async (id: string) =>
  (await env.db.select().from(account).where(eq(account.id, id)))[0]!

const savedChannel = async (channel: YouTubeChannel) =>
  (await publishingRepository(env.db).getChannel(channel.workspaceId))!

describe("googleAccessToken", () => {
  it("returns the stored token without a network call while it is valid", async () => {
    const { channel } = await seed(10 * 60_000)
    const bodies = tokenEndpoint(() => HttpResponse.json({}))
    expect(await googleAccessToken(env.db, channel)).toBe("stored-token")
    expect(bodies).toHaveLength(0)
  })

  it("refreshes an expiring token and saves it", async () => {
    const { accountId, channel } = await seed(30_000)
    const bodies = tokenEndpoint(() =>
      HttpResponse.json({ access_token: "fresh", expires_in: 3600 })
    )
    expect(await googleAccessToken(env.db, channel)).toBe("fresh")
    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.get("grant_type")).toBe("refresh_token")
    expect(bodies[0]!.get("refresh_token")).toBe("refresh-1")
    expect(bodies[0]!.get("client_id")).toBe("client-id")
    const row = await savedAccount(accountId)
    expect(row.accessToken).toBe("fresh")
    expect(row.refreshToken).toBe("refresh-1")
    expect(row.accessTokenExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 3_000_000
    )
  })

  it("saves a rotated refresh token", async () => {
    const { accountId, channel } = await seed(0)
    tokenEndpoint(() =>
      HttpResponse.json({
        access_token: "fresh",
        expires_in: 3600,
        refresh_token: "refresh-2",
      })
    )
    await googleAccessToken(env.db, channel)
    expect((await savedAccount(accountId)).refreshToken).toBe("refresh-2")
  })

  it("refreshes a valid token when forced", async () => {
    const { channel } = await seed(10 * 60_000)
    const bodies = tokenEndpoint(() =>
      HttpResponse.json({ access_token: "forced", expires_in: 3600 })
    )
    expect(await googleAccessToken(env.db, channel, { force: true })).toBe(
      "forced"
    )
    expect(bodies).toHaveLength(1)
  })

  it("marks the channel for reconnect on invalid_grant", async () => {
    const { channel } = await seed(0)
    tokenEndpoint(() =>
      HttpResponse.json({ error: "invalid_grant" }, { status: 400 })
    )
    await expect(googleAccessToken(env.db, channel)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Reconnect YouTube in Settings › Connected channels",
    })
    expect((await savedChannel(channel)).status).toBe("needs_reconnect")
  })

  it("throws a retryable EXTERNAL error on a server failure", async () => {
    const { channel } = await seed(0)
    tokenEndpoint(() => new HttpResponse(null, { status: 500 }))
    await expect(googleAccessToken(env.db, channel)).rejects.toMatchObject({
      code: "EXTERNAL",
    })
    expect((await savedChannel(channel)).status).toBe("ok")
  })

  it("requires Google credentials", async () => {
    env.cleanup()
    env = await createTestEnv()
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    resetEnvCache()
    const { channel } = await seed(0)
    await expect(googleAccessToken(env.db, channel)).rejects.toMatchObject({
      code: "DEPENDENCY_MISSING",
    })
  })
})
