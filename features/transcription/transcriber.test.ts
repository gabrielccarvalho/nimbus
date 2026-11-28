import { describe, expect, it } from "vitest"

import { AppError } from "@/lib/errors"

import { skipReason } from "./transcriber"

const groq = (code: AppError["code"], status?: number) =>
  new AppError(code, "groq", { details: { status, transcriber: "groq" } })

describe("skipReason", () => {
  const early = { lastAttempt: false }
  const last = { lastAttempt: true }

  it("skips a rejected key and a rate limit right away", () => {
    expect(skipReason(groq("UNAUTHORIZED", 401), early)).toBe("rejected")
    expect(skipReason(groq("EXTERNAL", 429), early)).toBe("rate_limited")
  })

  it("retries other API errors and skips on the last attempt", () => {
    expect(skipReason(groq("EXTERNAL", 503), early)).toBeNull()
    expect(skipReason(groq("EXTERNAL", 503), last)).toBe("api_error")
    expect(skipReason(groq("VALIDATION", 400), early)).toBe("api_error")
  })

  it("leaves errors that aren't the transcriber's alone", () => {
    expect(
      skipReason(new AppError("EXTERNAL", "ffmpeg exited"), last)
    ).toBeNull()
    expect(skipReason(new AppError("CANCELLED", "stop"), last)).toBeNull()
    expect(skipReason(new Error("boom"), last)).toBeNull()
  })
})
