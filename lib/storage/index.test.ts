import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { resetEnvCache } from "@/lib/env"

import { getStorage } from "./index"
import { LocalStorage } from "./local"
import { S3Storage } from "./s3"

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvCache()
})

describe("getStorage", () => {
  it("uses the local driver by default", () => {
    vi.stubEnv("STORAGE_DRIVER", "")
    vi.stubEnv("DATA_DIR", path.join(os.tmpdir(), "nimbus-storage-index"))
    resetEnvCache()
    expect(getStorage()).toBeInstanceOf(LocalStorage)
  })

  it("uses S3 when STORAGE_DRIVER=s3", () => {
    vi.stubEnv("STORAGE_DRIVER", "s3")
    vi.stubEnv("S3_ENDPOINT", "http://localhost:9010")
    vi.stubEnv("S3_BUCKET", "nimbus")
    vi.stubEnv("S3_ACCESS_KEY_ID", "key")
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret")
    resetEnvCache()
    expect(getStorage()).toBeInstanceOf(S3Storage)
  })
})
