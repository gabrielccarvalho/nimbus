import { describe, expect, it } from "vitest"

import {
  containerMatchesMime,
  isAcceptedMime,
  mimeFromFileName,
  projectNameFromFile,
  sniffContainer,
} from "./media-type"

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe("sniffContainer", () => {
  it("detects ISO BMFF boxes", () => {
    expect(sniffContainer(bytes(0, 0, 0, 32, ...ascii("ftypisom")))).toBe(
      "isobmff"
    )
    expect(sniffContainer(bytes(0, 0, 0, 8, ...ascii("moov")))).toBe("isobmff")
  })

  it("detects Matroska/WebM", () => {
    expect(sniffContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2))).toBe("matroska")
  })

  it("rejects everything else", () => {
    expect(sniffContainer(bytes(0x89, ...ascii("PNG\r\n\x1a\n")))).toBeNull()
    expect(sniffContainer(bytes(1, 2))).toBeNull()
  })
})

describe("mime helpers", () => {
  it("matches containers to declared types", () => {
    expect(containerMatchesMime("isobmff", "video/mp4")).toBe(true)
    expect(containerMatchesMime("isobmff", "video/webm")).toBe(false)
    expect(containerMatchesMime("matroska", "video/webm")).toBe(true)
    expect(containerMatchesMime("matroska", "video/quicktime")).toBe(false)
  })

  it("infers mime from file names", () => {
    expect(mimeFromFileName("a.MOV")).toBe("video/quicktime")
    expect(mimeFromFileName("a.m4v")).toBe("video/mp4")
    expect(mimeFromFileName("a.avi")).toBeNull()
    expect(isAcceptedMime("video/mp4")).toBe(true)
    expect(isAcceptedMime("image/png")).toBe(false)
  })

  it("derives project names", () => {
    expect(projectNameFromFile("my_cool_stream.mp4")).toBe("my cool stream")
    expect(projectNameFromFile(".mp4")).toBe("Untitled project")
  })
})
