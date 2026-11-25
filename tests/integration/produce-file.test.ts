import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { produceFile } from "@/features/pipeline/steps/common"
import { getEnv } from "@/lib/env"
import { getStorage, storageKeys } from "@/lib/storage"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

async function scratch(name: string) {
  const dir = path.join(getEnv().SCRATCH_DIR, name)
  await mkdir(dir, { recursive: true })
  return dir
}

const contents = (key: string) => readFile(path.join(env.dataDir, key), "utf8")

describe("produceFile", () => {
  it("gives overlapping attempts separate files and keeps a complete one", async () => {
    const key = storageKeys.proxy("p1")
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const files: string[] = []

    const slow = produceFile(await scratch("job-1"), key, async (file) => {
      files.push(file)
      await writeFile(file, "first")
      await gate
    })
    const fast = produceFile(await scratch("job-2"), key, async (file) => {
      files.push(file)
      await writeFile(file, "second")
    })
    await fast
    release()
    await slow

    expect(new Set(files).size).toBe(2)
    expect(await contents(key)).toBe("first")
  })

  it("leaves the target alone when production fails", async () => {
    const key = storageKeys.audio("p1")
    await getStorage().writeBuffer(key, "good")

    await expect(
      produceFile(await scratch("job-1"), key, async (file) => {
        await writeFile(file, "partial")
        throw new Error("ffmpeg died")
      })
    ).rejects.toThrow("ffmpeg died")

    expect(await contents(key)).toBe("good")
  })

  it("produceFile leaves no object when produce throws", async () => {
    const key = storageKeys.proxy("p1")

    await expect(
      produceFile(await scratch("job-1"), key, async (file) => {
        await writeFile(file, "partial")
        throw new Error("ffmpeg died")
      })
    ).rejects.toThrow("ffmpeg died")

    expect(await getStorage().stat(key)).toBeNull()
    expect(await getStorage().list(storageKeys.projectPrefix("p1"))).toEqual([])
  })

  it("produceFile leaves nothing in scratch after success", async () => {
    const key = storageKeys.thumbnail("p1")
    const dir = await scratch("job-1")

    await produceFile(dir, key, (file) => writeFile(file, "jpeg"))

    expect(await contents(key)).toBe("jpeg")
    expect(await readdir(dir)).toEqual([])
  })
})
