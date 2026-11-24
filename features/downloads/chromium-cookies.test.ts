import { createCipheriv, createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  chromiumTimeToUnix,
  decryptCookieValue,
  deriveCookieKey,
  parseBrowserSpec,
  toNetscapeCookies,
} from "./chromium-cookies"

function encrypt(plain: Buffer, key: Buffer) {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, " "))
  return Buffer.concat([
    Buffer.from("v10"),
    cipher.update(plain),
    cipher.final(),
  ])
}

describe("parseBrowserSpec", () => {
  it.each([
    ["dia", { browser: "dia", profile: "Default" }],
    ["Dia", { browser: "dia", profile: "Default" }],
    ["dia:Profile 1", { browser: "dia", profile: "Profile 1" }],
  ])("handles %s itself", (spec, expected) => {
    expect(parseBrowserSpec(spec)).toMatchObject(expected)
  })

  it.each([["chrome"], ["safari"], ["firefox:abc"], ["diamond"]])(
    "leaves %s to yt-dlp",
    (spec) => {
      expect(parseBrowserSpec(spec)).toBeNull()
    }
  )
})

describe("decryptCookieValue", () => {
  const key = deriveCookieKey("secret")

  it("strips the host hash that schema 24 prepends", () => {
    const hash = createHash("sha256").update(".youtube.com").digest()
    const encrypted = encrypt(
      Buffer.concat([hash, Buffer.from("cookie-value")]),
      key
    )
    expect(decryptCookieValue(encrypted, key, 24)).toBe("cookie-value")
  })

  it("reads values from older schemas as they are", () => {
    const encrypted = encrypt(Buffer.from("cookie-value"), key)
    expect(decryptCookieValue(encrypted, key, 23)).toBe("cookie-value")
  })

  it("returns null for a wrong key or an unknown format", () => {
    const encrypted = encrypt(Buffer.from("cookie-value"), key)
    expect(decryptCookieValue(encrypted, deriveCookieKey("other"), 23)).toBe(
      null
    )
    expect(decryptCookieValue(Buffer.from("v20abc"), key, 24)).toBe(null)
  })
})

describe("chromiumTimeToUnix", () => {
  it("converts microseconds since 1601 to unix seconds", () => {
    expect(chromiumTimeToUnix(13_400_000_000_000_000)).toBe(1_755_526_400)
  })

  it("keeps session cookies at 0", () => {
    expect(chromiumTimeToUnix(0)).toBe(0)
  })
})

describe("toNetscapeCookies", () => {
  it("writes one tab-separated line per cookie", () => {
    const text = toNetscapeCookies([
      {
        host: ".youtube.com",
        name: "SID",
        value: "abc",
        path: "/",
        expires: 1_755_526_400,
        secure: true,
      },
      {
        host: "www.youtube.com",
        name: "PREF",
        value: "f1=1",
        path: "/",
        expires: 0,
        secure: false,
      },
    ])
    expect(text.split("\n")).toEqual([
      "# Netscape HTTP Cookie File",
      ".youtube.com\tTRUE\t/\tTRUE\t1755526400\tSID\tabc",
      "www.youtube.com\tFALSE\t/\tFALSE\t0\tPREF\tf1=1",
      "",
    ])
  })
})
