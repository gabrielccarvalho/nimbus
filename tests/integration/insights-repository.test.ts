import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { insightsRepository } from "@/features/insights/repository"
import { INSIGHTS_MAX_REJECTED } from "@/features/insights/schema"
import { publishingRepository } from "@/features/publishing/repository"
import { insightSuggestions, playbookRules, workspaces } from "@/lib/db/schema"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function seed() {
  const workspaceId = crypto.randomUUID()
  await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId,
    accountId: null,
    channelId: "UC1",
    title: "Channel",
  })
  return { channel, repo: insightsRepository(env.db) }
}

const suggestion = (text: string) => ({
  target: "selection" as const,
  kind: "add" as const,
  ruleId: null,
  text,
  rationale: "Because",
  evidenceFor: ["c1"],
  evidenceAgainst: [],
  confidence: 0.7,
})

describe("insights repository", () => {
  it("round-trips rules, retiring and restoring them", async () => {
    const { channel, repo } = await seed()
    const inserted = await repo.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "A",
    })
    const b = await repo.insertRule({
      channelId: channel.id,
      target: "review",
      text: "B",
    })
    const a = {
      ...inserted,
      createdAt: new Date(b.createdAt.getTime() - 60_000),
    }
    await env.db
      .update(playbookRules)
      .set({ createdAt: a.createdAt })
      .where(eq(playbookRules.id, a.id))
    expect(a).toMatchObject({ status: "active", retiredAt: null })
    expect(await repo.getRule(a.id)).toEqual(a)
    expect(await repo.getRule("missing")).toBeUndefined()
    expect((await repo.activeRules(channel.id)).map((r) => r.id)).toEqual([
      a.id,
      b.id,
    ])
    expect((await repo.rules(channel.id)).map((r) => r.id)).toEqual([
      b.id,
      a.id,
    ])
    expect(await repo.countActive(channel.id, "selection")).toBe(1)

    const retired = await repo.retireRule(a.id)
    expect(retired.status).toBe("retired")
    expect(retired.retiredAt).toBeInstanceOf(Date)
    expect(await repo.countActive(channel.id, "selection")).toBe(0)
    expect((await repo.activeRules(channel.id)).map((r) => r.id)).toEqual([
      b.id,
    ])
    expect((await repo.rules(channel.id)).map((r) => r.id)).toEqual([
      b.id,
      a.id,
    ])

    const restored = await repo.restoreRule(a.id)
    expect(restored).toMatchObject({ status: "active", retiredAt: null })
  })

  it("keeps the supersedes link when a rule is replaced", async () => {
    const { channel, repo } = await seed()
    const old = await repo.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old",
    })
    const next = await repo.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "New",
      supersedesId: old.id,
    })
    expect(next.supersedesId).toBe(old.id)
  })

  it("replaces pending suggestions and keeps decided ones", async () => {
    const { channel, repo } = await seed()
    await repo.replacePending(channel.id, [
      suggestion("one"),
      suggestion("two"),
    ])
    const [first] = await repo.pendingSuggestions(channel.id)
    expect(await repo.pendingSuggestions(channel.id)).toHaveLength(2)
    expect(await repo.getSuggestion(first!.id)).toMatchObject({
      status: "pending",
      decidedAt: null,
      evidenceFor: ["c1"],
      confidence: 0.7,
    })

    const rejected = await repo.decideSuggestion(first!.id, "rejected")
    expect(rejected?.decidedAt).toBeInstanceOf(Date)
    expect(
      (await repo.rejectedSuggestions(channel.id)).map((s) => s.id)
    ).toEqual([first!.id])

    await repo.replacePending(channel.id, [suggestion("three")])
    expect(
      (await repo.pendingSuggestions(channel.id)).map((s) => s.text)
    ).toEqual(["three"])
    expect(await repo.rejectedSuggestions(channel.id)).toHaveLength(1)
    await repo.replacePending(channel.id, [])
    expect(await repo.pendingSuggestions(channel.id)).toEqual([])
  })

  it("returns only the newest rejected suggestions", async () => {
    const { channel, repo } = await seed()
    const count = INSIGHTS_MAX_REJECTED + 2
    await env.db.insert(insightSuggestions).values(
      Array.from({ length: count }, (_, i) => ({
        ...suggestion(`rejected ${i}`),
        id: crypto.randomUUID(),
        channelId: channel.id,
        status: "rejected" as const,
        decidedAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
      }))
    )

    const rejected = await repo.rejectedSuggestions(channel.id)

    expect(rejected).toHaveLength(INSIGHTS_MAX_REJECTED)
    expect(rejected[0]!.text).toBe(`rejected ${count - 1}`)
    expect(rejected.at(-1)!.text).toBe("rejected 2")
  })

  it("links a suggestion to its rule", async () => {
    const { channel, repo } = await seed()
    const rule = await repo.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "A",
    })
    await repo.replacePending(channel.id, [
      { ...suggestion("x"), kind: "retire", ruleId: rule.id },
    ])
    expect((await repo.pendingSuggestions(channel.id))[0]!.ruleId).toBe(rule.id)
  })
})
