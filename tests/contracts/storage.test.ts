import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { text } from "node:stream/consumers"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AppError } from "@/lib/errors"
import { LocalStorage } from "@/lib/storage/local"
import type { StorageAdapter } from "@/lib/storage/types"

type Factory = () => { storage: StorageAdapter; cleanup: () => void }

export function storageContract(name: string, factory: Factory) {
  describe(`StorageAdapter contract: ${name}`, () => {
    let storage: StorageAdapter
    let cleanup: () => void

    beforeEach(() => {
      ;({ storage, cleanup } = factory())
    })
    afterEach(() => cleanup())

    it("writes a stream atomically and reads it back", async () => {
      const { bytes } = await storage.write(
        "a/b/file.txt",
        Readable.from(["hello ", "world"])
      )
      expect(bytes).toBe(11)
      expect(await text(storage.read("a/b/file.txt"))).toBe("hello world")
      expect(await storage.list("a")).toEqual(["a/b/file.txt"])
    })

    it("reads byte ranges inclusively", async () => {
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

    it("cleans up when the source stream errors", async () => {
      const failing = new Readable({
        read() {
          this.push("partial")
          this.destroy(new Error("client went away"))
        },
      })
      await expect(storage.write("x.bin", failing)).rejects.toThrow()
      expect(await storage.list(".")).toEqual([])
    })

    it("moves, stats, removes and reports usage", async () => {
      await storage.writeBuffer("tmp/one.bin", Buffer.alloc(5))
      await storage.move("tmp/one.bin", "final/one.bin")
      expect(await storage.stat("tmp/one.bin")).toBeNull()
      expect((await storage.stat("final/one.bin"))?.bytes).toBe(5)
      await storage.writeBuffer("final/two.bin", Buffer.alloc(7))
      expect(await storage.usage()).toEqual({ bytes: 12, files: 2 })
      await storage.remove("final/one.bin")
      await storage.removePrefix("final")
      expect(await storage.usage()).toEqual({ bytes: 0, files: 0 })
    })

    it.each(["../escape.txt", "a/../../escape", "/etc/passwd", "a\\b", ""])(
      "rejects unsafe key %j",
      (key) => {
        expect(() => storage.resolve(key)).toThrow(AppError)
      }
    )
  })
}

storageContract("LocalStorage", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "storage-contract-"))
  return {
    storage: new LocalStorage(dir),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
})
