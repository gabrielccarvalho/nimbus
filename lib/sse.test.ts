import { describe, expect, it, vi } from "vitest"

import { createPollingStream, formatSSE } from "./sse"

async function readAll(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let out = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += decoder.decode(value)
  }
}

describe("formatSSE", () => {
  it("formats events with multi-line data", () => {
    expect(formatSSE({ event: "x", id: "1", data: "a\nb" })).toBe(
      "event: x\nid: 1\ndata: a\ndata: b\n\n"
    )
    expect(formatSSE({ data: { ok: true }, retry: 10 })).toBe(
      'retry: 10\ndata: {"ok":true}\n\n'
    )
  })
})

describe("createPollingStream", () => {
  it("emits only on change and closes on final snapshots", async () => {
    vi.useFakeTimers()
    const values = [{ s: 1 }, { s: 1 }, { s: 2 }, { s: 3 }]
    let i = 0
    const stream = createPollingStream({
      poll: () => values[Math.min(i++, values.length - 1)],
      signal: new AbortController().signal,
      intervalMs: 10,
      isFinal: (v) => v.s === 3,
    })
    const result = readAll(stream)
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()
    const text = await result
    expect(text.match(/event: snapshot/g)).toHaveLength(3)
    expect(text).toContain('data: {"s":2}')
  })

  it("sends gone when the resource disappears", async () => {
    const stream = createPollingStream({
      poll: () => undefined,
      signal: new AbortController().signal,
    })
    expect(await readAll(stream)).toContain("event: gone")
  })

  it("sends an error event when polling throws", async () => {
    const stream = createPollingStream({
      poll: () => {
        throw new Error("db locked")
      },
      signal: new AbortController().signal,
    })
    const text = await readAll(stream)
    expect(text).toContain("event: error")
    expect(text).not.toContain("db locked")
  })

  it("stops polling when the request aborts and sends heartbeats", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const poll = vi.fn(() => ({ s: 1 }))
    const stream = createPollingStream({
      poll,
      signal: controller.signal,
      intervalMs: 10,
      heartbeatMs: 20,
    })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let text = ""
    while (!text.includes("keep-alive")) {
      const pending = reader.read()
      await vi.advanceTimersByTimeAsync(10)
      text += decoder.decode((await pending).value)
    }
    controller.abort()
    const calls = poll.mock.calls.length
    await vi.advanceTimersByTimeAsync(100)
    vi.useRealTimers()
    expect(poll.mock.calls.length).toBe(calls)
    await reader.cancel()
  })
})
