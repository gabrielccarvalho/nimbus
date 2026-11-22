import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("reviews highlight candidates", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole("link", { name: "Clips" }).click()
  const list = page.getByRole("list", { name: "Clip candidates" })
  const first = list.getByRole("listitem").first()
  await expect(first).toContainText("Candidate")
  await expect(first).toContainText(/Heuristic/)

  await first.getByRole("button", { name: "Preview" }).click()
  await expect(
    page.getByRole("slider", { name: "Timeline" })
  ).not.toHaveAttribute("aria-valuenow", "0")

  await first.getByRole("button", { name: "Preview" }).focus()
  await page.keyboard.press("Tab")
  await expect(first.getByRole("button", { name: "Approve" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(first.getByRole("button", { name: "Approve" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(first.getByRole("link", { name: /Edit/ })).toBeFocused()
  await page.reload()
  await expect(list.getByRole("listitem").first()).toContainText("Approved")
  await expectNoSeriousA11yViolations(page)
})
