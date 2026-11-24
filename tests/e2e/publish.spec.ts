import { expect, test, type Page } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"
import { seedYouTubeChannel } from "./utils/youtube"

async function renderFirstClip(page: Page) {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: /^Layout & captions/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Confirm layout" }).click()
  await expect(page.getByText("Layout confirmed")).toBeVisible()
  await page.getByRole("link", { name: "Clips" }).click()
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

test("publishes a rendered clip to YouTube", async ({ page }) => {
  test.setTimeout(240_000)
  const tile = await renderFirstClip(page)

  await tile.click()
  const player = page.getByRole("dialog")
  await player.getByRole("button", { name: "Publish", exact: true }).click()
  const form = page.getByRole("dialog", { name: "Publish to YouTube" })
  await expect(form).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await form.getByLabel("Title").fill("E2E published short")
  await form.getByRole("button", { name: "Publish to YouTube" }).click()
  await expect(form).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(player).toBeHidden()

  const link = page.getByRole("link", { name: /^Published/ })
  await expect(link).toHaveAttribute(
    "href",
    "https://youtube.com/shorts/fake-1",
    { timeout: 60_000 }
  )
})

test("an edited clip can't be published until it is rendered again", async ({
  page,
}) => {
  test.setTimeout(240_000)
  const tile = await renderFirstClip(page)

  await tile.click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  const publish = page.getByRole("button", { name: "Publish", exact: true })
  await expect(publish).toBeEnabled()

  await page.getByRole("button", { name: "Add zoom" }).click()
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await expect(publish).toBeDisabled()
  await expect(page.getByText("Render the latest edit first")).toBeVisible()
})
