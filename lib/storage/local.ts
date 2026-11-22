import "server-only"

import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Transform, type Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { AppError } from "@/lib/errors"

import type { ByteRange, StorageAdapter } from "./types"

const KEY_PATTERN = /^[A-Za-z0-9._\-/]+$/

export function byteLimit(maxBytes: number) {
  let total = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) {
        callback(
          new AppError("TOO_LARGE", `File is larger than ${maxBytes} bytes`)
        )
        return
      }
      callback(null, chunk)
    },
  })
}

export class LocalStorage implements StorageAdapter {
  readonly root: string

  constructor(root: string) {
    this.root = path.resolve(/* turbopackIgnore: true */ root)
  }

  resolve(key: string): string {
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
    const target = this.resolve(key)
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
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.${Date.now()}.part`
    await writeFile(temp, data)
    await rename(temp, target)
  }

  async move(fromKey: string, toKey: string) {
    const to = this.resolve(toKey)
    await mkdir(path.dirname(to), { recursive: true })
    await rename(this.resolve(fromKey), to)
  }

  async stat(key: string) {
    try {
      const info = await stat(this.resolve(key))
      if (!info.isFile()) return null
      return { bytes: info.size, mtimeMs: info.mtimeMs }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  }

  read(key: string, range?: ByteRange): Readable {
    return createReadStream(
      this.resolve(key),
      range ? { start: range.start, end: range.end } : undefined
    )
  }

  async remove(key: string) {
    await rm(this.resolve(key), { force: true })
  }

  async removePrefix(prefix: string) {
    await rm(this.resolve(prefix), { recursive: true, force: true })
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.resolve(prefix)
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

  async usage(prefix?: string) {
    const keys = await this.list(prefix ?? ".")
    let bytes = 0
    for (const key of keys) bytes += (await this.stat(key))?.bytes ?? 0
    return { bytes, files: keys.length }
  }
}
