import type { Readable, Transform } from "node:stream"

export type ByteRange = { start: number; end: number }

export type StoredEntry = { key: string; bytes: number; mtimeMs: number }

export type UploadTarget =
  | {
      kind: "single"
      url: string
      method: "PUT"
      headers: Record<string, string>
    }
  | { kind: "multipart"; uploadId: string; partSize: number; partCount: number }

export type UploadedPart = { partNumber: number; etag: string }

export interface StorageAdapter {
  write(
    key: string,
    body: Readable,
    options?: { maxBytes?: number; transforms?: Transform[] }
  ): Promise<{ bytes: number }>
  writeBuffer(key: string, data: Buffer | string): Promise<void>
  stat(key: string): Promise<{ bytes: number; mtimeMs: number } | null>
  read(key: string, range?: ByteRange): Readable
  remove(key: string): Promise<void>
  removePrefix(prefix: string): Promise<void>
  list(prefix: string): Promise<string[]>
  listWithInfo(prefix: string): Promise<StoredEntry[]>
  localCopyCost(bytes: number): number
  localCopy(
    key: string,
    scratchDir: string,
    signal?: AbortSignal
  ): Promise<string>
  putFile(file: string, key: string): Promise<{ bytes: number }>
  readUrl(key: string, options?: { download?: string }): Promise<string | null>
  // null means the browser uploads through the app's own route.
  uploadTarget(
    key: string,
    options: { bytes: number; contentType: string }
  ): Promise<UploadTarget | null>
  signUploadParts(
    key: string,
    upload: { uploadId: string; bytes: number; partSize: number },
    partNumbers: readonly number[]
  ): Promise<Array<{ partNumber: number; url: string }>>
  completeUpload(
    key: string,
    uploadId: string,
    parts: readonly UploadedPart[]
  ): Promise<void>
  abortUpload(key: string, uploadId: string): Promise<void>
  abortStaleUploads(before: Date): Promise<number>
  usage(prefix?: string): Promise<{ bytes: number; files: number }>
}
