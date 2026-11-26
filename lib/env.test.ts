import { describe, expect, it } from "vitest"

import { parseEnv } from "./env"

const s3 = {
  STORAGE_DRIVER: "s3",
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
      S3_ENDPOINT: "http://localhost:9010",
      S3_FORCE_PATH_STYLE: "true",
    })
    expect(env).toMatchObject({
      STORAGE_DRIVER: "s3",
      S3_REGION: "auto",
      S3_FORCE_PATH_STYLE: true,
      S3_BUCKET: "nimbus",
    })
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
