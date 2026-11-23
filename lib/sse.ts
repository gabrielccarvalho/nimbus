export function formatSSE(event: {
  data: unknown
  event?: string
  id?: string
  retry?: number
}): string {
  let out = ""
  if (event.event) out += `event: ${event.event}\n`
  if (event.id) out += `id: ${event.id}\n`
  if (event.retry !== undefined) out += `retry: ${event.retry}\n`
  const payload =
    typeof event.data === "string" ? event.data : JSON.stringify(event.data)
  for (const line of payload.split("\n")) out += `data: ${line}\n`
  return `${out}\n`
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const

export type PollingStreamOptions<T> = {
  poll: () => T | undefined | Promise<T | undefined>
  signal: AbortSignal
  intervalMs?: number
  heartbeatMs?: number
  event?: string
  isFinal?: (snapshot: T) => boolean
}

export function createPollingStream<T>({
  poll,
  signal,
  intervalMs = 500,
  heartbeatMs = 15_000,
  event = "snapshot",
  isFinal,
}: PollingStreamOptions<T>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stop = () => {
    closed = true
    if (timer) clearTimeout(timer)
    if (heartbeat) clearInterval(heartbeat)
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let last = ""
      const send = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          stop()
        }
      }
      const close = () => {
        if (closed) return
        stop()
        try {
          controller.close()
        } catch {}
      }

      const tick = async () => {
        if (closed) return
        let snapshot: T | undefined
        try {
          snapshot = await poll()
        } catch {
          send(
            formatSSE({ event: "error", data: { message: "Lookup failed" } })
          )
          close()
          return
        }
        if (snapshot === undefined) {
          send(formatSSE({ event: "gone", data: {} }))
          close()
          return
        }
        const serialized = JSON.stringify(snapshot)
        if (serialized !== last) {
          last = serialized
          send(formatSSE({ event, data: serialized, retry: 2000 }))
        }
        if (isFinal?.(snapshot)) {
          close()
          return
        }
        if (!closed) timer = setTimeout(() => void tick(), intervalMs)
      }

      void tick()
      heartbeat = setInterval(() => send(": keep-alive\n\n"), heartbeatMs)
      signal.addEventListener("abort", stop, { once: true })
    },
    cancel() {
      stop()
    },
  })
}
