import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  )
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`).join(" | ")}`
    )
  ).toEqual([])
}
