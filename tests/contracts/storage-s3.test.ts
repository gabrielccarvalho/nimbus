import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
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

function make(options: { maxCopyBytes?: number } = {}) {
  return new S3Storage({
    client,
    bucket,
    prefix: `${run}/${randomUUID()}`,
    ...options,
  })
}

describe.skipIf(!reachable)("S3Storage", () => {
  afterAll(() =>
    new S3Storage({ client, bucket, prefix: run }).removePrefix(".")
  )

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

  it("localCopy reuses an earlier copy in the same scratch", async () => {
    const storage = make()
    const scratch = await mkdtemp(path.join(os.tmpdir(), "storage-s3-"))
    try {
      await storage.writeBuffer("c/a.txt", "first")
      const first = await storage.localCopy("c/a.txt", scratch)
      await storage.writeBuffer("c/a.txt", "second")
      expect(await storage.localCopy("c/a.txt", scratch)).toBe(first)
      expect(storage.localCopyCost(100)).toBe(100)
    } finally {
      await rm(scratch, { recursive: true, force: true })
      await storage.removePrefix(".")
    }
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
