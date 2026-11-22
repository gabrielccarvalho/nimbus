import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

test.afterEach(async ({ page }) => {
  await page.goto("/settings")
  await page.getByLabel("Shortest clip (s)").fill("15")
  await page.getByLabel("Longest clip (s)").fill("60")
  await page.getByLabel("Clips to find").fill("12")
  await page.getByRole("radio", { name: /Standard/ }).check()
  const captions = page.getByRole("switch", { name: "Burn in captions" })
  if (!(await captions.isChecked())) await captions.click()
  await page.getByRole("button", { name: "Punch" }).click()
  await page.getByRole("button", { name: "Save settings" }).click()
  await expect(page.getByText("Settings saved")).toBeVisible()
})

test("settings persist and validate", async ({ page }) => {
  await page.goto("/settings")
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 })
  ).toBeVisible()
  await expect(page.getByRole("radio", { name: /Claude/ })).toBeDisabled()
  await expectNoSeriousA11yViolations(page)

  await page.getByLabel("Clips to find").fill("4")
  await page.getByRole("radio", { name: /Draft/ }).check()
  await page.getByRole("switch", { name: "Burn in captions" }).click()
  await page.getByRole("button", { name: "Clean" }).click()
  await page.getByRole("button", { name: "Save settings" }).click()
  await expect(page.getByText("Settings saved")).toBeVisible()

  await page.reload()
  await expect(page.getByLabel("Clips to find")).toHaveValue("4")
  await expect(page.getByRole("radio", { name: /Draft/ })).toBeChecked()
  await expect(
    page.getByRole("switch", { name: "Burn in captions" })
  ).not.toBeChecked()
  await expect(page.getByRole("button", { name: "Clean" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )

  await page.getByLabel("Shortest clip (s)").fill("90")
  await page.getByLabel("Longest clip (s)").fill("30")
  await page.getByRole("button", { name: "Save settings" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "shorter than the maximum" })
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Shortest clip (s)")).not.toHaveValue("90")
})
