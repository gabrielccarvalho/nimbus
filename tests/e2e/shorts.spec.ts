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
  await expect(page.getByTestId("stat-aspect")).toHaveText("4:3")

  await page.getByRole("link", { name: /^Clips/ }).click()
  const first = page
    .getByRole("list", { name: "Clips" })
    .locator("[data-clip-id]")
    .first()
  await first.dblclick()
  await page.getByRole("tab", { name: "Layout" }).click()
  await expect(page.getByRole("button", { name: "Find webcam" })).toBeEnabled({
    timeout: 30_000,
  })
  await page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: "Fill" })
    .click()
  await expect(
    page.getByRole("group", { name: "Gameplay region" })
  ).toBeVisible()
  await expect(
    page.getByRole("slider", { name: "Gameplay focus" })
  ).toHaveCount(0)
  await expect(page.getByRole("group", { name: "Webcam region" })).toHaveCount(
    0
  )
  await expectNoSeriousA11yViolations(page)
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await page.getByRole("link", { name: "Back to clips" }).click()

  await page.getByRole("button", { name: /Approve all/ }).click()
  await expect(first).toHaveAccessibleDescription(/Approved/)
  await page.getByRole("button", { name: "Render approved clips" }).click()
  await expect(first).toHaveAccessibleDescription(/Rendered/, {
    timeout: 120_000,
  })
  await first.dblclick()
  await page.getByRole("button", { name: "More export options" }).click()
  const href = await page
    .getByRole("menuitem", { name: "Download last render" })
    .getAttribute("href")
  const clip = await page.request.get(href!)
  expect(clip.status()).toBe(200)
})
