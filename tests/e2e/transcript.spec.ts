import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("shows a synced, searchable transcript", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Analyze audio, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("audio-summary")).toHaveText(
    "2 silences · 17% silent"
  )
  await expect(
    page.getByRole("img", {
      name: /Loudness over time with 2 silent stretches/,
    })
  ).toBeVisible()

  await page.getByRole("link", { name: "Transcript" }).click()
  await expect(page.getByText("Wait, what is he doing?")).toBeVisible()
  await expect(page.getByText(/7 lines · \d+ words/)).toBeVisible()

  await page.getByRole("button", { name: "Play from 0:08.5" }).click()
  const slider = page.getByRole("slider", { name: "Seek" })
  await expect(slider).toHaveAttribute("aria-valuenow", "8.5")
  const timeline = page.getByRole("slider", { name: "Timeline" })
  await expect(timeline).toHaveAttribute("aria-valuenow", "8500")
  await timeline.focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(slider).toHaveAttribute("aria-valuenow", "18.5")
  await page.getByRole("button", { name: "Play from 0:08.5" }).click()
  await expect(page.locator("[data-segment][data-active]")).toHaveText(
    /No way!/
  )
  await expect(page.locator("[aria-current=true]")).toHaveText("No")

  await page
    .getByRole("searchbox", { name: "Search transcript" })
    .fill("subscribe")
  await expect(page.getByText("1 of 7 lines match")).toBeVisible()
  await expect(page.getByText("Wait, what is he doing?")).toBeHidden()

  await expectNoSeriousA11yViolations(page)
})

test("explains when the transcript isn't ready", async ({ page }) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.noAudio)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await page.getByRole("link", { name: "Transcript" }).click()
  await expect(page.getByText("No transcript yet")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
