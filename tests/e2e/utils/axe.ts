import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"

export async function expectNoSeriousA11yViolations(page: Page) {
  // Contrast is measured mid-fade otherwise.
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>("[data-sonner-toast]")].every(
      (toast) =>
        toast.dataset.front === "false" ||
        toast.dataset.removed === "true" ||
        getComputedStyle(toast).opacity === "1"
    )
  )
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    // Stacked toasts behind the front one are deliberately dimmed and covered.
    .exclude('[data-sonner-toast][data-front="false"]')
    .exclude('[data-sonner-toast][data-removed="true"]')
    .analyze()
  const serious = results.violations.filter(
    (v) =>
      v.impact === "serious" ||
      v.impact === "critical" ||
      v.id.startsWith("landmark-")
  )
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`).join(" | ")}`
    )
  ).toEqual([])
}
