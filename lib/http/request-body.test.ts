import { pipeline } from "node:stream/promises"
import { Writable } from "node:stream"

import { describe, expect, it } from "vitest"

import { readableFromRequestBody } from "./request-body"

function body(chunks: number) {
  let sent = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) controller.close()
      else controller.enqueue(new Uint8Array([sent++]))
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, sent: () => sent, cancelled: () => cancelled }
}

describe("readableFromRequestBody", () => {
  it("streams every chunk", async () => {
    const source = body(5)
    const received: number[] = []
    await pipeline(
      readableFromRequestBody(source.stream),
      new Writable({
        write(chunk: Buffer, _encoding, callback) {
          received.push(...chunk)
          callback()
        },
      })
    )
    expect(received).toEqual([0, 1, 2, 3, 4])
  })

  it("drains instead of cancelling when the consumer gives up", async () => {
    const source = body(50)
    await expect(
      pipeline(
        readableFromRequestBody(source.stream),
        new Writable({
          write(_chunk, _encoding, callback) {
            callback(new Error("bad bytes"))
          },
        })
      )
    ).rejects.toThrow("bad bytes")
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(source.cancelled()).toBe(false)
    expect(source.sent()).toBe(50)
  })
})
