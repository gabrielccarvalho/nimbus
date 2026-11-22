import { describe, expect, it } from "vitest"

import {
  AppError,
  err,
  isRetryable,
  ok,
  toAppError,
  toUserMessage,
} from "./errors"

describe("errors", () => {
  it("wraps unknown errors as INTERNAL", () => {
    expect(toAppError(new Error("boom")).code).toBe("INTERNAL")
    expect(toAppError("nope").code).toBe("INTERNAL")
  })

  it("hides internal messages from users", () => {
    expect(toUserMessage(new Error("db exploded at line 4"))).not.toContain(
      "line 4"
    )
    expect(toUserMessage(new AppError("NOT_FOUND", "Project not found"))).toBe(
      "Project not found"
    )
  })

  it("classifies retryable codes", () => {
    expect(isRetryable(new AppError("EXTERNAL", "x"))).toBe(true)
    expect(isRetryable(new AppError("DEPENDENCY_MISSING", "x"))).toBe(false)
  })

  it("builds results", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 })
    expect(err(new AppError("CONFLICT", "taken"))).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "taken" },
    })
  })
})
