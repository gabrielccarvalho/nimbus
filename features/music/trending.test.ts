import { describe, expect, it } from "vitest"

import { regionFromLanguages } from "./trending"

describe("regionFromLanguages", () => {
  it.each([
    ["pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7", "BR"],
    ["en-gb", "GB"],
    ["zh-Hant-TW,zh;q=0.9", "TW"],
    ["fr;q=0.9,de-AT;q=0.8", "AT"],
    ["es-419,es;q=0.9", "US"],
    ["en", "US"],
    ["", "US"],
    [null, "US"],
  ])("reads %j as %s", (header, region) => {
    expect(regionFromLanguages(header)).toBe(region)
  })
})
