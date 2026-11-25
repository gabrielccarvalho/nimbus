import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { transcriptRepository } from "@/features/transcription/repository"
import { getEnv } from "@/lib/env"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
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
    const { projectId } = await uploadFixture(file, "two-tracks.mkv", {
      "content-type": "video/x-matroska",
    })
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
