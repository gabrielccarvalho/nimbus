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
