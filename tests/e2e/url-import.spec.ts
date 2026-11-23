import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

test("imports a recording from a link", async ({ page }) => {
  await page.goto("/")
  const link = page.getByLabel("Or import from a link")
  await link.fill("http://localhost:3000/video")
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page.getByText("Paste a link to a video")).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await link.fill("https://www.youtube.com/watch?v=e2e")
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("heading", { name: "Imported recording" })
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
})

test("explains why a download failed", async ({ page }) => {
  await page.goto("/")
  await page
    .getByLabel("Or import from a link")
    .fill("https://example.com/private-video")
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(page.getByText("This video is private")).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole("button", { name: /Retry/ })).toBeVisible()
})
