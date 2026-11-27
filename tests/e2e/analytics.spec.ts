import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"
import { removeYouTubeChannel, seedYouTubeChannel } from "./utils/youtube"

test.beforeAll(seedYouTubeChannel)
test.afterAll(removeYouTubeChannel)

test("imports past Shorts and shows the channel overview", async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto("/analytics/shorts")
  await page.getByRole("button", { name: "Import past Shorts" }).click()

  const table = page
    .getByRole("table")
    .filter({ has: page.getByRole("columnheader", { name: "Title" }) })
  await expect(async () => {
    await page.reload()
    for (const title of [
      "Past short one",
      "Past short two",
      "Past short three",
    ]) {
      const row = table.getByRole("row").filter({ hasText: title })
      await expect(row.getByText("Posted outside Nimbus")).toBeVisible({
        timeout: 2_000,
      })
    }
  }).toPass({ timeout: 60_000 })
  await expect(table.getByText("Past video four")).toHaveCount(0)
  await expect(table.getByText("Past long video")).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)

  await page.goto("/analytics")
  await expect(async () => {
    await page.reload()
    await expect(
      page
        .locator("[data-slot=stat-card]")
        .filter({ hasText: "Views" })
        .first()
        .getByText("11,200", { exact: true })
    ).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 60_000 })
  await expect(
    page
      .getByRole("complementary", { name: "Top Shorts this period" })
      .getByText("Past short three")
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.goto("/channels?tab=insights")
  await expect(page).toHaveURL(/\/analytics\/insights(\?|$)/)
})
