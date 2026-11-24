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
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Defaults saved")).toBeVisible()
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
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(page.getByText("Defaults saved")).toBeVisible()

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
  await page.getByRole("button", { name: "Save defaults" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "shorter than the maximum" })
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Shortest clip (s)")).not.toHaveValue("90")
})

test("each project keeps its own settings and offers to re-run", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByLabel("Spoken language").click()
  await page.getByRole("option", { name: "Portuguese" }).click()
  await page.getByLabel("Paste a video link").fill("https://youtu.be/e2e-pt")
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole("button", { name: "Project settings and more" }).click()
  await page.getByRole("menuitem", { name: "Project settings" }).click()
  await expect(page.getByLabel("Spoken language")).toContainText("Portuguese")
  await expect(
    page.getByText("Transcribed as Portuguese (chosen in settings).")
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByLabel("Clips to find").fill("2")
  await page.getByRole("button", { name: "Save project settings" }).click()
  await expect(page.getByText("Find highlights again?")).toBeVisible()
  await page.getByRole("button", { name: "Find highlights again" }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/)
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.goto("/settings")
  await expect(page.getByLabel("Clips to find")).toHaveValue("12")
})
