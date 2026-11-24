import { describe, expect, it } from "vitest"

import { cleanText, defaultPublishInput, videoResource } from "./metadata"
import type { PublishInput } from "./schema"

const defaults = {
  privacy: "private" as const,
  tags: ["gaming"],
  hashtags: "#gameplay #clips",
}

const input: PublishInput = {
  title: "A title",
  description: "A description",
  tags: ["gaming"],
  privacy: "private",
  publishAt: null,
}

describe("cleanText", () => {
  it("strips angle brackets", () => {
    expect(cleanText("a <b> c", 100)).toBe("a b c")
  })

  it("cuts long text on a word boundary", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ")
    const out = cleanText(long, 100)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out.endsWith("word")).toBe(true)
  })

  it("hard cuts when there is no space", () => {
    expect(cleanText("x".repeat(120), 100)).toHaveLength(100)
  })
})

describe("defaultPublishInput", () => {
  it("appends hashtags on a new line and adds #Shorts", () => {
    const out = defaultPublishInput(
      { title: "Hi", description: "Body" },
      defaults
    )
    expect(out.description).toBe("Body\n#gameplay #clips #Shorts")
    expect(out.title).toBe("Hi")
    expect(out.privacy).toBe("private")
    expect(out.tags).toEqual(["gaming"])
    expect(out.publishAt).toBeNull()
  })

  it("does not duplicate #Shorts", () => {
    const out = defaultPublishInput(
      { title: "Hi", description: "Body" },
      { ...defaults, hashtags: "#shorts #clips" }
    )
    expect(out.description).toBe("Body\n#shorts #clips")
  })
})

describe("videoResource", () => {
  it("builds the snippet and status", () => {
    const out = videoResource(input, "pt")
    expect(out.snippet.categoryId).toBe("20")
    expect(out.snippet.defaultLanguage).toBe("pt")
    expect(out.snippet.title).toBe("A title")
    expect(out.status.selfDeclaredMadeForKids).toBe(false)
    expect(out.status.privacyStatus).toBe("private")
    expect(out.status.publishAt).toBeUndefined()
  })

  it("forces private and sets publishAt when scheduled", () => {
    const publishAt = new Date("2026-12-01T15:00:00Z")
    const out = videoResource({ ...input, privacy: "public", publishAt }, "en")
    expect(out.status.privacyStatus).toBe("private")
    expect(out.status.publishAt).toBe("2026-12-01T15:00:00.000Z")
  })
})
