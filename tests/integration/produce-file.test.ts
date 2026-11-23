import { readFile, writeFile } from "node:fs/promises"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { produceFile } from "@/features/pipeline/steps/common"
import { getStorage, storageKeys } from "@/lib/storage"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("produceFile", () => {
  it("gives overlapping attempts separate files and keeps a complete one", async () => {
    const key = storageKeys.proxy("p1")
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const files: string[] = []

    const slow = produceFile("p1", key, async (file) => {
      files.push(file)
      await writeFile(file, "first")
      await gate
    })
    const fast = produceFile("p1", key, async (file) => {
      files.push(file)
      await writeFile(file, "second")
    })
    await fast
    release()
    await slow

    expect(new Set(files).size).toBe(2)
    expect(files).not.toContain(getStorage().resolve(key))
    expect(await readFile(getStorage().resolve(key), "utf8")).toBe("first")
    expect(await getStorage().list(storageKeys.work("p1", ""))).toEqual([])
  })

  it("leaves the target alone and cleans up when production fails", async () => {
    const key = storageKeys.audio("p1")
    await getStorage().writeBuffer(key, "good")

    await expect(
      produceFile("p1", key, async (file) => {
        await writeFile(file, "partial")
        throw new Error("ffmpeg died")
      })
    ).rejects.toThrow("ffmpeg died")

    expect(await readFile(getStorage().resolve(key), "utf8")).toBe("good")
    expect(await getStorage().list(storageKeys.work("p1", ""))).toEqual([])
  })
})
