import { describe, expect, it } from "vitest"

import { signUploadToken, verifyUploadToken, type UploadClaim } from "./token"

const claim: UploadClaim = {
  kind: "video",
  id: "p1",
  key: "projects/p1/source.mp4",
  workspaceId: "w1",
  userId: "u1",
  fileName: "my stream.mp4",
  mime: "video/mp4",
  bytes: 1024,
  options: { language: "pt" },
  exp: 2_000_000,
  completeBy: 3_000_000,
}

describe("upload tokens", () => {
  it("round-trips a claim", () => {
    expect(verifyUploadToken(signUploadToken(claim), "exp", 1_000_000)).toEqual(
      claim
    )
  })

  it("rejects a tampered payload", () => {
    const [, signature] = signUploadToken(claim).split(".")
    const forged = Buffer.from(
      JSON.stringify({ ...claim, bytes: 10 ** 12 })
    ).toString("base64url")
    for (const token of [`${forged}.${signature}`, "garbage", ""]) {
      expect(() => verifyUploadToken(token, "exp", 1_000_000)).toThrow(
        expect.objectContaining({
          code: "VALIDATION",
          message: "This upload link has expired",
        })
      )
    }
  })

  it("rejects an expired claim", () => {
    const token = signUploadToken(claim)
    expect(() => verifyUploadToken(token, "exp", claim.exp + 1)).toThrow(
      expect.objectContaining({
        code: "VALIDATION",
        message: "This upload link has expired",
      })
    )
  })

  it("checks the completion deadline separately", () => {
    const token = signUploadToken(claim)
    expect(verifyUploadToken(token, "completeBy", claim.exp + 1)).toEqual(claim)
    expect(() =>
      verifyUploadToken(token, "completeBy", claim.completeBy + 1)
    ).toThrow(expect.objectContaining({ code: "VALIDATION" }))
  })
})
