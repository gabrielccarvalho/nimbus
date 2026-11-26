import { randomUUID } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"

import { S3Client } from "@aws-sdk/client-s3"
import { afterAll, describe, expect, it } from "vitest"

import { S3Storage } from "@/lib/storage/s3"

import { storageContract } from "./storage"

const endpoint = process.env.S3_TEST_ENDPOINT ?? "http://localhost:9010"
const bucket = process.env.S3_TEST_BUCKET ?? "nimbus"
const run = `nimbus-test/${randomUUID()}`

const client = new S3Client({
  endpoint,
  region: "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "nimbus",
    secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "nimbus-secret",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
})

const reachable = await fetch(`${endpoint}/minio/health/live`, {
  signal: AbortSignal.timeout(2000),
})
  .then((response) => response.ok)
  .catch(() => false)

let gets = 0
client.middlewareStack.add(
  (next, context) => (args) => {
    if (context.commandName === "GetObjectCommand") gets++
    return next(args)
  },
  { step: "initialize" }
)

const tmp = await mkdtemp(path.join(os.tmpdir(), "storage-s3-"))

function make(
  options: {
    maxCopyBytes?: number
    cacheBytes?: number
    cacheDir?: string
    bucket?: string
  } = {}
) {
  return new S3Storage({
    client,
    bucket,
    prefix: `${run}/${randomUUID()}`,
    cache: {
      dir: options.cacheDir ?? path.join(tmp, randomUUID(), "cache"),
      maxBytes: options.cacheBytes ?? 1024 ** 3,
    },
    ...options,
  })
}

function scratchDir() {
  return mkdtemp(path.join(tmp, "scratch-"))
}

describe.skipIf(!reachable)("S3Storage", () => {
  afterAll(async () => {
    await new S3Storage({
      client,
      bucket,
      prefix: run,
      cache: { dir: path.join(tmp, "cache"), maxBytes: 1 },
    }).removePrefix(".")
    await rm(tmp, { recursive: true, force: true })
  })

  storageContract("S3Storage", async () => {
    const storage = make()
    const scratch = await mkdtemp(path.join(os.tmpdir(), "storage-s3-"))
    return {
      storage,
      scratch,
      cleanup: async () => {
        await storage.removePrefix(".")
        await rm(scratch, { recursive: true, force: true })
      },
    }
  })

  it("upload target accepts a PUT of the signed size", async () => {
    const storage = make()
    const body = Buffer.from("signed body")
    const target = await storage.uploadTarget("up/ok.bin", {
      bytes: body.length,
      contentType: "video/mp4",
    })
    if (!target.url) throw new Error("expected a signed target")
    const response = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body,
    })
    expect(response.status).toBe(200)
    expect((await storage.stat("up/ok.bin"))?.bytes).toBe(body.length)
  })

  it("upload target rejects a larger body", async () => {
    const storage = make()
    const target = await storage.uploadTarget("up/big.bin", {
      bytes: 4,
      contentType: "video/mp4",
    })
    if (!target.url) throw new Error("expected a signed target")
    const response = await fetch(target.url, {
      method: target.method,
      headers: target.headers,
      body: Buffer.from("more than four"),
    })
    expect(response.ok).toBe(false)
    expect(await storage.stat("up/big.bin")).toBeNull()
  })

  it("signed GET honours Range", async () => {
    const storage = make()
    await storage.writeBuffer("g/r.txt", "0123456789")
    const url = await storage.readUrl("g/r.txt")
    if (!url) throw new Error("expected a signed URL")
    const response = await fetch(url, { headers: { Range: "bytes=2-5" } })
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10")
    expect(await response.text()).toBe("2345")
  })

  it("signed GET sets the download name", async () => {
    const storage = make()
    await storage.writeBuffer("g/clip.mp4", "x")
    const url = await storage.readUrl("g/clip.mp4", { download: "My clip.mp4" })
    const response = await fetch(url!)
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''My%20clip.mp4"
    )
  })

  it("localCopy reuses a cached download across scratch dirs", async () => {
    const storage = make()
    await storage.writeBuffer("c/a.txt", "cached")
    const before = gets
    const first = await storage.localCopy("c/a.txt", await scratchDir())
    const second = await storage.localCopy("c/a.txt", await scratchDir())
    expect(gets - before).toBe(1)
    expect(second).not.toBe(first)
    expect(await readFile(second, "utf8")).toBe("cached")
    expect(storage.localCopyCost(100)).toBe(100)
    await storage.removePrefix(".")
  })

  it("localCopy refetches when the object changes", async () => {
    const storage = make()
    await storage.writeBuffer("c/a.txt", "first")
    const first = await storage.localCopy("c/a.txt", await scratchDir())
    await storage.writeBuffer("c/a.txt", "other")
    const scratch = await scratchDir()
    const second = await storage.localCopy("c/a.txt", scratch)
    expect(await readFile(second, "utf8")).toBe("other")
    expect(await readFile(first, "utf8")).toBe("first")
    await storage.writeBuffer("c/a.txt", "third")
    const third = await storage.localCopy("c/a.txt", scratch)
    expect(await readFile(third, "utf8")).toBe("third")
    await storage.removePrefix(".")
  })

  it("concurrent localCopy calls share one download", async () => {
    const storage = make()
    await storage.writeBuffer("c/big.bin", Buffer.alloc(8 * 1024 ** 2, 3))
    const before = gets
    const files = await Promise.all(
      [1, 2, 3].map(async () =>
        storage.localCopy("c/big.bin", await scratchDir())
      )
    )
    expect(gets - before).toBe(1)
    for (const file of files) {
      expect((await readFile(file)).length).toBe(8 * 1024 ** 2)
    }
    await storage.removePrefix(".")
  })

  it("cache evicts the least recently used entry to fit the budget", async () => {
    const storage = make({ cacheBytes: 10 })
    for (const name of ["a", "b", "c"]) {
      await storage.writeBuffer(`e/${name}.txt`, "1234")
    }
    const copy = async (name: string) => {
      const before = gets
      const file = await storage.localCopy(`e/${name}.txt`, await scratchDir())
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { file, fetched: gets - before }
    }
    expect((await copy("a")).fetched).toBe(1)
    expect((await copy("b")).fetched).toBe(1)
    expect((await copy("a")).fetched).toBe(0)
    const c = await copy("c")
    expect(c.fetched).toBe(1)
    expect(await readFile(c.file, "utf8")).toBe("1234")
    expect((await copy("a")).fetched).toBe(0)
    expect((await copy("b")).fetched).toBe(1)
    await storage.removePrefix(".")
  })

  it("localCopy of a .part key is evicted like any other entry", async () => {
    const cacheDir = path.join(tmp, randomUUID(), "cache")
    const storage = make({ cacheBytes: 6, cacheDir })
    await storage.writeBuffer("tmp/uploads/one.part", "1234")
    await storage.writeBuffer("e/two.txt", "5678")
    await storage.localCopy("tmp/uploads/one.part", await scratchDir())
    await new Promise((resolve) => setTimeout(resolve, 20))
    await storage.localCopy("e/two.txt", await scratchDir())
    const names = await readdir(cacheDir)
    expect(names.filter((name) => name !== ".tmp")).toEqual([
      expect.stringMatching(/\.txt$/),
    ])
    await storage.removePrefix(".")
  })

  it("stale temp downloads are removed", async () => {
    const cacheDir = path.join(tmp, randomUUID(), "cache")
    const storage = make({ cacheDir })
    const temps = path.join(cacheDir, ".tmp")
    await mkdir(temps, { recursive: true })
    const stale = new Date(Date.now() - 7 * 60 * 60_000)
    await writeFile(path.join(temps, "stale"), "x")
    await utimes(path.join(temps, "stale"), stale, stale)
    await writeFile(path.join(temps, "live"), "x")
    await storage.writeBuffer("e/a.txt", "a")
    await storage.localCopy("e/a.txt", await scratchDir())
    expect(await readdir(temps)).toEqual(["live"])
    await storage.removePrefix(".")
  })

  it("stat on a missing bucket throws", async () => {
    const storage = make({ bucket: `missing-${randomUUID()}` })
    await expect(storage.stat("a.txt")).rejects.toMatchObject({
      code: "STORAGE",
    })
    await expect(
      storage.localCopy("a.txt", await scratchDir())
    ).rejects.toMatchObject({ code: "STORAGE" })
  })

  it("removePrefix deletes more than one page of keys", async () => {
    const storage = make()
    await Promise.all(
      Array.from({ length: 1005 }, (_, i) =>
        storage.writeBuffer(`many/${String(i).padStart(4, "0")}.txt`, "x")
      )
    )
    expect(await storage.list("many")).toHaveLength(1005)
    expect(await storage.usage("many")).toEqual({ bytes: 1005, files: 1005 })
    await storage.removePrefix("many")
    expect(await storage.list(".")).toEqual([])
  })

  it("move copies in parts above maxCopyBytes", async () => {
    const storage = make({ maxCopyBytes: 6 * 1024 ** 2 })
    const size = 15 * 1024 ** 2
    const data = Buffer.alloc(size)
    for (let i = 0; i < size; i += 4096) data[i] = i % 251
    await storage.writeBuffer("m/src.bin", data)
    await storage.move("m/src.bin", "m/dst.bin")
    expect(await storage.stat("m/src.bin")).toBeNull()
    const copied = Buffer.concat(await storage.read("m/dst.bin").toArray())
    expect(copied.equals(data)).toBe(true)
    await storage.removePrefix(".")
  })

  it.skipIf(process.env.S3_TEST_LARGE !== "1")(
    "move copies objects over 5 GB",
    { timeout: 3_600_000 },
    async () => {
      const storage = make()
      const size = 5 * 1024 ** 3 + 1024 ** 2
      const chunk = Buffer.alloc(16 * 1024 ** 2, 1)
      async function* body() {
        for (let sent = 0; sent < size; sent += chunk.length) {
          yield chunk.subarray(0, Math.min(chunk.length, size - sent))
        }
      }
      try {
        await storage.write("l/src.bin", Readable.from(body()))
        await storage.move("l/src.bin", "l/dst.bin")
        expect(await storage.stat("l/src.bin")).toBeNull()
        expect((await storage.stat("l/dst.bin"))?.bytes).toBe(size)
      } finally {
        await storage.removePrefix(".")
      }
    }
  )
})
