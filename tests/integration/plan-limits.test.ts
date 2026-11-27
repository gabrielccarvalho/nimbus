import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import type { PlanId } from "@/features/accounts/schema"
import { recordUsage } from "@/features/accounts/usage"
import { clipRepository } from "@/features/clips/repository"
import { setClipReviewStatus } from "@/features/clips/service"
import { importFromUrl } from "@/features/downloads/service"
import { findPatterns } from "@/features/insights/service"
import { projectRepository } from "@/features/projects/repository"
import { retryProject } from "@/features/projects/service"
import {
  findMoreHighlights,
  rerunProject,
} from "@/features/projects/settings-service"
import { startClipRenders, startEditRender } from "@/features/render/service"
import { startUpload } from "@/features/uploads/service"
import { assets, projects, user, workspaces } from "@/lib/db/schema"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

const GB = 1024 ** 3

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function workspaceOn(plan: PlanId) {
  const id = crypto.randomUUID()
  await env.db
    .insert(user)
    .values({ id, name: "Ada", email: `${id}@example.com` })
  const workspace = await accountRepository(env.db).createPersonalWorkspace({
    id,
    name: "Ada",
    email: `${id}@example.com`,
  })
  await env.db
    .update(workspaces)
    .set({ plan })
    .where(eq(workspaces.id, workspace.id))
  return { ...workspace, plan }
}

async function reviewedProject(
  workspaceId: string,
  selectorMode = "heuristic"
) {
  const { projectId } = await uploadFixture(fixtures.wide)
  const repo = projectRepository(env.db)
  await env.db
    .update(projects)
    .set({ workspaceId })
    .where(eq(projects.id, projectId))
  await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])
  if (selectorMode !== "heuristic") {
    await repo.updateSettings(projectId, {
      ...(await repo.getOrThrow(projectId)).settings,
      selectorMode: selectorMode as "anthropic",
    })
  }
  const [clip] = await clipRepository(env.db).listForProject(projectId)
  await setClipReviewStatus(env.db, projectId, clip!.id, "approved")
  return { projectId, clip: clip! }
}

const used =
  (workspaceId: string, kind: "render_seconds" | "claude_run") =>
  (amount: number) =>
    recordUsage(env.db, { id: null, workspaceId }, kind, amount)

describe("render minutes", () => {
  it("refuse a render once the month's minutes are used", async () => {
    const workspace = await workspaceOn("free")
    const { projectId, clip } = await reviewedProject(workspace.id)
    await used(workspace.id, "render_seconds")(60 * 60)

    await expect(
      startClipRenders(env.db, projectId, [clip.id])
    ).rejects.toThrow(
      "You've used your plan's 60 render minutes for this month"
    )
    await expect(startEditRender(env.db, projectId)).rejects.toThrow(
      "You've used your plan's 60 render minutes for this month"
    )
    expect((await clipRepository(env.db).getOrThrow(clip.id)).status).toBe(
      "approved"
    )
  })

  it("refuse a render longer than what's left", async () => {
    const workspace = await workspaceOn("free")
    const { projectId, clip } = await reviewedProject(workspace.id)
    await used(workspace.id, "render_seconds")(60 * 60 - 1)

    await expect(
      startClipRenders(env.db, projectId, [clip.id])
    ).rejects.toThrow(/^Rendering this takes about \d+ min/)
  })

  it("count clips that are already rendering", async () => {
    const workspace = await workspaceOn("free")
    const { projectId, clip } = await reviewedProject(workspace.id)
    const seconds = Math.ceil((clip.endMs - clip.startMs) / 1000)
    await used(workspace.id, "render_seconds")(60 * 60 - seconds)
    await startClipRenders(env.db, projectId, [clip.id])

    const other = await reviewedProject(workspace.id)
    await expect(
      startClipRenders(env.db, other.projectId, [other.clip.id])
    ).rejects.toThrow(/render minutes for this month|min left this month/)
  })

  it("apply to a retry too", async () => {
    const workspace = await workspaceOn("free")
    const { projectId, clip } = await reviewedProject(workspace.id)
    await startClipRenders(env.db, projectId, [clip.id])
    await clipRepository(env.db).update(clip.id, { status: "failed" })
    await projectRepository(env.db).markFailed(projectId, "ffmpeg died")
    await used(workspace.id, "render_seconds")(60 * 60)

    await expect(retryProject(env.db, projectId)).rejects.toThrow(
      "You've used your plan's 60 render minutes for this month"
    )
  })

  it("go further on Creator and have no end on Admin", async () => {
    const creator = await workspaceOn("creator")
    const paid = await reviewedProject(creator.id)
    await used(creator.id, "render_seconds")(60 * 60)
    await expect(
      startClipRenders(env.db, paid.projectId, [paid.clip.id])
    ).resolves.toBe(1)

    const admin = await workspaceOn("admin")
    const free = await reviewedProject(admin.id)
    await used(admin.id, "render_seconds")(5000 * 60)
    await expect(
      startClipRenders(env.db, free.projectId, [free.clip.id])
    ).resolves.toBe(1)
  })
})

describe("storage", () => {
  async function fill(workspaceId: string, bytes: number) {
    const project = await projectRepository(env.db).create({
      workspaceId,
      name: "Old stream",
      settings: (await import("@/features/projects/schema"))
        .defaultProjectSettings,
    })
    await env.db.insert(assets).values({
      id: crypto.randomUUID(),
      projectId: project.id,
      kind: "source",
      storageKey: `projects/${project.id}/source.mp4`,
      mime: "video/mp4",
      bytes,
    })
  }

  const video = (bytes: number) => ({
    kind: "video",
    fileName: "stream.mp4",
    mime: "video/mp4",
    bytes,
  })

  it("refuses an upload that doesn't fit in what's left", async () => {
    const workspace = await workspaceOn("free")
    const actor = { userId: workspace.id, workspaceId: workspace.id }
    await fill(workspace.id, 24 * GB)

    await expect(startUpload(video(2 * GB), actor)).rejects.toThrow(
      "This file doesn't fit in what's left of your plan's 25 GB of storage"
    )
    await expect(startUpload(video(1024), actor)).resolves.toMatchObject({
      token: expect.any(String),
    })
  })

  it("refuses uploads and link imports once it's full", async () => {
    const workspace = await workspaceOn("free")
    await fill(workspace.id, 25 * GB)

    await expect(
      startUpload(video(1024), {
        userId: workspace.id,
        workspaceId: workspace.id,
      })
    ).rejects.toThrow(
      "Your plan's 25 GB of storage is full. Delete a project to make room."
    )
    await expect(
      importFromUrl(
        env.db,
        "https://www.youtube.com/watch?v=abc",
        {},
        workspace.id
      )
    ).rejects.toThrow("Your plan's 25 GB of storage is full")
  })
})

describe("Claude picks", () => {
  it("refuse another pick once the month's runs are used", async () => {
    const workspace = await workspaceOn("free")
    const { projectId } = await reviewedProject(workspace.id, "anthropic")
    await used(workspace.id, "claude_run")(10)
    const message = "You've used your plan's 10 Claude picks for this month"

    await expect(findMoreHighlights(env.db, projectId)).rejects.toThrow(message)
    await expect(rerunProject(env.db, projectId, "select")).rejects.toThrow(
      message
    )
    await expect(
      findPatterns(
        env.db,
        { id: workspace.id, anthropicKey: "sealed" },
        "channel"
      )
    ).rejects.toThrow(message)
  })

  it("leave the built-in selector alone", async () => {
    const workspace = await workspaceOn("free")
    const { projectId } = await reviewedProject(workspace.id)
    await used(workspace.id, "claude_run")(10)

    await expect(findMoreHighlights(env.db, projectId)).resolves.toBeUndefined()
  })

  it("fall back to the built-in selector when a pipeline reaches selection over the limit", async () => {
    const workspace = await workspaceOn("free")
    const { projectId } = await uploadFixture(fixtures.wide, "a.mp4", {
      selectorMode: "anthropic",
    })
    await env.db
      .update(projects)
      .set({ workspaceId: workspace.id })
      .where(eq(projects.id, projectId))
    await used(workspace.id, "claude_run")(10)
    await runJobs(env.db, ["probe", "transcribe", "analyze", "select"])

    const clips = await clipRepository(env.db).listForProject(projectId)
    expect(clips.length).toBeGreaterThan(0)
    expect(clips[0]!.reason).toMatch(
      /^Claude unavailable \(You've used your plan's 10 Claude picks for this month\)/
    )
    const summary = await accountRepository(env.db).usageTotals(
      workspace.id,
      new Date(0),
      new Date(Date.now() + 1000)
    )
    expect(summary.claudeRuns).toBe(10)
  })
})
