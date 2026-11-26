import http from "node:http"

const POLL_SLACK_MS = 30_000

export function pollingFresh(
  lastPolledAt: number,
  pollMs: number,
  now = Date.now()
) {
  return now - lastPolledAt <= 3 * pollMs + POLL_SLACK_MS
}

export function workerHealth(
  worker: { lastPolledAt: number; stopping: boolean },
  pollMs: number,
  now = Date.now
) {
  return () =>
    worker.stopping || pollingFresh(worker.lastPolledAt, pollMs, now())
}

export function startHealthServer(port: number, isHealthy: () => boolean) {
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end()
      return
    }
    const healthy = isHealthy()
    response
      .writeHead(healthy ? 200 : 503, { "Content-Type": "text/plain" })
      .end(healthy ? "ok" : "stalled")
  })
  server.listen(port)
  server.unref()
  return server
}
