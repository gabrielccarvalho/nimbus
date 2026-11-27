import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { FakeTranscriber } from "@/features/transcription/fake"
import type { Transcriber } from "@/features/transcription/transcriber"
import { WhisperCppTranscriber } from "@/features/transcription/whisper-cpp"

const fakeWhisper = path.resolve(
  import.meta.dirname,
  "../utils/fake-whisper.mjs"
)

let dir: string
let audioPath: string
let model: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "transcriber-"))
  audioPath = path.join(dir, "audio.wav")
  model = path.join(dir, "model.bin")
  await writeFile(audioPath, "")
  await writeFile(model, "")
})
afterAll(() => rm(dir, { recursive: true, force: true }))

describe.each<[string, () => Transcriber]>([
  ["fake", () => new FakeTranscriber()],
  [
    "whisper.cpp",
    () => new WhisperCppTranscriber({ binary: fakeWhisper, model, threads: 2 }),
  ],
])("%s transcriber contract", (_, create) => {
  it("returns ordered tokens inside the audio with a language and progress", async () => {
    const progress: number[] = []
    const result = await create().transcribe({
      audioPath,
      durationMs: 20_000,
      onProgress: (p) => progress.push(p),
    })
    expect(result.language).toMatch(/^[a-z]{2}$/)
    expect(result.tokens.length).toBeGreaterThan(0)
    for (const token of result.tokens) {
      expect(token.text.trim()).not.toBe("")
      expect(token.startMs).toBeGreaterThanOrEqual(0)
      expect(token.endMs).toBeGreaterThanOrEqual(token.startMs)
      expect(token.endMs).toBeLessThanOrEqual(20_000)
    }
    expect(progress.at(-1)).toBe(100)
  })

  it("stops when aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      create().transcribe({
        audioPath,
        durationMs: 20_000,
        signal: controller.signal,
      })
    ).rejects.toThrow()
  })
})

describe("whisper.cpp adapter", () => {
  it("surfaces a failing binary as an external error", async () => {
    process.env.FAKE_WHISPER_FAIL = "1"
    try {
      await expect(
        new WhisperCppTranscriber({
          binary: fakeWhisper,
          model,
          threads: 1,
        }).transcribe({
          audioPath,
          durationMs: 1000,
        })
      ).rejects.toMatchObject({
        code: "EXTERNAL",
        message: /exited with code 3/,
      })
    } finally {
      delete process.env.FAKE_WHISPER_FAIL
    }
  })

  it("decodes each window without the previous text and with a stricter repetition check", async () => {
    const argsPath = path.join(dir, "args.json")
    process.env.FAKE_WHISPER_ARGS = argsPath
    try {
      await new WhisperCppTranscriber({
        binary: fakeWhisper,
        model,
        threads: 1,
      }).transcribe({ audioPath, durationMs: 1000 })
    } finally {
      delete process.env.FAKE_WHISPER_ARGS
    }
    const args = JSON.parse(await readFile(argsPath, "utf8")) as string[]
    expect(args[args.indexOf("-mc") + 1]).toBe("0")
    expect(args[args.indexOf("-et") + 1]).toBe("2.8")
  })

  it.each([
    [
      "binary",
      { binary: "/nope/whisper-cli", model: () => model },
      /was not found/,
    ],
    [
      "model",
      { binary: fakeWhisper, model: () => "/nope/model.bin" },
      /model not found/,
    ],
  ])(
    "reports a missing %s as a dependency error",
    async (_, options, message) => {
      await expect(
        new WhisperCppTranscriber({
          binary: options.binary,
          model: options.model(),
          threads: 1,
        }).transcribe({ audioPath, durationMs: 1000 })
      ).rejects.toMatchObject({ code: "DEPENDENCY_MISSING", message })
    }
  )
})
