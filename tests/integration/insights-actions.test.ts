import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import {
  approveSuggestionAction,
  editRuleAction,
  findPatternsAction,
  rejectSuggestionAction,
  restoreRuleAction,
  retireRuleAction,
} from "@/features/insights/actions"
import {
  insightsRepository,
  loadPlaybook,
  type NewInsightSuggestion,
} from "@/features/insights/repository"
import { getInsights } from "@/features/insights/queries"
import {
  approveSuggestion,
  editRule,
  rejectSuggestion,
  restoreRule,
  retireRule,
} from "@/features/insights/service"
import { PLAYBOOK_RULE_CAP } from "@/features/insights/schema"
import { clipRepository } from "@/features/clips/repository"
import { jobQueue } from "@/features/jobs/queue"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { publishingRepository } from "@/features/publishing/repository"
import { statsRepository } from "@/features/publishing/stats-repository"
import { AppError } from "@/lib/errors"
import { jobs, projects, user, workspaces } from "@/lib/db/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const signedIn: { user: { id: string; name: string } | null } = { user: null }
const selected = vi.hoisted(() => ({ playbooks: [] as unknown[] }))

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
vi.mock("@/features/highlights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/highlights")>()
  return {
    ...actual,
    selectHighlights: (
      ...args: Parameters<typeof actual.selectHighlights>
    ): ReturnType<typeof actual.selectHighlights> => {
      selected.playbooks.push(args[1].playbook)
      return actual.selectHighlights(...args)
    },
  }
})

let env: TestEnv

beforeEach(async () => {
  selected.playbooks = []
  env = await createTestEnv({ ANTHROPIC_API_KEY: "" })
})
afterEach(() => env.cleanup())

async function seed() {
  const id = crypto.randomUUID()
  const owner = { id, name: "Owner", email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  const channel = await publishingRepository(env.db).upsertChannel({
    workspaceId: workspace.id,
    accountId: null,
    channelId: "UC1",
    title: "My Channel",
  })
  signedIn.user = owner
  return { workspace, channel }
}

const base: NewInsightSuggestion = {
  target: "selection",
  kind: "add",
  ruleId: null,
  text: "",
  rationale: "because",
  evidenceFor: [],
  evidenceAgainst: [],
  confidence: 0.5,
}

async function suggest(
  channelId: string,
  suggestion: Partial<NewInsightSuggestion> & { text: string }
) {
  const insights = insightsRepository(env.db)
  await insights.replacePending(channelId, [{ ...base, ...suggestion }])
  const [row] = await insights.pendingSuggestions(channelId)
  return row!
}

async function fillRules(channelId: string, target: "selection" | "review") {
  const insights = insightsRepository(env.db)
  const rules = []
  for (let i = 0; i < PLAYBOOK_RULE_CAP; i++) {
    rules.push(
      await insights.insertRule({ channelId, target, text: `Rule ${i}` })
    )
  }
  return rules
}

describe("approveSuggestion", () => {
  it("creates an active rule from an add suggestion", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "Open on the crash" })

    await approveSuggestion(env.db, channel.id, s.id, {})

    const [rule] = await insightsRepository(env.db).activeRules(channel.id)
    expect(rule).toMatchObject({
      text: "Open on the crash",
      target: "selection",
      sourceSuggestionId: s.id,
    })
    expect((await insightsRepository(env.db).getSuggestion(s.id))?.status).toBe(
      "approved"
    )
  })

  it("stores the edited text", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "Open on the crash" })

    await approveSuggestion(env.db, channel.id, s.id, { text: "  Mine  " })

    const [rule] = await insightsRepository(env.db).activeRules(channel.id)
    expect(rule?.text).toBe("Mine")
  })

  it("rejects an edited text over the limit", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "Open" })
    await expect(
      approveSuggestion(env.db, channel.id, s.id, { text: "x".repeat(201) })
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("retires the old rule and supersedes it on an edit", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const old = await insights.insertRule({
      channelId: channel.id,
      target: "review",
      text: "Old",
    })
    const s = await suggest(channel.id, {
      target: "review",
      kind: "edit",
      ruleId: old.id,
      text: "New",
    })

    await approveSuggestion(env.db, channel.id, s.id, {})

    expect((await insights.getRule(old.id))?.status).toBe("retired")
    const [active] = await insights.activeRules(channel.id)
    expect(active).toMatchObject({
      text: "New",
      target: "review",
      supersedesId: old.id,
      sourceSuggestionId: s.id,
    })
  })

  it("keeps the cap neutral when editing a full list", async () => {
    const { channel } = await seed()
    const rules = await fillRules(channel.id, "selection")
    const s = await suggest(channel.id, {
      kind: "edit",
      ruleId: rules[0]!.id,
      text: "Better",
    })

    await approveSuggestion(env.db, channel.id, s.id, {})

    expect(
      await insightsRepository(env.db).countActive(channel.id, "selection")
    ).toBe(PLAYBOOK_RULE_CAP)
  })

  it("retires the rule on a retire suggestion and ignores a text override", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const rule = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old",
    })
    const s = await suggest(channel.id, {
      kind: "retire",
      ruleId: rule.id,
      text: "Old",
    })

    await approveSuggestion(env.db, channel.id, s.id, { text: "ignored" })

    expect((await insights.getRule(rule.id))?.status).toBe("retired")
    expect(await insights.activeRules(channel.id)).toHaveLength(0)
  })

  it("refuses a 13th rule without a retire pick and accepts it with one", async () => {
    const { channel } = await seed()
    const rules = await fillRules(channel.id, "selection")
    const s = await suggest(channel.id, { text: "Thirteen" })

    await expect(
      approveSuggestion(env.db, channel.id, s.id, {})
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This list already has 12 rules. Pick one to retire.",
    })
    expect((await insightsRepository(env.db).getSuggestion(s.id))?.status).toBe(
      "pending"
    )

    await approveSuggestion(env.db, channel.id, s.id, {
      retireRuleId: rules[3]!.id,
    })

    const insights = insightsRepository(env.db)
    expect(await insights.countActive(channel.id, "selection")).toBe(12)
    expect((await insights.getRule(rules[3]!.id))?.status).toBe("retired")
    expect(
      (await insights.activeRules(channel.id)).map((r) => r.text)
    ).toContain("Thirteen")
  })

  it("rejects a retire pick from the other list or a retired rule", async () => {
    const { channel } = await seed()
    const rules = await fillRules(channel.id, "selection")
    const other = await insightsRepository(env.db).insertRule({
      channelId: channel.id,
      target: "review",
      text: "Review rule",
    })
    const s = await suggest(channel.id, { text: "Thirteen" })

    await expect(
      approveSuggestion(env.db, channel.id, s.id, { retireRuleId: other.id })
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Pick an active rule from this list to retire",
    })
    await insightsRepository(env.db).retireRule(rules[0]!.id)
    await insightsRepository(env.db).insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Refill",
    })
    await expect(
      approveSuggestion(env.db, channel.id, s.id, {
        retireRuleId: rules[0]!.id,
      })
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("refuses a stale edit", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const rule = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old",
    })
    const s = await suggest(channel.id, {
      kind: "edit",
      ruleId: rule.id,
      text: "New",
    })
    await insights.retireRule(rule.id)

    await expect(
      approveSuggestion(env.db, channel.id, s.id, {})
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "That rule changed since this suggestion was made. Run Find patterns again.",
    })
    expect(await insights.activeRules(channel.id)).toHaveLength(0)
  })

  it("refuses a suggestion that was already decided", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "Once" })
    await approveSuggestion(env.db, channel.id, s.id, {})
    await expect(
      approveSuggestion(env.db, channel.id, s.id, {})
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This suggestion was already decided.",
    })
    expect(
      await insightsRepository(env.db).activeRules(channel.id)
    ).toHaveLength(1)
  })
})

describe("rejectSuggestion", () => {
  it("keeps the row as rejected", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "No thanks" })

    await rejectSuggestion(env.db, channel.id, s.id)

    const rejected = await insightsRepository(env.db).rejectedSuggestions(
      channel.id
    )
    expect(rejected.map((r) => r.id)).toEqual([s.id])
    await expect(
      rejectSuggestion(env.db, channel.id, s.id)
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("editRule, retireRule and restoreRule", () => {
  it("edits by retiring the old row and inserting a superseding one", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const old = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old",
    })

    const next = await editRule(env.db, channel.id, old.id, " Fresh ")

    expect(next).toMatchObject({ text: "Fresh", supersedesId: old.id })
    expect((await insights.getRule(old.id))?.status).toBe("retired")
    expect((await insights.getRule(old.id))?.text).toBe("Old")
    await expect(
      editRule(env.db, channel.id, old.id, "Again")
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("retires and restores a rule", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const rule = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Keep",
    })

    await retireRule(env.db, channel.id, rule.id)
    expect(await insights.activeRules(channel.id)).toHaveLength(0)
    await restoreRule(env.db, channel.id, rule.id, {})
    expect((await insights.getRule(rule.id))?.status).toBe("active")
    await expect(
      restoreRule(env.db, channel.id, rule.id, {})
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This rule is already active.",
    })
  })

  it("applies the cap when restoring", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const gone = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Gone",
    })
    await insights.retireRule(gone.id)
    const rules = await fillRules(channel.id, "selection")

    await expect(
      restoreRule(env.db, channel.id, gone.id, {})
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "This list already has 12 rules. Pick one to retire.",
    })

    await restoreRule(env.db, channel.id, gone.id, {
      retireRuleId: rules[0]!.id,
    })
    expect(await insights.countActive(channel.id, "selection")).toBe(12)
  })

  it("restores a rule whose successor is active", async () => {
    const { channel } = await seed()
    const insights = insightsRepository(env.db)
    const old = await insights.insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old",
    })
    await editRule(env.db, channel.id, old.id, "New")

    await restoreRule(env.db, channel.id, old.id, {})

    expect(await insights.countActive(channel.id, "selection")).toBe(2)
  })
})

describe("workspace scoping", () => {
  it("treats another channel's suggestions and rules as not found", async () => {
    const { channel } = await seed()
    const otherWorkspace = crypto.randomUUID()
    await env.db
      .insert(workspaces)
      .values({ id: otherWorkspace, name: "Other" })
    const other = await publishingRepository(env.db).upsertChannel({
      workspaceId: otherWorkspace,
      accountId: null,
      channelId: "UC2",
      title: "Other",
    })
    const s = await suggest(other.id, { text: "Theirs" })
    const rule = await insightsRepository(env.db).insertRule({
      channelId: other.id,
      target: "selection",
      text: "Theirs",
    })

    for (const call of [
      () => approveSuggestion(env.db, channel.id, s.id, {}),
      () => rejectSuggestion(env.db, channel.id, s.id),
      () => editRule(env.db, channel.id, rule.id, "Mine"),
      () => retireRule(env.db, channel.id, rule.id),
      () => restoreRule(env.db, channel.id, rule.id, {}),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(AppError)
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" })
    }
    expect((await insightsRepository(env.db).getSuggestion(s.id))?.status).toBe(
      "pending"
    )
  })
})

describe("actions", () => {
  it("run for the viewer's channel and return ActionResult", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "Open on the crash" })

    const approved = await approveSuggestionAction(s.id, {
      text: "Open on the crash!",
    })
    expect(approved.ok).toBe(true)
    const [rule] = await insightsRepository(env.db).activeRules(channel.id)
    expect(rule?.text).toBe("Open on the crash!")

    expect((await editRuleAction(rule!.id, "Edited")).ok).toBe(true)
    const [edited] = await insightsRepository(env.db).activeRules(channel.id)
    expect((await retireRuleAction(edited!.id)).ok).toBe(true)
    expect((await restoreRuleAction(edited!.id, {})).ok).toBe(true)
    const next = await suggest(channel.id, { text: "Another" })
    expect((await rejectSuggestionAction(next.id)).ok).toBe(true)
  })

  it("validates unknown inputs", async () => {
    const { channel } = await seed()
    const s = await suggest(channel.id, { text: "x" })
    expect(await approveSuggestionAction(s.id, { text: "" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    })
    await expect(approveSuggestionAction("", {})).rejects.toMatchObject({
      code: "VALIDATION",
    })
    expect(await editRuleAction("r", 5)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    })
  })

  it("returns NOT_FOUND without a channel", async () => {
    const id = crypto.randomUUID()
    const owner = { id, name: "Owner", email: `${id}@example.com` }
    await env.db.insert(user).values(owner)
    signedIn.user = owner
    expect(await rejectSuggestionAction("x")).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    })
  })
})

describe("approval reaches the prompts", () => {
  it("puts an approved selection rule into the playbook and the select input", async () => {
    const { workspace, channel } = await seed()
    const s = await suggest(channel.id, { text: "Open on the crash" })
    await approveSuggestion(env.db, channel.id, s.id, {})

    expect(await loadPlaybook(env.db, workspace.id)).toMatchObject({
      selection: ["Open on the crash"],
      review: [],
    })

    const { projectId } = await uploadFixture(fixtures.wide)
    await env.db
      .update(projects)
      .set({ workspaceId: workspace.id })
      .where(eq(projects.id, projectId))
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])

    expect(selected.playbooks.at(-1)).toEqual({
      selection: ["Open on the crash"],
      review: [],
    })
  })
})

describe("findPatternsAction", () => {
  async function publishClips(channelId: string, count: number) {
    const project = await projectRepository(env.db).create({
      workspaceId: (await publishingRepository(env.db).getChannelById(
        channelId
      ))!.workspaceId,
      name: "Stream",
      settings: defaultProjectSettings,
    })
    const clips = await clipRepository(env.db).replaceCandidates(
      project.id,
      Array.from({ length: count }, (_, i) => ({
        startMs: i * 30_000,
        endMs: i * 30_000 + 20_000,
        title: `Clip ${i}`,
        score: 0.5,
      }))
    )
    for (const clip of clips) {
      const publishedAt = new Date(Date.now() - 10 * 86_400_000)
      const publication = await publishingRepository(env.db).createPublication({
        clipId: clip.id,
        channelId,
        metadata: {
          title: "t",
          description: "",
          tags: [],
          privacy: "private",
          publishAt: null,
        },
        status: "published",
        videoId: `v-${clip.id}`,
        publishedAt,
      })
      await statsRepository(env.db).add({
        publicationId: publication.id,
        fetchedAt: new Date(publishedAt.getTime() + 8 * 86_400_000),
        views: 100,
        likes: 1,
        comments: 0,
        averageViewDurationS: 10,
        averageViewPercentage: 50,
        retention: null,
      })
    }
    return clips
  }

  const analyzeJobs = () =>
    env.db.select().from(jobs).where(eq(jobs.type, "analyze_performance"))

  it("refuses without Claude, too few clips, or an active job", async () => {
    const { workspace, channel } = await seed()
    expect(await findPatternsAction()).toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_MISSING" },
    })

    await accountRepository(env.db).setAnthropicKey(
      workspace.id,
      "sealed",
      "test"
    )
    expect(await findPatternsAction()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    })
    expect(await analyzeJobs()).toHaveLength(0)

    await publishClips(channel.id, 8)
    expect((await findPatternsAction()).ok).toBe(true)
    const queued = await analyzeJobs()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({
      projectId: null,
      maxAttempts: 1,
      payload: { channelId: channel.id },
    })
    expect(await findPatternsAction()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "Already looking for patterns" },
    })
  })

  it("reports status through getInsights", async () => {
    const { workspace, channel } = await seed()
    await accountRepository(env.db).setAnthropicKey(
      workspace.id,
      "sealed",
      "test"
    )
    const clips = await publishClips(channel.id, 8)
    const s = await suggest(channel.id, {
      text: "Open on the crash",
      evidenceFor: [clips[0]!.id, "gone"],
    })
    await insightsRepository(env.db).insertRule({
      channelId: channel.id,
      target: "review",
      text: "Cut slow ends",
    })
    const retired = await insightsRepository(env.db).insertRule({
      channelId: channel.id,
      target: "selection",
      text: "Old one",
    })
    await insightsRepository(env.db).retireRule(retired.id)

    const idle = await getInsights()
    expect(idle).toMatchObject({
      channel: { title: "My Channel" },
      eligible: 8,
      needed: 8,
      claudeAvailable: true,
      running: false,
      lastError: null,
    })
    expect(idle.suggestions[0]).toMatchObject({ id: s.id })
    expect(idle.suggestions[0]!.evidenceFor).toEqual([
      {
        clipId: clips[0]!.id,
        title: "Clip 0",
        projectId: clips[0]!.projectId,
        views: 100,
      },
    ])
    expect(idle.rules.review.map((r) => r.text)).toEqual(["Cut slow ends"])
    expect(idle.rules.selection).toEqual([])
    expect(idle.rules.retired.map((r) => r.text)).toEqual(["Old one"])

    const queue = jobQueue(env.db)
    const failed = await queue.enqueue({
      type: "analyze_performance",
      projectId: null,
      payload: { channelId: channel.id },
      maxAttempts: 1,
    })
    await env.db
      .update(jobs)
      .set({ status: "failed", error: "Claude said no" })
      .where(eq(jobs.id, failed.id))
    expect((await getInsights()).lastError).toBe("Claude said no")

    await queue.enqueue({
      type: "analyze_performance",
      projectId: null,
      payload: { channelId: channel.id },
      maxAttempts: 1,
    })
    expect(await getInsights()).toMatchObject({ running: true })
  })

  it("returns no channel when none is connected", async () => {
    const id = crypto.randomUUID()
    const owner = { id, name: "Owner", email: `${id}@example.com` }
    await env.db.insert(user).values(owner)
    signedIn.user = owner
    expect(await getInsights()).toMatchObject({
      channel: null,
      eligible: 0,
      suggestions: [],
    })
  })
})
