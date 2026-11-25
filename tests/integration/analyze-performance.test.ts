import { eq } from "drizzle-orm"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import { insightsRepository } from "@/features/insights/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { publishingRepository } from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import { transcriptRepository } from "@/features/transcription/repository"
import { resetEnvCache } from "@/lib/env"
import { account, usageEvents, user, workspaces } from "@/lib/db/schema"

import { server } from "../utils/msw"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const BASE = "http://anthropic.test"
const DAY_MS = 86_400_000

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({
    ANTHROPIC_BASE_URL: BASE,
    ANTHROPIC_API_KEY: "test-key",
  })
})
afterEach(() => env.cleanup())

const metadata = {
  title: "Clutch",
  description: "",
  tags: [],
  privacy: "private" as const,
  publishAt: null,
}

async function seed(published: number, { statsAgeDays = 8 } = {}) {
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
  })
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const publishing = publishingRepository(env.db)
  const channel = await publishing.upsertChannel({
    workspaceId,
    accountId,
    channelId: "UC1",
    title: "Channel",
  })
  const project = await projectRepository(env.db).create({
    workspaceId,
    name: "Stream",
    settings: defaultProjectSettings,
  })
  await transcriptRepository(env.db).save(project.id, {
    language: "en",
    words: [],
    segments: [
      { startMs: 0, endMs: 2000, text: "go go go", wordRange: [0, 0] },
    ],
  } as never)
  const clips = await clipRepository(env.db).replaceCandidates(
    project.id,
    Array.from({ length: published }, (_, i) => ({
      startMs: i * 30_000,
      endMs: i * 30_000 + 20_000,
      title: `Clip ${i}`,
      score: 0.5,
    }))
  )
  const publicationIds: string[] = []
  for (const clip of clips) {
    const publishedAt = new Date(Date.now() - 10 * DAY_MS)
    const publication = await publishing.createPublication({
      clipId: clip.id,
      channelId: channel.id,
      metadata,
      status: "published",
      videoId: `v-${clip.id}`,
      publishedAt,
    })
    publicationIds.push(publication.id)
    await statsRepository(env.db).add({
      publicationId: publication.id,
      fetchedAt: new Date(publishedAt.getTime() + statsAgeDays * DAY_MS),
      views: 100 + clips.indexOf(clip) * 50,
      likes: 1,
      comments: 0,
      averageViewDurationS: 10,
      averageViewPercentage: 50,
      retention: null,
    })
  }
  return { channel, clips, workspaceId }
}

const message = (text: string) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  stop_details: null,
  usage: { input_tokens: 10, output_tokens: 10 },
})

async function run(channelId: string) {
  const job = await jobQueue(env.db).enqueue({
    type: "analyze_performance",
    projectId: null,
    payload: { channelId },
    maxAttempts: 1,
  })
  await runJobs(env.db, ["analyze_performance"])
  return (await jobQueue(env.db).get(job.id))!
}

describe("analyze_performance", () => {
  it("replaces pending suggestions with the cleaned ones and keeps rejected", async () => {
    const { channel, clips } = await seed(8)
    const insights = insightsRepository(env.db)
    const base = {
      target: "selection" as const,
      kind: "add" as const,
      ruleId: null,
      rationale: "r",
      evidenceFor: [],
      evidenceAgainst: [],
      confidence: 0.5,
    }
    await insights.replacePending(channel.id, [
      { ...base, text: "Rejected earlier" },
    ])
    const [earlier] = await insights.pendingSuggestions(channel.id)
    await insights.decideSuggestion(earlier!.id, "rejected")
    await insights.replacePending(channel.id, [
      { ...base, text: "Old pending" },
    ])
    server.use(
      http.post(`${BASE}/v1/messages`, () =>
        HttpResponse.json(
          message(
            JSON.stringify({
              suggestions: [
                {
                  ...base,
                  text: "Open on the crash",
                  evidenceFor: [clips[0]!.id, "unknown"],
                  confidence: 0.8,
                },
                { ...base, text: "No evidence", evidenceFor: ["unknown"] },
              ],
            })
          )
        )
      )
    )

    const job = await run(channel.id)

    expect(job.status).toBe("succeeded")
    const pending = await insights.pendingSuggestions(channel.id)
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      text: "Open on the crash",
      evidenceFor: [clips[0]!.id],
    })
    const rejected = await insights.rejectedSuggestions(channel.id)
    expect(rejected.map((s) => s.text)).toEqual(["Rejected earlier"])
  })

  it("books one claude run with no project", async () => {
    const { channel, workspaceId } = await seed(8)
    server.use(
      http.post(`${BASE}/v1/messages`, () =>
        HttpResponse.json(message(JSON.stringify({ suggestions: [] })))
      )
    )

    await run(channel.id)

    const rows = await env.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.workspaceId, workspaceId))
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "claude_run",
        amount: 1,
        projectId: null,
      }),
    ])
  })

  it("needs 8 published clips with a week of stats", async () => {
    const { channel } = await seed(8, { statsAgeDays: 3 })

    const job = await run(channel.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(
      "Find patterns needs 8 published clips with a week of stats"
    )
  })

  it("asks for a Claude key when none resolves", async () => {
    const { channel } = await seed(8)
    delete process.env.ANTHROPIC_API_KEY
    resetEnvCache()

    const job = await run(channel.id)

    expect(job.status).toBe("failed")
    expect(job.error).toContain(
      "Add a Claude API key in Workspace settings to use Claude."
    )
  })
})
