import type { Readable, Transform } from "node:stream"

export type ByteRange = { start: number; end: number }

export interface StorageAdapter {
  resolve(key: string): string
  write(
    key: string,
    body: Readable,
    options?: { maxBytes?: number; transforms?: Transform[] }
  ): Promise<{ bytes: number }>
  writeBuffer(key: string, data: Buffer | string): Promise<void>
  move(fromKey: string, toKey: string): Promise<void>
  stat(key: string): Promise<{ bytes: number; mtimeMs: number } | null>
  read(key: string, range?: ByteRange): Readable
  remove(key: string): Promise<void>
  removePrefix(prefix: string): Promise<void>
  list(prefix: string): Promise<string[]>
  usage(prefix?: string): Promise<{ bytes: number; files: number }>
}
