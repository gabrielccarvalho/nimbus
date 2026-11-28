import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { eq } from "drizzle-orm"
import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { saveGroqKey } from "@/features/accounts/service"
import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { GROQ_TRANSCRIPTIONS_URL } from "@/features/transcription/groq"
import { transcriptRepository } from "@/features/transcription/repository"
import { projects as projectsTable, user } from "@/lib/db/schema"
import { getEnv, resetEnvCache } from "@/lib/env"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { server } from "../utils/msw"
import { runJobs, uploadFixture } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("transcribe step", () => {
  it("extracts 16 kHz mono audio and stores a normalized transcript", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe"])

    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "analyzing"
    )
    const audio = await assetRepository(env.db).findByKind(projectId, "audio")
    expect(audio).toMatchObject({ mime: "audio/wav" })
    expect((await getStorage().stat(audio!.storageKey))?.bytes).toBeGreaterThan(
      16_000 * 2 * 19
    )

    const transcript = await transcriptRepository(env.db).get(projectId)
    expect(transcript?.language).toBe("en")
    expect(transcript?.words[0]).toMatchObject({ text: "Okay", startMs: 200 })
    expect(transcript?.segments.map((s) => s.text)).toContain(
      "Wait, what is he doing?"
    )
    for (const word of transcript!.words)
      expect(word.endMs).toBeLessThanOrEqual(20_100)

    expect(
      (await jobQueue(env.db).listForProject(projectId)).find(
        (j) => j.type === "analyze"
      )?.status
    ).toBe("queued")
  })

  it("is idempotent when re-run", async () => {
    const { projectId } = await uploadFixture(fixtures.wide)
    await runJobs(env.db, ["probe", "transcribe"])
    const projects = projectRepository(env.db)
    await projects.markFailed(projectId, "boom")
    await projects.resumeFailed(projectId, "transcribing")
    await jobQueue(env.db).enqueue({ type: "transcribe", projectId })
    await runJobs(env.db, ["transcribe"])
    expect((await projects.getOrThrow(projectId)).status).toBe("analyzing")
    expect(
      (await assetRepository(env.db).listForProject(projectId)).filter(
        (a) => a.kind === "audio"
      )
    ).toHaveLength(1)
  })

  it("uses the chosen language, then the video page's, then detection", async () => {
    const projects = projectRepository(env.db)
    const chosen = await uploadFixture(fixtures.wide)
    const hinted = await uploadFixture(fixtures.wide)
    const detected = await uploadFixture(fixtures.wide)
    const project = await projects.getOrThrow(chosen.projectId)
    await projects.updateSettings(chosen.projectId, {
      ...project.settings,
      language: "es",
    })
    await projects.setSourceLanguage(chosen.projectId, "pt")
    await projects.setSourceLanguage(hinted.projectId, "pt")
    await runJobs(env.db, ["probe", "transcribe"])

    const transcripts = transcriptRepository(env.db)
    expect(await transcripts.get(chosen.projectId)).toMatchObject({
      language: "es",
      languageSource: "setting",
    })
    expect(await transcripts.get(hinted.projectId)).toMatchObject({
      language: "pt",
      languageSource: "source",
    })
    expect(await transcripts.get(detected.projectId)).toMatchObject({
      language: "en",
      languageSource: "detected",
    })
  })

  it("transcribes the chosen voice track and records every track", async () => {
    const file = path.join(env.dataDir, "two-tracks.mkv")
    execFileSync(getEnv().FFMPEG_PATH, [
      "-v",
      "error",
      "-i",
      fixtures.wide,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=mono",
      "-map",
      "0:v",
      "-map",
      "0:a",
      "-map",
      "1:a",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-metadata:s:a:1",
      "title=Mic",
      "-shortest",
      file,
    ])
    const { projectId } = await uploadFixture(file, "two-tracks.mkv")
    await runJobs(env.db, ["probe"])
    const assets = assetRepository(env.db)
    const source = await assets.findByKind(projectId, "source")
    expect(source?.audioTracks).toHaveLength(2)
    expect(source?.audioTracks?.[1]).toMatchObject({ index: 1, title: "Mic" })

    const projects = projectRepository(env.db)
    const project = await projects.getOrThrow(projectId)
    await projects.updateSettings(projectId, {
      ...project.settings,
      audioTrack: 1,
    })
    await runJobs(env.db, ["transcribe"])

    const audio = await assets.findByKind(projectId, "audio")
    const wav = await readFile(path.join(env.dataDir, audio!.storageKey))
    let peak = 0
    for (let i = wav.indexOf("data") + 8; i + 1 < wav.length; i += 2) {
      peak = Math.max(peak, Math.abs(wav.readInt16LE(i)))
    }
    expect(peak).toBe(0)
  })
})

describe("transcribe step with Groq", () => {
  const KEY = "gsk_test_0123456789abcdefghijkl"

  beforeEach(() => {
    process.env.TRANSCRIBER = "groq"
    resetEnvCache()
  })
  afterEach(() => {
    process.env.TRANSCRIBER = "fake"
    resetEnvCache()
  })

  async function workspaceProject(file = fixtures.wide) {
    const id = crypto.randomUUID()
    await env.db
      .insert(user)
      .values({ id, name: "Ada", email: `${id}@example.com` })
    const workspace = await accountRepository(env.db).createPersonalWorkspace({
      id,
      name: "Ada",
      email: `${id}@example.com`,
    })
    const { projectId } = await uploadFixture(file, path.basename(file))
    await env.db
      .update(projectsTable)
      .set({ workspaceId: workspace.id })
      .where(eq(projectsTable.id, projectId))
    return { projectId, workspaceId: workspace.id }
  }

  it("skips transcription when the workspace has no key", async () => {
    const { projectId } = await workspaceProject()
    await runJobs(env.db, ["probe", "transcribe"])

    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "analyzing"
    )
    expect(
      await assetRepository(env.db).findByKind(projectId, "audio")
    ).toBeDefined()
    expect(await transcriptRepository(env.db).get(projectId)).toBeUndefined()
    const job = (await jobQueue(env.db).listForProject(projectId)).find(
      (j) => j.type === "transcribe"
    )
    expect(job).toMatchObject({
      status: "succeeded",
      detail: { phase: "skipped" },
    })
  })

  it("sends the audio to Groq with the workspace key", async () => {
    const { projectId, workspaceId } = await workspaceProject()
    await saveGroqKey(env.db, workspaceId, KEY)
    const requests: {
      auth: string | null
      model: FormDataEntryValue | null
      language: FormDataEntryValue | null
      granularities: FormDataEntryValue[]
    }[] = []
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, async ({ request }) => {
        const form = await request.formData()
        const granularities = form.getAll("timestamp_granularities[]")
        requests.push({
          auth: request.headers.get("authorization"),
          model: form.get("model"),
          language: form.get("language"),
          granularities,
        })
        if (granularities.length === 0) {
          return HttpResponse.json({ language: "Portuguese" })
        }
        return HttpResponse.json({
          language: "portuguese",
          segments: [{ text: " Olha isso, que loucura!" }],
          words: [
            { word: "Olha", start: 0.4, end: 0.7 },
            { word: "isso", start: 0.7, end: 1.0 },
            { word: "que", start: 1.2, end: 1.4 },
            { word: "loucura", start: 1.4, end: 2.0 },
          ],
        })
      })
    )
    await runJobs(env.db, ["probe", "transcribe"])

    expect(requests[0]).toMatchObject({
      auth: `Bearer ${KEY}`,
      model: "whisper-large-v3-turbo",
      language: null,
      granularities: [],
    })
    expect(requests.at(-1)).toMatchObject({
      language: "pt",
      granularities: ["word", "segment"],
    })
    expect(await transcriptRepository(env.db).get(projectId)).toMatchObject({
      language: "pt",
      languageSource: "detected",
      words: [
        { text: "Olha", startMs: 400, endMs: 700 },
        { text: "isso,", startMs: 700, endMs: 1000 },
        { text: "que", startMs: 1200, endMs: 1400 },
        { text: "loucura!", startMs: 1400, endMs: 2000 },
      ],
    })
  })

  async function expectSkipped(projectId: string, skipReason: string) {
    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "analyzing"
    )
    expect(await transcriptRepository(env.db).get(projectId)).toBeUndefined()
    const jobs = await jobQueue(env.db).listForProject(projectId)
    expect(jobs.find((j) => j.type === "transcribe")).toMatchObject({
      status: "succeeded",
      attempts: 1,
      detail: { phase: "skipped", skipReason, words: 0 },
    })
    expect(jobs.find((j) => j.type === "analyze")?.status).toBe("queued")
  }

  it("skips transcription when Groq rejects the key", async () => {
    const { projectId, workspaceId } = await workspaceProject()
    await saveGroqKey(env.db, workspaceId, KEY)
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, () =>
        HttpResponse.json(
          { error: { message: "Invalid API Key" } },
          { status: 401 }
        )
      )
    )
    await runJobs(env.db, ["probe", "transcribe"])
    await expectSkipped(projectId, "rejected")
  })

  it("skips transcription when Groq's rate limit is reached mid-way", async () => {
    const { projectId, workspaceId } = await workspaceProject()
    await saveGroqKey(env.db, workspaceId, KEY)
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, async ({ request }) => {
        const form = await request.formData()
        if (form.getAll("timestamp_granularities[]").length === 0) {
          return HttpResponse.json({ language: "english" })
        }
        return HttpResponse.json(
          { error: { message: "Rate limit reached for model" } },
          { status: 429 }
        )
      })
    )
    await runJobs(env.db, ["probe", "transcribe"])
    await expectSkipped(projectId, "rate_limited")
  })

  it("keeps the words received before Groq's rate limit", async () => {
    const file = path.join(env.dataDir, "eleven-minutes.mp4")
    execFileSync(getEnv().FFMPEG_PATH, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:r=1",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=16000:cl=mono",
      "-t",
      "660",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      file,
    ])
    const { projectId, workspaceId } = await workspaceProject(file)
    await saveGroqKey(env.db, workspaceId, KEY)
    let chunks = 0
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, async ({ request }) => {
        const form = await request.formData()
        if (form.getAll("timestamp_granularities[]").length === 0) {
          return HttpResponse.json({ language: "english" })
        }
        if (++chunks > 1) {
          return HttpResponse.json(
            { error: { message: "Rate limit reached for model" } },
            { status: 429 }
          )
        }
        return HttpResponse.json({
          language: "english",
          segments: [{ text: " Okay, let's go." }],
          words: [
            { word: "Okay", start: 0.2, end: 0.5 },
            { word: "let's", start: 0.6, end: 0.8 },
            { word: "go", start: 0.8, end: 1.1 },
          ],
        })
      })
    )
    await runJobs(env.db, ["probe", "transcribe"])

    expect((await projectRepository(env.db).getOrThrow(projectId)).status).toBe(
      "analyzing"
    )
    expect(
      (await transcriptRepository(env.db).get(projectId))?.words.map(
        (w) => w.text
      )
    ).toEqual(["Okay,", "let's", "go."])
    expect(
      (await jobQueue(env.db).listForProject(projectId)).find(
        (j) => j.type === "transcribe"
      )
    ).toMatchObject({
      detail: { phase: "skipped", skipReason: "rate_limited", words: 3 },
    })
  })

  it("keeps an earlier transcript when a re-run stops sooner", async () => {
    const { projectId, workspaceId } = await workspaceProject()
    await runJobs(env.db, ["probe"])
    const transcripts = transcriptRepository(env.db)
    await transcripts.save(projectId, {
      language: "en",
      languageSource: "detected",
      words: [{ text: "Earlier", startMs: 0, endMs: 900, confidence: 1 }],
      segments: [],
    })
    await saveGroqKey(env.db, workspaceId, KEY)
    server.use(
      http.post(GROQ_TRANSCRIPTIONS_URL, () =>
        HttpResponse.json(
          { error: { message: "Rate limit reached for model" } },
          { status: 429 }
        )
      )
    )
    await runJobs(env.db, ["transcribe"])

    expect((await transcripts.get(projectId))?.words).toMatchObject([
      { text: "Earlier" },
    ])
  })
})
