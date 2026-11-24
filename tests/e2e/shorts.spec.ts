import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("turns a 4:3 recording into a full-screen short", async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.standard)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("4:3")).toBeVisible()

  await page.getByRole("link", { name: "Layout" }).click()
  await expect(page.getByText("Looking for the webcam…")).toBeHidden({
    timeout: 30_000,
  })
  await page.getByRole("button", { name: "Fill, no webcam" }).click()
  await expect(page.getByTestId("gameplay-window")).toBeVisible()
  await expect(
    page.getByRole("slider", { name: "Gameplay focus" })
  ).toBeVisible()
  await expect(page.getByRole("group", { name: "Webcam region" })).toHaveCount(
    0
  )
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Confirm layout" }).click()
  await expect(page.getByText("Layout confirmed")).toBeVisible()

  await page.getByRole("link", { name: "Clips" }).click()
  await page.getByRole("button", { name: /Approve all/ }).click()
  const first = page
    .getByRole("list", { name: "Clips" })
    .getByRole("button")
    .first()
  await expect(first).toHaveAccessibleDescription(/Approved/)
  await page.getByRole("button", { name: "Render approved clips" }).click()
  await expect(first).toHaveAccessibleDescription(/Rendered/, {
    timeout: 120_000,
  })
  await first.click()
  const href = await page
    .getByRole("dialog")
    .getByRole("link", { name: /Download/ })
    .getAttribute("href")
  const clip = await page.request.get(href!)
  expect(clip.status()).toBe(200)
})
