import type { AddressInfo } from "node:net"
import type { Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { pollingFresh, startHealthServer } from "./health"

let server: Server | undefined

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve) ?? resolve(undefined))
  server = undefined
})

async function healthz(isHealthy: () => boolean, path = "/healthz") {
  server = startHealthServer(0, isHealthy)
  await new Promise((resolve) => server!.once("listening", resolve))
  const { port } = server.address() as AddressInfo
  return fetch(`http://127.0.0.1:${port}${path}`)
}

describe("worker health", () => {
  it("healthz is 200 while polling is fresh", async () => {
    const now = Date.now()
    const response = await healthz(() => pollingFresh(now - 1_000, 1_000, now))
    expect(response.status).toBe(200)
  })

  it("healthz is 503 when polling stalls", async () => {
    const now = Date.now()
    const response = await healthz(() => pollingFresh(now - 34_000, 1_000, now))
    expect(response.status).toBe(503)
  })

  it("answers 404 off the health path", async () => {
    const response = await healthz(() => true, "/")
    expect(response.status).toBe(404)
  })

  it("allows three poll intervals plus 30 s", () => {
    expect(pollingFresh(0, 1_000, 33_000)).toBe(true)
    expect(pollingFresh(0, 1_000, 33_001)).toBe(false)
  })
})
