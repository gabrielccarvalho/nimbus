import path from "node:path"

import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("upload a recording and see it probed", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(page.getByTestId("stat-resolution")).toHaveText("1920×1080", {
    timeout: 30_000,
  })
  await expect(page.getByTestId("stat-duration")).toHaveText("0:20")
  await expect(page.getByTestId("stat-aspect")).toHaveText("16:9")
  await expect(
    page.getByRole("listitem").filter({ hasText: "Read the video, completed" })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  const projectPath = new URL(page.url()).pathname
  await page.getByRole("link", { name: "Projects" }).first().click()
  const card = page.getByRole("main").locator(`a[href="${projectPath}"]`)
  await expect(card).toHaveText(path.basename(fixtures.wide, ".mp4"))
  await expectNoSeriousA11yViolations(page)
})

test("rejects a file that isn't a video", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles({
    name: "notes.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("this is not a video at all, just some text"),
  })
  await expect(
    page.getByText(/doesn't look like a supported video/)
  ).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test("deletes a project after confirmation", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.ultrawide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await page.getByRole("button", { name: "Delete project" }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("button", { name: "Delete" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(/Deleted “gameplay-21x9”/)).toBeVisible()
})
