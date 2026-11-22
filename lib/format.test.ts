import { describe, expect, it } from "vitest"

import {
  formatBytes,
  formatDate,
  formatDuration,
  formatTimestamp,
  mediaUrl,
  slugify,
} from "./format"

describe("format helpers", () => {
  it.each([
    [0, "0:00"],
    [59_999, "0:59"],
    [61_000, "1:01"],
    [3_723_000, "1:02:03"],
    [null, "—"],
    [-5, "—"],
  ])("formatDuration(%s) = %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  it("formats timestamps with tenths", () => {
    expect(formatTimestamp(61_250)).toBe("1:01.2")
  })

  it.each([
    [0, "0 B"],
    [1536, "1.5 KB"],
    [5 * 1024 ** 3, "5.0 GB"],
    [200 * 1024 ** 2, "200 MB"],
    [undefined, "—"],
  ])("formatBytes(%s) = %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })

  it("formats dates", () => {
    expect(formatDate(new Date(2026, 0, 2, 3, 4))).toMatch(/Jan 2, 2026/)
  })

  it("builds encoded media urls", () => {
    expect(mediaUrl("projects/a b/x.mp4")).toBe(
      "/api/media/projects/a%20b/x.mp4"
    )
    expect(mediaUrl("p/x.mp4", { download: "My Clip.mp4" })).toBe(
      "/api/media/p/x.mp4?download=My%20Clip.mp4"
    )
  })
})

describe("slugify", () => {
  it("makes safe file names", () => {
    expect(slugify("Wait, WHAT just happened?!")).toBe(
      "wait-what-just-happened"
    )
    expect(slugify("Crème brûlée 🍮 run")).toBe("creme-brulee-run")
    expect(slugify("../../etc/passwd")).toBe("etc-passwd")
    expect(slugify("!!!")).toBe("clip")
    expect(slugify("a".repeat(80)).length).toBe(60)
  })
})
