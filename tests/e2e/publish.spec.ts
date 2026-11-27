import { expect, test, type Page } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"
import { removeYouTubeChannel, seedYouTubeChannel } from "./utils/youtube"

async function renderFirstClip(page: Page) {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: /^Clips/ }).click()
  await page.getByRole("button", { name: /Approve all/ }).click()
  const first = page
    .getByRole("list", { name: "Clips" })
    .locator("[data-clip-id]")
    .first()
  await expect(first).toHaveAccessibleDescription(/Approved/)
  await page.getByRole("button", { name: "Render approved clips" }).click()
  await expect(first).toHaveAccessibleDescription(/Rendered/, {
    timeout: 120_000,
  })
  return first
}

test.beforeAll(seedYouTubeChannel)
test.afterAll(removeYouTubeChannel)

test("publishes a rendered clip to YouTube", async ({ page }) => {
  test.setTimeout(240_000)
  const tile = await renderFirstClip(page)

  await tile.dblclick()
  await page.getByRole("button", { name: "More export options" }).click()
  await page.getByRole("menuitem", { name: /^Publish to YouTube…/ }).click()
  const form = page.getByRole("dialog", { name: "Publish to YouTube" })
  await expect(form).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await form.getByLabel("Title").fill("E2E published short")
  await form.getByRole("button", { name: "Publish to YouTube" }).click()
  await expect(form).toBeHidden()
  await page.getByRole("link", { name: "Back to clips" }).click()

  const link = page.getByRole("link", { name: /^Published/ })
  await expect(link).toHaveAttribute(
    "href",
    /^https:\/\/youtube\.com\/shorts\/fake-\d+$/,
    { timeout: 60_000 }
  )

  await tile.dblclick()
  await page.getByRole("button", { name: "More export options" }).click()
  await expect(
    page.getByRole("menuitem", { name: /^Published on YouTube/ })
  ).toHaveAttribute("href", /^https:\/\/youtube\.com\/shorts\/fake-\d+$/)
  await expect(
    page.getByRole("menuitem", { name: /^Publish (again|to YouTube)…/ })
  ).toHaveCount(0)
  await page.keyboard.press("Escape")
  const stats = page.getByLabel("YouTube stats")
  await stats.getByRole("button", { name: "Refresh stats" }).click()
  await expect(stats.getByText("1,234 views")).toBeVisible({ timeout: 60_000 })
  await expectNoSeriousA11yViolations(page)

  await page.goto("/analytics/shorts")
  await expect(
    page
      .getByRole("table")
      .filter({ has: page.getByRole("columnheader", { name: "Title" }) })
      .getByText("E2E published short")
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("an edited clip can't be published until it is rendered again", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const tile = await renderFirstClip(page)

  await tile.dblclick()
  const more = page.getByRole("button", { name: "More export options" })
  const publish = page.getByRole("menuitem", { name: /^Publish to YouTube…/ })
  await more.click()
  await expect(publish).toBeEnabled()
  await page.keyboard.press("Escape")

  await page
    .getByRole("region", { name: "Timeline" })
    .getByRole("button", { name: "Add", exact: true })
    .click()
  await page.getByRole("menuitem", { name: "Effect", exact: true }).click()
  await page.getByRole("menuitem", { name: "Zoom", exact: true }).click()
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Edited since last render"
  )
  await more.click()
  await expect(publish).toBeDisabled()
  await expect(publish).toContainText("Render the latest edit first")
})
