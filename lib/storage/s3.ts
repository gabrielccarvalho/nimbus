import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import {
  copyFile,
  link,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  utimes,
} from "node:fs/promises"
import path from "node:path"
import { PassThrough, Transform, type Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  paginateListObjectsV2,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { AppError } from "@/lib/errors"
import { mimeForKey } from "@/lib/http/range"

import { byteLimit, KEY_PATTERN } from "./common"
import type {
  ByteRange,
  StorageAdapter,
  StoredEntry,
  UploadedPart,
  UploadTarget,
} from "./types"

const PART_BYTES = 16 * 1024 ** 2
const UPLOAD_PART_BYTES = 64 * 1024 ** 2
const MAX_PARTS = 10_000
const READ_URL_SECONDS = 4 * 60 * 60
const UPLOAD_URL_SECONDS = 60 * 60
const STALE_DOWNLOAD_MS = 6 * 60 * 60_000

// HeadObject answers a bare 404 for a missing key and a missing bucket alike,
// which the SDK names NotFound; GetObject says NoSuchKey or NoSuchBucket.
function isMissing(error: unknown) {
  const { name } = error as { name?: string }
  return name === "NoSuchKey" || name === "NotFound"
}

function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex")
}

function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException).code
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}

function notFound(key: string) {
  return new AppError("NOT_FOUND", "Stored file not found", {
    details: { key },
  })
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client
  private readonly signer: S3Client
  private readonly bucket: string
  private readonly prefix: string
  private readonly uploadPartBytes: number
  private readonly cache: { dir: string; maxBytes: number }
  private readonly downloads = new Map<string, Promise<string>>()
  private bucketFound = false

  constructor(options: {
    client: S3Client
    signer?: S3Client
    bucket: string
    cache: { dir: string; maxBytes: number }
    prefix?: string
    uploadPartBytes?: number
  }) {
    this.client = options.client
    this.signer = options.signer ?? options.client
    this.bucket = options.bucket
    this.cache = options.cache
    this.prefix = options.prefix ? `${options.prefix}/` : ""
    this.uploadPartBytes = options.uploadPartBytes ?? UPLOAD_PART_BYTES
  }

  private objectKey(key: string) {
    if (
      !key ||
      !KEY_PATTERN.test(key) ||
      key.startsWith("/") ||
      key.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new AppError("STORAGE", "Invalid storage key", {
        details: { key },
      })
    }
    return this.prefix + key
  }

  private listPrefix(prefix: string) {
    return prefix === "." ? this.prefix : `${this.objectKey(prefix)}/`
  }

  private async *objects(prefix: string) {
    for await (const page of paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: this.listPrefix(prefix) }
    )) {
      yield page.Contents ?? []
    }
  }

  async write(
    key: string,
    body: Readable,
    options: { maxBytes?: number; transforms?: Transform[] } = {}
  ): Promise<{ bytes: number }> {
    const target = this.objectKey(key)
    let bytes = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(null, chunk)
      },
    })
    const stages: Array<NodeJS.ReadableStream | NodeJS.WritableStream> = [
      body,
      ...(options.transforms ?? []),
    ]
    if (options.maxBytes !== undefined) stages.push(byteLimit(options.maxBytes))
    const pass = new PassThrough()
    stages.push(counter, pass)
    // Upload aborts the multipart upload on any error and a single PUT only
    // starts once the whole body is read, so nothing partial becomes visible.
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: target,
        Body: pass,
        ContentType: mimeForKey(key),
      },
      partSize: PART_BYTES,
    })
    const [piped, uploaded] = await Promise.allSettled([
      pipeline(stages),
      upload.done().catch((error: unknown) => {
        pass.destroy(error as Error)
        throw error
      }),
    ])
    if (piped.status === "rejected") throw piped.reason
    if (uploaded.status === "rejected") throw uploaded.reason
    return { bytes }
  }

  async writeBuffer(key: string, data: Buffer | string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: data,
        ContentType: mimeForKey(key),
      })
    )
  }

  async stat(key: string) {
    const info = await this.head(key)
    return info && { bytes: info.bytes, mtimeMs: info.mtimeMs }
  }

  private async head(key: string) {
    try {
      const info = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
      )
      return {
        bytes: info.ContentLength ?? 0,
        mtimeMs: info.LastModified?.getTime() ?? 0,
        etag: info.ETag ?? "",
      }
    } catch (error) {
      if (!isMissing(error)) throw error
      await this.assertBucket()
      return null
    }
  }

  private async assertBucket() {
    if (this.bucketFound) return
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch (error) {
      if (!isMissing(error)) throw error
      throw new AppError("STORAGE", "The storage bucket doesn't exist", {
        details: { bucket: this.bucket },
        cause: error,
      })
    }
    this.bucketFound = true
  }

  read(key: string, range?: ByteRange): Readable {
    const out = new PassThrough()
    this.client
      .send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          Range: range ? `bytes=${range.start}-${range.end}` : undefined,
        })
      )
      .then(({ Body }) => pipeline(Body as Readable, out))
      .catch((error: unknown) => {
        out.destroy(isMissing(error) ? notFound(key) : (error as Error))
      })
    return out
  }

  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
    )
  }

  async removePrefix(prefix: string) {
    for await (const page of this.objects(prefix)) {
      if (page.length === 0) continue
      const { Errors } = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: page.map((object) => ({ Key: object.Key })),
            Quiet: true,
          },
        })
      )
      if (Errors?.length) {
        throw new AppError("STORAGE", "Could not remove stored files", {
          details: { prefix, errors: Errors.length },
        })
      }
    }
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = []
    for await (const page of this.objects(prefix)) {
      for (const object of page)
        keys.push(object.Key!.slice(this.prefix.length))
    }
    return keys.sort()
  }

  async listWithInfo(prefix: string): Promise<StoredEntry[]> {
    const entries: StoredEntry[] = []
    for await (const page of this.objects(prefix)) {
      for (const object of page) {
        entries.push({
          key: object.Key!.slice(this.prefix.length),
          bytes: object.Size ?? 0,
          mtimeMs: object.LastModified?.getTime() ?? 0,
        })
      }
    }
    return entries.sort((a, b) => (a.key < b.key ? -1 : 1))
  }

  localCopyCost(bytes: number) {
    return bytes
  }

  async localCopy(
    key: string,
    scratchDir: string,
    signal?: AbortSignal
  ): Promise<string> {
    const info = await this.head(key)
    if (!info) throw notFound(key)
    const name = `${sha1(key)}.${sha1(`${info.etag}:${info.bytes}`).slice(0, 16)}${path.extname(key)}`
    // The job gets its own hard link, so evicting the cache entry never pulls
    // a file out from under a running ffmpeg; the scratch dir frees it later.
    const file = path.join(scratchDir, "in", name)
    if (await stat(file).catch(() => null)) return file
    await mkdir(path.dirname(file), { recursive: true })
    for (let attempt = 0; ; attempt++) {
      const cached = await untilAborted(this.cached(key, name, info), signal)
      try {
        await link(cached, file)
        return file
      } catch (error) {
        const code = errorCode(error)
        if (code === "EEXIST") return file
        if (code === "EXDEV") {
          await copyFile(cached, file)
          return file
        }
        if (code !== "ENOENT" || attempt > 0) throw error
      }
    }
  }

  private async cached(
    key: string,
    name: string,
    info: { bytes: number; etag: string }
  ) {
    const entry = path.join(this.cache.dir, name)
    const now = new Date()
    try {
      await utimes(entry, now, now)
      return entry
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error
    }
    let download = this.downloads.get(name)
    if (!download) {
      download = this.download(key, entry, info).finally(() =>
        this.downloads.delete(name)
      )
      download.catch(() => {})
      this.downloads.set(name, download)
    }
    return download
  }

  private async download(
    key: string,
    entry: string,
    info: { bytes: number; etag: string }
  ) {
    const temps = path.join(this.cache.dir, ".tmp")
    await mkdir(temps, { recursive: true })
    await this.evict(info.bytes)
    const temp = path.join(temps, randomUUID())
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          IfMatch: info.etag || undefined,
        })
      )
      await pipeline(Body as Readable, createWriteStream(temp))
      await rename(temp, entry)
      return entry
    } catch (error) {
      await rm(temp, { force: true })
      throw isMissing(error) ? notFound(key) : error
    }
  }

  private async evict(incoming: number) {
    const temps = path.join(this.cache.dir, ".tmp")
    // A live download keeps touching its temp file; an old one was orphaned.
    for (const name of await readdir(temps)) {
      const file = path.join(temps, name)
      const info = await stat(file).catch(() => null)
      if (info && Date.now() - info.mtimeMs > STALE_DOWNLOAD_MS) {
        await rm(file, { force: true })
      }
    }
    const entries = []
    for (const dirent of await readdir(this.cache.dir, {
      withFileTypes: true,
    })) {
      if (!dirent.isFile()) continue
      const file = path.join(this.cache.dir, dirent.name)
      const info = await stat(file).catch(() => null)
      if (info) entries.push({ file, bytes: info.size, mtimeMs: info.mtimeMs })
    }
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs)
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0)
    for (const entry of entries) {
      if (total + incoming <= this.cache.maxBytes) break
      await rm(entry.file, { force: true })
      total -= entry.bytes
    }
  }

  async putFile(file: string, key: string) {
    const { size } = await stat(file)
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: mimeForKey(key),
      },
      partSize: PART_BYTES,
    }).done()
    await unlink(file)
    return { bytes: size }
  }

  async readUrl(key: string, options: { download?: string } = {}) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        ResponseContentDisposition: options.download
          ? `attachment; filename*=UTF-8''${encodeURIComponent(options.download)}`
          : undefined,
      }),
      { expiresIn: READ_URL_SECONDS }
    )
  }

  async uploadTarget(
    key: string,
    options: { bytes: number; contentType: string }
  ): Promise<UploadTarget> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        ContentType: options.contentType,
      })
    )
    const partSize = Math.max(
      this.uploadPartBytes,
      Math.ceil(options.bytes / MAX_PARTS)
    )
    return {
      kind: "multipart",
      uploadId: UploadId!,
      partSize,
      partCount: Math.max(1, Math.ceil(options.bytes / partSize)),
    }
  }

  async signUploadParts(
    key: string,
    upload: { uploadId: string; bytes: number; partSize: number },
    partNumbers: readonly number[]
  ) {
    const partCount = Math.max(1, Math.ceil(upload.bytes / upload.partSize))
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.signer,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: this.objectKey(key),
            UploadId: upload.uploadId,
            PartNumber: partNumber,
            ContentLength:
              partNumber < partCount
                ? upload.partSize
                : upload.bytes - (partCount - 1) * upload.partSize,
          }),
          {
            expiresIn: UPLOAD_URL_SECONDS,
            signableHeaders: new Set(["content-length"]),
          }
        ),
      }))
    )
  }

  async completeUpload(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[]
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({
            ETag: part.etag,
            PartNumber: part.partNumber,
          })),
        },
      })
    )
  }

  async abortUpload(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        UploadId: uploadId,
      })
    )
  }

  async abortStaleUploads(before: Date) {
    let aborted = 0
    let KeyMarker: string | undefined
    let UploadIdMarker: string | undefined
    do {
      // MinIO matches Prefix against whole keys only, so filter here.
      const page = await this.client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucket,
          KeyMarker,
          UploadIdMarker,
        })
      )
      for (const upload of page.Uploads ?? []) {
        if (!upload.Key?.startsWith(this.prefix)) continue
        if (!upload.Initiated || upload.Initiated >= before) continue
        await this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.bucket,
            Key: upload.Key,
            UploadId: upload.UploadId,
          })
        )
        aborted++
      }
      KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined
      UploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined
    } while (KeyMarker)
    return aborted
  }

  async usage(prefix?: string) {
    let bytes = 0
    let files = 0
    for await (const page of this.objects(prefix ?? ".")) {
      for (const object of page) {
        bytes += object.Size ?? 0
        files++
      }
    }
    return { bytes, files }
  }
}
