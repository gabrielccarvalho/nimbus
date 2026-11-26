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

import { S3Client } from "@aws-sdk/client-s3"
import { afterAll, describe, expect, it } from "vitest"

import { sweep } from "@/features/pipeline/steps/sweep"
import { accountRepository } from "@/features/accounts/repository"
import { projectRepository } from "@/features/projects/repository"
import {
  completeUpload,
  signUploadParts,
  startUpload,
} from "@/features/uploads/service"
import { verifyUploadToken } from "@/features/uploads/token"
import { user } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import { storageKeys } from "@/lib/storage"
import { LocalStorage } from "@/lib/storage/local"
import { pushStorage } from "@/lib/storage/push"
import { S3Storage } from "@/lib/storage/s3"

import { createTestEnv, testDb } from "../utils/test-env"
import { storageContract } from "./storage"

const endpoint = process.env.S3_TEST_ENDPOINT ?? "http://localhost:9010"
const bucket = process.env.S3_TEST_BUCKET ?? "nimbus"
const run = `nimbus-test/${randomUUID()}`

const clientFor = (url: string) =>
  new S3Client({
    endpoint: url,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? "nimbus",
      secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? "nimbus-secret",
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
const client = clientFor(endpoint)

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
    uploadPartBytes?: number
    cacheBytes?: number
    cacheDir?: string
    bucket?: string
    signer?: S3Client
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

const PART = 5 * 1024 ** 2

function pattern(size: number) {
  const data = Buffer.alloc(size)
  for (let i = 0; i < size; i += 4096) data[i] = i % 251
  return data
}

async function putParts(
  storage: S3Storage,
  key: string,
  target: { uploadId: string; partSize: number; partCount: number },
  data: Buffer
) {
  const numbers = Array.from({ length: target.partCount }, (_, i) => i + 1)
  const urls = await storage.signUploadParts(
    key,
    { ...target, bytes: data.length },
    numbers
  )
  return Promise.all(
    urls.map(async ({ partNumber, url }) => {
      const start = (partNumber - 1) * target.partSize
      const response = await fetch(url, {
        method: "PUT",
        body: new Uint8Array(data.subarray(start, start + target.partSize)),
      })
      expect(response.status).toBe(200)
      return { partNumber, etag: response.headers.get("etag")! }
    })
  )
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

  it("multipart upload of several parts completes and the object has the full size", async () => {
    const storage = make({ uploadPartBytes: PART })
    const data = pattern(2 * PART + 17)
    const target = await storage.uploadTarget("up/multi.bin", {
      bytes: data.length,
      contentType: "video/mp4",
    })
    expect(target).toMatchObject({
      kind: "multipart",
      partSize: PART,
      partCount: 3,
    })
    if (target?.kind !== "multipart") throw new Error("expected multipart")
    const parts = await putParts(storage, "up/multi.bin", target, data)
    await storage.completeUpload("up/multi.bin", target.uploadId, parts)
    expect((await storage.stat("up/multi.bin"))?.bytes).toBe(data.length)
    const stored = Buffer.concat(await storage.read("up/multi.bin").toArray())
    expect(stored.equals(data)).toBe(true)
  })

  it("part size grows to keep a 20 GiB upload within 10,000 parts", async () => {
    const storage = make()
    const target = await storage.uploadTarget("up/huge.bin", {
      bytes: 20 * 1024 ** 3,
      contentType: "video/mp4",
    })
    expect(target).toMatchObject({ partSize: 64 * 1024 ** 2, partCount: 320 })
    if (target?.kind !== "multipart") throw new Error("expected multipart")
    await storage.abortUpload("up/huge.bin", target.uploadId)
    const bigger = await storage.uploadTarget("up/huger.bin", {
      bytes: 10_001 * 64 * 1024 ** 2,
      contentType: "video/mp4",
    })
    if (bigger?.kind !== "multipart") throw new Error("expected multipart")
    expect(bigger.partCount).toBeLessThanOrEqual(10_000)
    await storage.abortUpload("up/huger.bin", bigger.uploadId)
  })

  it("sweep removes stale upload temps from S3", async () => {
    const storage = make()
    await storage.writeBuffer(storageKeys.uploadTemp("abandoned"), "x")
    await sweep(
      {
        db: await testDb(),
        logger,
        signal: new AbortController().signal,
        reportProgress: () => {},
      },
      storage,
      Date.now() + 25 * 60 * 60_000
    )
    expect(await storage.list("tmp/uploads")).toEqual([])
  })

  it("a part URL rejects a body of the wrong size", async () => {
    const storage = make({ uploadPartBytes: PART })
    const target = await storage.uploadTarget("up/big.bin", {
      bytes: PART + 4,
      contentType: "video/mp4",
    })
    if (target?.kind !== "multipart") throw new Error("expected multipart")
    const [last] = await storage.signUploadParts(
      "up/big.bin",
      { uploadId: target.uploadId, bytes: PART + 4, partSize: PART },
      [2]
    )
    const response = await fetch(last!.url, {
      method: "PUT",
      body: Buffer.from("more than four"),
    })
    expect(response.ok).toBe(false)
    await storage.abortUpload("up/big.bin", target.uploadId)
  })

  it("sweep aborts stale multipart uploads", async () => {
    const storage = make({ uploadPartBytes: PART })
    const target = await storage.uploadTarget("up/stale.bin", {
      bytes: 10,
      contentType: "video/mp4",
    })
    if (target?.kind !== "multipart") throw new Error("expected multipart")
    const putPart = async () => {
      const [part] = await storage.signUploadParts(
        "up/stale.bin",
        { ...target, bytes: 10 },
        [1]
      )
      return fetch(part!.url, { method: "PUT", body: "0123456789" })
    }
    const sweepAt = async (nowMs: number) =>
      sweep(
        {
          db: await testDb(),
          logger,
          signal: new AbortController().signal,
          reportProgress: () => {},
        },
        storage,
        nowMs
      )

    await sweepAt(Date.now())
    expect((await putPart()).status).toBe(200)

    await sweepAt(Date.now() + 25 * 60 * 60_000)
    expect((await putPart()).status).toBe(404)
    expect(await storage.abortStaleUploads(new Date(Date.now() + 60_000))).toBe(
      0
    )
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

  it("a signed URL uses the public host", async () => {
    const storage = make({
      signer: clientFor("http://media.example.test:9010"),
    })
    const read = await storage.readUrl("g/public.txt")
    const target = await storage.uploadTarget("up/public.bin", {
      bytes: 1,
      contentType: "application/octet-stream",
    })
    if (target?.kind !== "multipart") throw new Error("expected multipart")
    const [part] = await storage.signUploadParts(
      "up/public.bin",
      { uploadId: target.uploadId, bytes: 1, partSize: target.partSize },
      [1]
    )
    expect(new URL(read!).host).toBe("media.example.test:9010")
    expect(new URL(part!.url).host).toBe("media.example.test:9010")
    await storage.abortUpload("up/public.bin", target.uploadId)
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

  it("storage push copies new files and skips matching ones", async () => {
    const root = await mkdtemp(path.join(tmp, "data-"))
    const local = new LocalStorage(root)
    await local.writeBuffer("projects/p/source.mp4", "source")
    await local.writeBuffer("projects/p/audio.wav", "audio")
    await local.writeBuffer("avatars/users/u/1.png", "avatar")
    await local.writeBuffer(storageKeys.uploadTemp("pending"), "partial")
    await writeFile(path.join(root, "app.db"), "sqlite")
    const storage = make()
    await storage.writeBuffer("projects/p/audio.wav", "AUDIO")
    await storage.writeBuffer("avatars/users/u/1.png", "stale")

    const first = await pushStorage(local, storage)
    expect(first).toEqual({ copied: 2, skipped: 1, failed: [] })
    expect(await storage.list(".")).toEqual([
      "avatars/users/u/1.png",
      "projects/p/audio.wav",
      "projects/p/source.mp4",
    ])
    const avatar = await storage.read("avatars/users/u/1.png").toArray()
    expect(Buffer.concat(avatar).toString()).toBe("avatar")

    const second = await pushStorage(local, storage)
    expect(second).toEqual({ copied: 0, skipped: 3, failed: [] })
    await storage.removePrefix(".")
  })

  describe("direct uploads", () => {
    const actor = { userId: randomUUID(), workspaceId: "" }
    const mp4Head = Buffer.from("\0\0\0\x18ftypmp42", "latin1")

    async function uploadVideo(data: Buffer) {
      const { token, target } = await startUpload(
        {
          kind: "video",
          fileName: "stream.mp4",
          mime: "video/mp4",
          bytes: data.length,
        },
        actor
      )
      if (target.kind !== "multipart") throw new Error("expected multipart")
      const signed = await signUploadParts(
        token,
        Array.from({ length: target.partCount }, (_, i) => i + 1),
        actor
      )
      const parts = await Promise.all(
        signed.map(async ({ partNumber, url }) => {
          const start = (partNumber - 1) * target.partSize
          const response = await fetch(url, {
            method: "PUT",
            body: new Uint8Array(data.subarray(start, start + target.partSize)),
          })
          expect(response.status).toBe(200)
          return { partNumber, etag: response.headers.get("etag")! }
        })
      )
      return { token, target, parts }
    }

    it("a multipart video upload lands at the source key and creates the project", async () => {
      const env = await createS3Env()
      try {
        const data = Buffer.concat([mp4Head, pattern(2 * 64 * 1024 ** 2 + 1)])
        const { token, target, parts } = await uploadVideo(data)
        expect(target.partCount).toBe(3)
        const { projectId } = (await completeUpload(token, parts, actor)) as {
          projectId: string
        }
        const project = await projectRepository(env.db).getOrThrow(projectId)
        expect(project.workspaceId).toBe(actor.workspaceId)
        const key = storageKeys.source(projectId, "mp4")
        expect((await env.storage.stat(key))?.bytes).toBe(data.length)
        await env.storage.removePrefix(storageKeys.projectPrefix(projectId))
      } finally {
        env.cleanup()
      }
    })

    it("completeUpload rejects when the sniffed format doesn't match the claim", async () => {
      const env = await createS3Env()
      try {
        const mkv = Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          Buffer.alloc(60),
        ])
        const { token, parts } = await uploadVideo(mkv)
        await expect(completeUpload(token, parts, actor)).rejects.toMatchObject(
          { code: "UNSUPPORTED_MEDIA" }
        )
        expect(await projectRepository(env.db).list()).toEqual([])
        expect(await env.storage.stat(verifyUploadToken(token).key)).toBeNull()
      } finally {
        env.cleanup()
      }
    })

    async function createS3Env() {
      const env = await createTestEnv({
        STORAGE_DRIVER: "s3",
        S3_ENDPOINT: endpoint,
        S3_BUCKET: bucket,
        S3_ACCESS_KEY_ID: process.env.S3_TEST_ACCESS_KEY_ID ?? "nimbus",
        S3_SECRET_ACCESS_KEY:
          process.env.S3_TEST_SECRET_ACCESS_KEY ?? "nimbus-secret",
        S3_FORCE_PATH_STYLE: "true",
      })
      const owner = { id: actor.userId, name: "Owner", email: "o@example.com" }
      await env.db.insert(user).values(owner)
      actor.workspaceId = (
        await accountRepository(env.db).createPersonalWorkspace(owner)
      ).id
      const { getStorage } = await import("@/lib/storage")
      return { ...env, storage: getStorage() }
    }
  })
})
