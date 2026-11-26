import { Transform } from "node:stream"

import { AppError } from "@/lib/errors"

export const KEY_PATTERN = /^[A-Za-z0-9._\-/]+$/

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

export function headCheck(size: number, check: (head: Buffer) => void) {
  let head = Buffer.alloc(0)
  let checked = false
  const run = () => {
    check(head)
    checked = true
  }
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      if (!checked) {
        head = Buffer.concat([head, chunk]).subarray(0, size)
        if (head.length >= size) {
          try {
            run()
          } catch (error) {
            callback(error as Error)
            return
          }
        }
      }
      callback(null, chunk)
    },
    flush(callback) {
      try {
        if (!checked) run()
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
  })
}
