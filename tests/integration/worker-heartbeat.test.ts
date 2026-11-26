import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  deleteHeartbeat,
  latestWorker,
  recordHeartbeat,
  serializeCapabilities,
  type SerializedCapabilities,
} from "@/features/jobs/heartbeat"
import { getRenderingCapabilities } from "@/features/settings/queries"

import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv
beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const capabilities = (
  over: Partial<SerializedCapabilities> = {}
): SerializedCapabilities => ({
  available: true,
  version: "7.1",
  filters: ["ass"],
  encoders: ["libx264"],
  hasLibass: true,
  hasLibx264: true,
  hardwareEncoders: [],
  ...over,
})

const NOW = new Date("2026-01-01T12:00:00Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms)

describe("worker heartbeat", () => {
  it("serializes the sets as sorted arrays", () => {
    const serialized = serializeCapabilities({
      ...capabilities(),
      filters: new Set(["b", "a"]),
      encoders: new Set(["z", "libx264"]),
    })
    expect(serialized.filters).toEqual(["a", "b"])
    expect(serialized.encoders).toEqual(["libx264", "z"])
  })

  it("latestWorker returns the freshest heartbeat", async () => {
    await recordHeartbeat(env.db, "old", capabilities(), ago(60_000))
    await recordHeartbeat(
      env.db,
      "new",
      capabilities({ version: "8.0" }),
      ago(5_000)
    )
    const worker = await latestWorker(env.db, NOW)
    expect(worker?.owner).toBe("new")
    expect(worker?.capabilities.version).toBe("8.0")
    expect(worker?.seenAt).toEqual(ago(5_000))
  })

  it("upserts on owner and removes the row on delete", async () => {
    await recordHeartbeat(env.db, "w", capabilities(), ago(90_000))
    await recordHeartbeat(env.db, "w", capabilities(), ago(1_000))
    expect((await latestWorker(env.db, NOW))?.seenAt).toEqual(ago(1_000))
    await deleteHeartbeat(env.db, "w")
    expect(await latestWorker(env.db, NOW)).toBeNull()
  })

  it("latestWorker is null when every heartbeat is stale", async () => {
    await recordHeartbeat(env.db, "a", capabilities(), ago(4 * 60_000))
    await recordHeartbeat(env.db, "b", capabilities(), ago(10 * 60_000))
    expect(await latestWorker(env.db, NOW)).toBeNull()
  })

  it("settings encoders come from the heartbeat", async () => {
    await recordHeartbeat(
      env.db,
      "w",
      capabilities({
        encoders: ["libx264", "h264_nvenc"],
        hardwareEncoders: ["h264_nvenc"],
      }),
      NOW
    )
    expect(await getRenderingCapabilities(env.db, "auto", NOW)).toEqual({
      workerOnline: true,
      hardwareEncoder: "h264_nvenc",
    })
  })

  it("settings report no hardware encoder when no worker is online", async () => {
    expect(await getRenderingCapabilities(env.db, "auto", NOW)).toEqual({
      workerOnline: false,
      hardwareEncoder: null,
    })
  })
})
