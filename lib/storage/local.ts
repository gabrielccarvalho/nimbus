import "server-only"

import { createReadStream, createWriteStream } from "node:fs"
import {
  copyFile,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { Transform, type Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { AppError } from "@/lib/errors"

import { byteLimit, KEY_PATTERN } from "./common"
import type { ByteRange, StorageAdapter, StoredEntry } from "./types"

const multipartUnsupported = () =>
  new AppError("STORAGE", "The local driver has no multipart uploads")

export class LocalStorage implements StorageAdapter {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(/* turbopackIgnore: true */ root)
  }

  path(key: string): string {
    if (!key || !KEY_PATTERN.test(key) || key.startsWith("/")) {
      throw new AppError("STORAGE", "Invalid storage key", {
        details: { key },
      })
    }
    const resolved = path.resolve(/* turbopackIgnore: true */ this.root, key)
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new AppError("STORAGE", "Path escapes the data directory", {
        details: { key },
      })
    }
    return resolved
  }

  async write(
    key: string,
    body: Readable,
    options: { maxBytes?: number; transforms?: Transform[] } = {}
  ): Promise<{ bytes: number }> {
    const target = this.path(key)
    const temp = `${target}.${process.pid}.${Date.now()}.part`
    await mkdir(path.dirname(target), { recursive: true })
    let bytes = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(null, chunk)
      },
    })
    try {
      const stages: Array<NodeJS.ReadableStream | NodeJS.WritableStream> = [
        body,
        ...(options.transforms ?? []),
      ]
      if (options.maxBytes !== undefined)
        stages.push(byteLimit(options.maxBytes))
      stages.push(counter, createWriteStream(temp))
      await pipeline(stages)
      await rename(temp, target)
      return { bytes }
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
  }

  async writeBuffer(key: string, data: Buffer | string) {
    const target = this.path(key)
    await mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.${Date.now()}.part`
    await writeFile(temp, data)
    await rename(temp, target)
  }

  async stat(key: string) {
    try {
      const info = await stat(this.path(key))
      if (!info.isFile()) return null
      return { bytes: info.size, mtimeMs: info.mtimeMs }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  read(key: string, range?: ByteRange): Readable {
    return createReadStream(
      this.path(key),
      range ? { start: range.start, end: range.end } : undefined
    )
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true })
  }

  async removePrefix(prefix: string) {
    await rm(this.path(prefix), { recursive: true, force: true })
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.path(prefix)
    try {
      const entries = await readdir(base, {
        recursive: true,
        withFileTypes: true,
      })
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path
            .relative(this.root, path.join(entry.parentPath, entry.name))
            .split(path.sep)
            .join("/")
        )
        .sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }

  async listWithInfo(prefix: string): Promise<StoredEntry[]> {
    const entries: StoredEntry[] = []
    for (const key of await this.list(prefix)) {
      const info = await this.stat(key)
      if (info) entries.push({ key, ...info })
    }
    return entries
  }

  localCopyCost() {
    return 0
  }

  async localCopy(key: string): Promise<string> {
    const file = this.path(key)
    if (!(await this.stat(key))) {
      throw new AppError("NOT_FOUND", "Stored file not found", {
        details: { key },
      })
    }
    return file
  }

  async putFile(file: string, key: string) {
    const target = this.path(key)
    const { size } = await stat(file)
    await mkdir(path.dirname(target), { recursive: true })
    try {
      await rename(file, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
      const temp = `${target}.${process.pid}.${Date.now()}.part`
      try {
        await copyFile(file, temp)
        await rename(temp, target)
      } catch (copyError) {
        await rm(temp, { force: true })
        throw copyError
      }
      await unlink(file)
    }
    return { bytes: size }
  }

  async readUrl(): Promise<string | null> {
    return null
  }

  async uploadTarget(): Promise<null> {
    return null
  }

  async signUploadParts(): Promise<never> {
    throw multipartUnsupported()
  }

  async completeUpload(): Promise<never> {
    throw multipartUnsupported()
  }

  async abortUpload() {}

  async abortStaleUploads() {
    return 0
  }

  async usage(prefix?: string) {
    const entries = await this.listWithInfo(prefix ?? ".")
    const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0)
    return { bytes, files: entries.length }
  }
}
