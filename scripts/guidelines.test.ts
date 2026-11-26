import { describe, expect, it } from "vitest"

import { checkRepository, checkSource, staleAllowances } from "./guidelines"

const rules = (file: string, source: string) =>
  checkSource(file, source).map((violation) => violation.rule)

describe("guidelines", () => {
  it("hold across the repository", () => {
    expect(checkRepository()).toEqual([])
  })

  it("has no exception that outlived its reason", () => {
    expect(staleAllowances()).toEqual([])
  })

  it("stops a feature from importing UI", () => {
    expect(
      rules(
        "features/clips/x.ts",
        'import { Button } from "@/components/ui/button"'
      )
    ).toContain("features-stay-below-ui")
  })

  it("asks for server-only where the database is used", () => {
    const source = 'import { db } from "@/lib/db"\n'
    expect(rules("features/clips/x.ts", source)).toContain("server-only")
    expect(
      rules("features/clips/x.ts", `import "server-only"\n${source}`)
    ).toEqual([])
    expect(rules("features/clips/x.ts", `"use server"\n${source}`)).toEqual([])
    expect(
      rules("features/clips/x.ts", 'import type { Db } from "@/lib/db"\n')
    ).toEqual([])
  })

  it("keeps long work out of requests", () => {
    expect(
      rules(
        "features/render/actions.ts",
        '"use server"\nimport { run } from "@/lib/process/run"'
      )
    ).toContain("no-long-work-in-requests")
  })

  it("rejects borders and raw colours in app UI", () => {
    expect(
      rules("components/projects/x.tsx", '<div className="border-t p-2" />')
    ).toContain("no-borders")
    expect(
      rules(
        "components/projects/x.tsx",
        '<div className="border-0 inset-ring-1" />'
      )
    ).toEqual([])
    expect(
      rules("components/projects/x.tsx", '<div className="bg-[#ff0000]" />')
    ).toContain("tokens-only")
  })

  it("keeps the gradient and the primary button rare", () => {
    expect(
      rules("components/projects/x.tsx", '<b className="text-gradient" />')
    ).toContain("gradient-is-rare")
    const two = '<Button variant="primary" />\n<Button variant="primary" />'
    expect(rules("app/(app)/x/page.tsx", two)).toEqual(["one-primary-per-file"])
  })
})
