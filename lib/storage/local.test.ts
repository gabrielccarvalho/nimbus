import { mkdtempSync, rmSync } from "node:fs"
import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LocalStorage } from "./local"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, rename: vi.fn(actual.rename) }
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "nimbus-local-"))
})
afterEach(() => {
  vi.mocked(fs.rename).mockClear()
  rmSync(dir, { recursive: true, force: true })
})

describe("LocalStorage.putFile", () => {
  it("copies across filesystems when rename fails with EXDEV", async () => {
    const storage = new LocalStorage(path.join(dir, "data"))
    const file = path.join(dir, "out.mp4")
    await fs.writeFile(file, "rendered")
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("cross-device link"), { code: "EXDEV" })
    )

    const { bytes } = await storage.putFile(file, "projects/p1/proxy.mp4")

    expect(bytes).toBe(8)
    expect(
      await fs.readFile(storage.path("projects/p1/proxy.mp4"), "utf8")
    ).toBe("rendered")
    await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await fs.readdir(storage.path("projects/p1"))).toEqual(["proxy.mp4"])
  })

  it("rethrows rename errors other than EXDEV", async () => {
    const storage = new LocalStorage(path.join(dir, "data"))
    const file = path.join(dir, "out.mp4")
    await fs.writeFile(file, "rendered")
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "EACCES" })
    )

    await expect(
      storage.putFile(file, "projects/p1/proxy.mp4")
    ).rejects.toThrow("denied")
    expect(await fs.readFile(file, "utf8")).toBe("rendered")
  })
})
