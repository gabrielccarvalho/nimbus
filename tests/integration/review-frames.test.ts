import { describe, expect, it } from "vitest"

import { proxyFrameSource } from "@/features/highlights/frames"

import { fixtures } from "../../scripts/make-fixtures"

describe("proxyFrameSource", () => {
  it("grabs one JPEG per requested time", async () => {
    const frames = await proxyFrameSource(fixtures.wide)([0, 1500, 3000])
    expect(frames).toHaveLength(3)
    for (const frame of frames) {
      expect(Buffer.from(frame, "base64").subarray(0, 2)).toEqual(
        Buffer.from([0xff, 0xd8])
      )
    }
  })
})
