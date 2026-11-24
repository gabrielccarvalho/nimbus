import { describe, expect, it } from "vitest"

import {
  formatBytes,
  formatDate,
  formatDuration,
  formatRelativeDay,
  formatTimestamp,
  mediaUrl,
  slugify,
  sourceLabel,
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

  it("names days relative to today", () => {
    const now = new Date(2026, 10, 24, 9)
    expect(formatRelativeDay(new Date(2026, 10, 24, 1), now)).toBe("Today")
    expect(formatRelativeDay(new Date(2026, 10, 23, 23), now)).toBe("Yesterday")
    expect(formatRelativeDay(new Date(2026, 10, 19), now)).toBe("Nov 19")
    expect(formatRelativeDay(new Date(2025, 0, 2), now)).toBe("Jan 2, 2025")
  })

  it.each([
    [null, "Upload"],
    ["https://www.youtube.com/watch?v=x", "YouTube"],
    ["https://youtu.be/x", "YouTube"],
    ["https://www.twitch.tv/videos/1", "Twitch VOD"],
    ["https://vimeo.com/1", "vimeo.com"],
  ])("sourceLabel(%s) = %s", (url, expected) => {
    expect(sourceLabel(url)).toBe(expected)
  })
})
