import type { Readable, Transform } from "node:stream"

export type ByteRange = { start: number; end: number }

export type UploadTarget =
  | { url: string; method: "PUT"; headers: Record<string, string> }
  | { url: null }

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
  localCopy(
    key: string,
    scratchDir: string,
    signal?: AbortSignal
  ): Promise<string>
  putFile(file: string, key: string): Promise<{ bytes: number }>
  readUrl(key: string, options?: { download?: string }): Promise<string | null>
  uploadTarget(
    key: string,
    options: { bytes: number; contentType: string }
  ): Promise<UploadTarget>
  usage(prefix?: string): Promise<{ bytes: number; files: number }>
}
