import { describe, expect, it } from "vitest"

import { parseEnv } from "./env"

const s3 = {
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "http://localhost:9010",
  S3_BUCKET: "nimbus",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
}

describe("parseEnv storage", () => {
  it("defaults to the local driver", () => {
    expect(parseEnv({}).STORAGE_DRIVER).toBe("local")
  })

  it("reads the s3 settings", () => {
    const env = parseEnv({
      ...s3,
      S3_FORCE_PATH_STYLE: "true",
    })
    expect(env).toMatchObject({
      STORAGE_DRIVER: "s3",
      S3_REGION: "auto",
      S3_FORCE_PATH_STYLE: true,
      S3_BUCKET: "nimbus",
    })
  })

  it("s3 driver on AWS requires a region", () => {
    const aws = { ...s3, S3_ENDPOINT: undefined }
    expect(() => parseEnv(aws)).toThrow(
      "S3_REGION is required when STORAGE_DRIVER=s3 has no S3_ENDPOINT"
    )
    expect(() => parseEnv({ ...aws, S3_REGION: "auto" })).toThrow(
      "S3_REGION is required"
    )
    expect(parseEnv({ ...aws, S3_REGION: "eu-west-1" }).S3_REGION).toBe(
      "eu-west-1"
    )
  })

  it("sizes the scratch cache", () => {
    expect(parseEnv({}).SCRATCH_CACHE_BYTES).toBe(64 * 1024 ** 3)
    expect(() => parseEnv({ SCRATCH_CACHE_BYTES: "0" })).toThrow()
  })

  it.each(["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"])(
    "requires %s with the s3 driver",
    (name) => {
      expect(() => parseEnv({ ...s3, [name]: undefined })).toThrow(
        `${name} is required when STORAGE_DRIVER=s3`
      )
    }
  )
})

describe("parseEnv hosted settings", () => {
  it("s3 driver without a bucket fails env parsing", () => {
    expect(() => parseEnv({ ...s3, S3_BUCKET: undefined })).toThrow(
      "S3_BUCKET is required when STORAGE_DRIVER=s3"
    )
  })

  it("defaults the pool size and role", () => {
    expect(parseEnv({})).toMatchObject({
      DATABASE_POOL_MAX: 10,
      NIMBUS_ROLE: "all",
    })
    expect(
      parseEnv({ DATABASE_POOL_MAX: "3", NIMBUS_ROLE: "web" })
    ).toMatchObject({
      DATABASE_POOL_MAX: 3,
      NIMBUS_ROLE: "web",
    })
    expect(() => parseEnv({ DATABASE_POOL_MAX: "0" })).toThrow()
  })

  it("defaults the worker shutdown deadline and health port", () => {
    expect(parseEnv({})).toMatchObject({
      WORKER_SHUTDOWN_GRACE_MS: 25_000,
      WORKER_HEALTH_PORT: 8787,
    })
    expect(
      parseEnv({ WORKER_SHUTDOWN_GRACE_MS: "570000", WORKER_HEALTH_PORT: "0" })
    ).toMatchObject({
      WORKER_SHUTDOWN_GRACE_MS: 570_000,
      WORKER_HEALTH_PORT: 0,
    })
  })

  it("reads an optional public S3 endpoint", () => {
    expect(parseEnv(s3).S3_PUBLIC_ENDPOINT).toBeUndefined()
    expect(
      parseEnv({ ...s3, S3_PUBLIC_ENDPOINT: "http://localhost:9010" })
        .S3_PUBLIC_ENDPOINT
    ).toBe("http://localhost:9010")
  })
})
