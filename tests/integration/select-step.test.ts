import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clipRepository } from "@/features/clips/repository"
import {
  applyManualSelection,
  setClipReviewStatus,
} from "@/features/clips/service"
import { HeuristicSelector } from "@/features/highlights/heuristic"
import { layoutRepository } from "@/features/layout/repository"
import { insightsRepository } from "@/features/insights/repository"
import { projectRepository } from "@/features/projects/repository"
import { publishingRepository } from "@/features/publishing/repository"

import { assets, projects, workspaces } from "@/lib/db/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const review = vi.hoisted(() => ({
  on: false,
  selectorFails: false,
  description: undefined as string | undefined,
  playbooks: [] as unknown[],
}))

vi.mock("@/features/highlights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/highlights")>()
  return {
    ...actual,
    selectHighlights: (
      ...args: Parameters<typeof actual.selectHighlights>
    ): ReturnType<typeof actual.selectHighlights> => {
      review.playbooks.push(args[1].playbook)
      if (!review.on) return actual.selectHighlights(...args)
      const [, input, logger] = args
      return actual.selectHighlights(
        "anthropic",
        { ...input, frames: input.frames && (async (at) => at.map(() => "")) },
        logger,
        () =>
          review.selectorFails
            ? {
                id: "anthropic" as const,
                select: async () => {
                  throw new Error("Claude is down")
                },
              }
            : new HeuristicSelector(),
        () => ({
          review: async (candidates) =>
            candidates.map((c) => ({
              ...c,
              ...(review.description
                ? { description: review.description }
                : {}),
              beats: [
                { ms: c.startMs + 5000, kind: "reaction" as const },
                { ms: c.endMs + 60_000, kind: "reaction" as const },
              ],
            })),
        })
      )
    },
  }
})

let env: TestEnv

beforeEach(async () => {
  review.on = false
  review.selectorFails = false
  review.description = undefined
  review.playbooks = []
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function analyzed(configure?: (projectId: string) => Promise<void>) {
  const { projectId } = await uploadFixture(fixtures.wide)
  await configure?.(projectId)
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  return projectId
}

describe("select step", () => {
  it("stores heuristic candidates and waits for layout confirmation", async () => {
    const projectId = await analyzed()
    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project.status).toBe("awaiting_layout")
    expect(project.awaitingManualSelection).toBe(false)
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      expect(clip.status).toBe("candidate")
      expect(clip.endMs - clip.startMs).toBeGreaterThanOrEqual(15_000)
      expect(clip.endMs).toBeLessThanOrEqual(20_100)
      expect(clip.reason).toMatch(/^Heuristic/)
      expect(clip.description).toBe(clip.hook)
    }
  })

  it("skips layout confirmation when a preset already confirmed it", async () => {
    await layoutRepository(env.db).savePreset(1920, 1080, {
      webcamRect: { x: 0.78, y: 0.03, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top",
    })
    const projectId = await analyzed()
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "ready_for_review"
    )
  })

  it("waits for pasted JSON in manual mode", async () => {
    const projectId = await analyzed(async (id) => {
      const projects = projectRepository(env.db)
      await projects.updateSettings(id, {
        ...(await projects.getOrThrow(id)).settings,
        selectorMode: "manual",
      })
    })
    expect(
      (await projectRepository(env.db).getOrThrow(projectId))
        .awaitingManualSelection
    ).toBe(true)
    expect(await clipRepository(env.db).listForProject(projectId)).toEqual([])

    await expect(
      applyManualSelection(env.db, projectId, "nope")
    ).rejects.toThrow(/clips/)
    await expect(
      applyManualSelection(
        env.db,
        projectId,
        '{"clips":[{"startMs":50000,"endMs":70000}]}'
      )
    ).rejects.toThrow(/None of those clips fit/)

    const added = await applyManualSelection(
      env.db,
      projectId,
      'Sure! {"clips":[{"startMs":6000,"endMs":19500,"title":"The boss","hook":"Wait…","reason":"Reaction","score":0.9}]}'
    )
    expect(added).toBe(1)
    expect(
      (await clipRepository(env.db).listForProject(projectId))[0]!.description
    ).toBe("Wait…")
    expect(
      (await projectRepository(env.db).getOrThrow(projectId))
        .awaitingManualSelection
    ).toBe(false)
    const [clip] = await clipRepository(env.db).listForProject(projectId)
    expect(clip).toMatchObject({
      title: "The boss",
      endMs: 20_000,
      effects: { edited: false },
    })
    expect(clip!.endMs - clip!.startMs).toBeGreaterThanOrEqual(15_000)
  })
})

describe("playbook at selection", () => {
  async function withRules(
    rules: { target: "selection" | "review"; text: string }[],
    options: { selectorMode?: "anthropic"; dropProxy?: boolean } = {}
  ) {
    const { projectId } = await uploadFixture(fixtures.wide)
    if (options.selectorMode) {
      review.on = true
      const projects = projectRepository(env.db)
      await projects.updateSettings(projectId, {
        ...(await projects.getOrThrow(projectId)).settings,
        selectorMode: options.selectorMode,
      })
    }
    const workspaceId = crypto.randomUUID()
    await env.db.insert(workspaces).values({ id: workspaceId, name: "Studio" })
    await env.db
      .update(projects)
      .set({ workspaceId })
      .where(eq(projects.id, projectId))
    const channel = await publishingRepository(env.db).upsertChannel({
      workspaceId,
      accountId: null,
      channelId: "UC1",
      title: "Channel",
    })
    const insights = insightsRepository(env.db)
    const ids: string[] = []
    for (const rule of rules) {
      ids.push(
        (await insights.insertRule({ channelId: channel.id, ...rule })).id
      )
    }
    await runJobs(env.db, ["probe", "transcribe", "analyze"])
    if (options.dropProxy) {
      await env.db
        .delete(assets)
        .where(and(eq(assets.projectId, projectId), eq(assets.kind, "proxy")))
    }
    await runJobs(env.db, ["select"])
    return { projectId, ids }
  }

  const rules = [
    { target: "selection" as const, text: "Open on the crash" },
    { target: "review" as const, text: "Cut slow ends" },
  ]

  const ruleIdsOnClips = async (projectId: string) => {
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    return clips.map(
      (clip) => clip.playbookRuleIds && [...clip.playbookRuleIds]
    )
  }

  it("passes the active rules on and records their ids when Claude selected and reviewed", async () => {
    const { projectId, ids } = await withRules(rules, {
      selectorMode: "anthropic",
    })
    expect(review.playbooks.at(-1)).toEqual({
      selection: ["Open on the crash"],
      review: ["Cut slow ends"],
    })
    for (const recorded of await ruleIdsOnClips(projectId)) {
      expect(recorded?.sort()).toEqual([...ids].sort())
    }
  })

  it("records only the selection rule ids when the video review didn't run", async () => {
    const { projectId, ids } = await withRules(rules, {
      selectorMode: "anthropic",
      dropProxy: true,
    })
    for (const recorded of await ruleIdsOnClips(projectId)) {
      expect(recorded).toEqual([ids[0]])
    }
  })

  it("records no rule ids when the heuristic selector picked the clips", async () => {
    const { projectId } = await withRules(rules)
    for (const recorded of await ruleIdsOnClips(projectId)) {
      expect(recorded).toBeNull()
    }
  })

  it("records no rule ids when Claude failed and the heuristic took over", async () => {
    review.selectorFails = true
    const { projectId } = await withRules(rules, { selectorMode: "anthropic" })
    for (const recorded of await ruleIdsOnClips(projectId)) {
      expect(recorded).toBeNull()
    }
  })

  it("leaves the rule ids null without a channel or rules", async () => {
    const projectId = await analyzed()
    expect(review.playbooks.at(-1)).toBeUndefined()
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) expect(clip.playbookRuleIds).toBeNull()
  })
})

describe("auto effects at selection", () => {
  const withReview = async (autoEffects: boolean) => {
    review.on = true
    await layoutRepository(env.db).savePreset(1920, 1080, {
      webcamRect: { x: 0.78, y: 0.03, w: 0.2, h: 0.2 },
      gameplayRect: { x: 0, y: 0, w: 1, h: 1 },
      gameplayFocusX: 0.5,
      mode: "cam-top",
    })
    return analyzed(async (id) => {
      const projects = projectRepository(env.db)
      await projects.updateSettings(id, {
        ...(await projects.getOrThrow(id)).settings,
        autoEffects,
      })
    })
  }

  it("stores beats and an auto effect track when autoEffects is on", async () => {
    const projectId = await withReview(true)
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      expect(clip.beats).toEqual([{ ms: expect.any(Number), kind: "reaction" }])
      expect(clip.effects).toMatchObject({ edited: false })
      const beat = clip.beats![0]!
      expect(clip.effects!.events).toContainEqual(
        expect.objectContaining({ kind: "focus" })
      )
      const focus = clip.effects!.events.find((e) => e.kind === "focus")!
      expect(Math.abs(focus.startMs - beat.ms)).toBeLessThanOrEqual(3000)
      for (const event of clip.effects!.events) {
        expect(event.startMs).toBeGreaterThanOrEqual(clip.startMs)
        expect(event.endMs).toBeLessThanOrEqual(clip.endMs)
      }
    }
  })

  it("stores a description from the selector instead of the hook", async () => {
    review.description = "He lands the jump and the whole lobby loses it."
    const projectId = await withReview(false)
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      expect(clip.description).toBe(review.description)
      expect(clip.description).not.toBe(clip.hook)
    }
  })

  it("leaves effects null when autoEffects is off", async () => {
    const projectId = await withReview(false)
    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      expect(clip.beats).toHaveLength(1)
      expect(clip.effects).toBeNull()
    }
  })
})

describe("clip review", () => {
  it("approves, rejects and resets only the project's own clips", async () => {
    const projectId = await analyzed()
    const [clip] = await clipRepository(env.db).listForProject(projectId)
    expect(
      (await setClipReviewStatus(env.db, projectId, clip!.id, "approved"))
        .status
    ).toBe("approved")
    expect(
      (await setClipReviewStatus(env.db, projectId, clip!.id, "rejected"))
        .status
    ).toBe("rejected")
    await expect(
      setClipReviewStatus(env.db, "other", clip!.id, "approved")
    ).rejects.toThrow(/not found/)
    await expect(
      setClipReviewStatus(env.db, projectId, clip!.id, "rendered")
    ).rejects.toThrow(/only be/)
    await clipRepository(env.db).setStatus([clip!.id], "rendering")
    await expect(
      setClipReviewStatus(env.db, projectId, clip!.id, "candidate")
    ).rejects.toThrow(/rendering/)
  })
})
