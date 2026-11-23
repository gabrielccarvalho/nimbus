import { describe, expect, it } from "vitest"

import { detectNiche, resolveNiche } from "./niches"

describe("niches", () => {
  it.each([
    ["GTA 6 - a polícia me perseguiu", "gta"],
    ["gta6 day 3 LIVE", "gta"],
    ["Grand Theft Auto VI full playthrough", "gta"],
    ["Resident Evil 9 #2", "horror"],
    ["Warzone with the boys", "shooter"],
    ["Forza Horizon 6 online", "racing"],
    ["Minecraft hardcore", "open-world"],
    ["Coding a game engine", "general"],
    ["Just chatting", "general"],
  ])("detects %s as %s", (title, niche) => {
    expect(detectNiche(title)).toBe(niche)
  })

  it("prefers an explicit niche over the title", () => {
    expect(resolveNiche("horror", "GTA 6")).toBe("horror")
    expect(resolveNiche("auto", "GTA 6")).toBe("gta")
    expect(resolveNiche(undefined, "GTA 6")).toBe("gta")
  })
})
