import { writeFile, readFile, stat as statFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { text } from "node:stream/consumers"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AppError } from "@/lib/errors"
import type { StorageAdapter } from "@/lib/storage/types"

type Factory = () => Promise<{
  storage: StorageAdapter
  scratch: string
  cleanup(): Promise<void>
}>

export function storageContract(name: string, make: Factory) {
  describe(`StorageAdapter contract: ${name}`, () => {
    let storage: StorageAdapter
    let scratch: string
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      ;({ storage, scratch, cleanup } = await make())
    })
    afterEach(() => cleanup())

    it("write then read round-trips", async () => {
      const { bytes } = await storage.write(
        "a/b/file.txt",
        Readable.from(["hello ", "world"])
      )
      expect(bytes).toBe(11)
      expect(await text(storage.read("a/b/file.txt"))).toBe("hello world")
    })

    it("read honours a byte range", async () => {
      await storage.writeBuffer("r.txt", "0123456789")
      expect(await text(storage.read("r.txt", { start: 2, end: 5 }))).toBe(
        "2345"
      )
    })

    it("enforces maxBytes and leaves nothing behind", async () => {
      await expect(
        storage.write("big.bin", Readable.from([Buffer.alloc(64)]), {
          maxBytes: 10,
        })
      ).rejects.toMatchObject({ code: "TOO_LARGE" })
      expect(await storage.stat("big.bin")).toBeNull()
      expect(await storage.list(".")).toEqual([])
    })

    it("stat is null for a missing key", async () => {
      expect(await storage.stat("nope/missing.bin")).toBeNull()
    })

    it("list returns keys under a prefix sorted", async () => {
      await storage.writeBuffer("p/b.txt", "b")
      await storage.writeBuffer("p/a.txt", "a")
      await storage.writeBuffer("p/sub/c.txt", "c")
      await storage.writeBuffer("other/d.txt", "d")
      expect(await storage.list("p")).toEqual([
        "p/a.txt",
        "p/b.txt",
        "p/sub/c.txt",
      ])
    })

    it("removePrefix removes everything under it", async () => {
      await storage.writeBuffer("p/a.txt", "a")
      await storage.writeBuffer("p/sub/b.txt", "b")
      await storage.writeBuffer("keep/c.txt", "c")
      await storage.removePrefix("p")
      expect(await storage.list(".")).toEqual(["keep/c.txt"])
    })

    it("listWithInfo returns sizes and modification times", async () => {
      const before = Date.now() - 60_000
      await storage.writeBuffer("i/b.bin", Buffer.alloc(9))
      await storage.writeBuffer("i/a.bin", Buffer.alloc(5))
      await storage.writeBuffer("other/c.bin", Buffer.alloc(1))
      const entries = await storage.listWithInfo("i")
      expect(entries).toEqual([
        { key: "i/a.bin", bytes: 5, mtimeMs: expect.any(Number) },
        { key: "i/b.bin", bytes: 9, mtimeMs: expect.any(Number) },
      ])
      for (const { key, mtimeMs } of entries) {
        expect(mtimeMs).toBeGreaterThan(before)
        const info = await storage.stat(key)
        expect(Math.abs(mtimeMs - info!.mtimeMs)).toBeLessThan(1000)
      }
    })

    it("aborting stale uploads is safe with none in flight", async () => {
      expect(await storage.abortStaleUploads(new Date())).toBe(0)
    })

    it("localCopy returns a readable file with the same bytes", async () => {
      await storage.writeBuffer("c/file.txt", "copy me")
      const local = await storage.localCopy("c/file.txt", scratch)
      expect(await readFile(local, "utf8")).toBe("copy me")
    })

    it("localCopy rejects a missing key", async () => {
      await expect(
        storage.localCopy("c/missing.txt", scratch)
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
    })

    it("putFile stores the file and removes the source", async () => {
      const source = path.join(scratch, "source.bin")
      await writeFile(source, Buffer.alloc(1234, 7))
      expect(await storage.putFile(source, "out/put.bin")).toEqual({
        bytes: 1234,
      })
      expect((await storage.stat("out/put.bin"))?.bytes).toBe(1234)
      await expect(statFile(source)).rejects.toMatchObject({ code: "ENOENT" })
    })

    it("putFile is atomic", async () => {
      const size = 20 * 1024 * 1024
      const source = path.join(scratch, "big.bin")
      await writeFile(source, Buffer.alloc(size, 1))
      let done = false
      const put = storage.putFile(source, "out/big.bin").finally(() => {
        done = true
      })
      const seen: Array<number | null> = []
      while (!done) {
        seen.push((await storage.stat("out/big.bin"))?.bytes ?? null)
        await new Promise((resolve) => setImmediate(resolve))
      }
      await put
      seen.push((await storage.stat("out/big.bin"))?.bytes ?? null)
      for (const value of seen) expect([null, size]).toContain(value)
      expect(seen.at(-1)).toBe(size)
    })

    it("usage sums bytes", async () => {
      await storage.writeBuffer("u/one.bin", Buffer.alloc(5))
      await storage.writeBuffer("u/two.bin", Buffer.alloc(7))
      expect(await storage.usage()).toEqual({ bytes: 12, files: 2 })
      await storage.remove("u/one.bin")
      expect(await storage.usage("u")).toEqual({ bytes: 7, files: 1 })
    })

    it.each(["../escape.txt", "a/../../escape", "/etc/passwd", "a\\b", ""])(
      "rejects unsafe key %j",
      async (key) => {
        await expect(storage.stat(key)).rejects.toBeInstanceOf(AppError)
      }
    )
  })
}
