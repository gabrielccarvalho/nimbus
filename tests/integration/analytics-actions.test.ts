import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { importShortsAction } from "@/features/analytics/actions"
import { RECONNECT_MESSAGE } from "@/features/publishing/google-token"
import { publishingRepository } from "@/features/publishing/repository"
import { account, jobs, user } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

const signedIn: { user: { id: string; name: string } | null } = { user: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/features/accounts/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        signedIn.user && { user: signedIn.user, session: {} },
    },
  }),
}))

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed({ channel = true } = {}) {
  const id = crypto.randomUUID()
  const owner = { id, name: "Owner", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  signedIn.user = owner
  if (!channel) return { workspace, channel: undefined }
  const accountRow = crypto.randomUUID()
  await env.db.insert(account).values({
    id: accountRow,
    accountId: "g1",
    providerId: "google",
    userId: owner.id,
  })
  return {
    workspace,
    channel: await publishingRepository(env.db).upsertChannel({
      workspaceId: workspace.id,
      accountId: accountRow,
      channelId: "UC1",
      title: "My Channel",
    }),
  }
}

const uploadJobs = () =>
  env.db.select().from(jobs).where(eq(jobs.type, "sync_uploads"))

describe("importShortsAction", () => {
  it("enqueues one uploads sync for the workspace's channel", async () => {
    const { channel } = await seed()

    expect(await importShortsAction()).toMatchObject({ ok: true })

    const rows = await uploadJobs()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      payload: { channelId: channel!.id },
      projectId: null,
      maxAttempts: 3,
      status: "queued",
    })
  })

  it("asks to connect YouTube when the workspace has no channel", async () => {
    await seed({ channel: false })

    expect(await importShortsAction()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Connect YouTube first" },
    })
    expect(await uploadJobs()).toHaveLength(0)
  })

  it("asks to reconnect when the channel needs reconnecting", async () => {
    const { channel } = await seed()
    await publishingRepository(env.db).setChannelStatus(
      channel!.id,
      "needs_reconnect"
    )

    expect(await importShortsAction()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: RECONNECT_MESSAGE },
    })
    expect(await uploadJobs()).toHaveLength(0)
  })

  it("refuses a second import while one is active", async () => {
    await seed()

    await importShortsAction()

    expect(await importShortsAction()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Already importing your Shorts" },
    })
    expect(await uploadJobs()).toHaveLength(1)
  })
})
