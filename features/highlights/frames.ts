import "server-only"

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { runFfmpeg } from "../render/ffmpeg-runner"
import type { FrameSource } from "./types"

export function proxyFrameSource(file: string): FrameSource {
  return async (atMs, signal) => {
    const dir = await mkdtemp(path.join(tmpdir(), "nimbus-frames-"))
    try {
      const inputs = atMs.flatMap((ms) => [
        "-ss",
        (ms / 1000).toFixed(3),
        "-i",
        file,
      ])
      const outputs = atMs.flatMap((_, i) => [
        "-map",
        `${i}:v:0`,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        path.join(dir, `${i}.jpg`),
      ])
      await runFfmpeg([...inputs, ...outputs], {
        signal,
        timeoutMs: 60_000,
      })
      return await Promise.all(
        atMs.map(async (_, i) =>
          (await readFile(path.join(dir, `${i}.jpg`))).toString("base64")
        )
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
