import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetEnvCache } from "@/lib/env"

import { removeStaleScratch, withScratch } from "./scratch"

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

describe("removeStaleScratch", () => {
  it("removes entries older than the cutoff but keeps the cache", async () => {
    const now = Date.now()
    const old = new Date(now - 2 * 60 * 60_000)
    for (const name of ["crashed-1", "cache", "fresh-1"]) {
      await mkdir(path.join(root, name), { recursive: true })
    }
    await writeFile(path.join(root, "ytdlp-cookies.txt"), "cookies")
    await utimes(path.join(root, "crashed-1"), old, old)
    await utimes(path.join(root, "cache"), old, old)
    await utimes(path.join(root, "ytdlp-cookies.txt"), old, old)

    await removeStaleScratch(60 * 60_000, now)

    expect((await readdir(root)).sort()).toEqual(["cache", "fresh-1"])
  })

  it("does nothing when the scratch directory doesn't exist", async () => {
    await expect(removeStaleScratch(1, Date.now())).resolves.toBe(0)
  })
})
