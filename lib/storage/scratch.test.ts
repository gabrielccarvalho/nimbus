import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetEnvCache } from "@/lib/env"

import { withScratch } from "./scratch"

let root: string

beforeEach(() => {
  root = path.join(mkdtempSync(path.join(os.tmpdir(), "nimbus-scratch-")), "s")
  vi.stubEnv("SCRATCH_DIR", root)
  resetEnvCache()
})
afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
  rmSync(path.dirname(root), { recursive: true, force: true })
})

describe("withScratch", () => {
  it("withScratch removes the directory after success", async () => {
    let seen = ""
    const result = await withScratch("job-1", async (dir) => {
      seen = dir
      await writeFile(path.join(dir, "graph.txt"), "graph")
      return 42
    })

    expect(result).toBe(42)
    expect(seen).toBe(path.join(root, "job-1"))
    expect(existsSync(seen)).toBe(false)
  })

  it("withScratch removes the directory after a throw", async () => {
    let seen = ""
    await expect(
      withScratch("job-2", async (dir) => {
        seen = dir
        await writeFile(path.join(dir, "out.mp4"), "partial")
        throw new Error("ffmpeg died")
      })
    ).rejects.toThrow("ffmpeg died")

    expect(existsSync(seen)).toBe(false)
  })
})
