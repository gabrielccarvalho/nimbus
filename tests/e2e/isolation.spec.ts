import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"

test("another account can't see or reach this account's projects", async ({
  page,
  browser,
}) => {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  const projectPath = new URL(page.url()).pathname
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: /^Clips/ }).click()
  const tile = page.locator("[data-clip-id]").first()
  const clipId = (await tile.getAttribute("data-clip-id"))!
  const media = (await page.locator("video").first().getAttribute("src"))!
  const mediaPath = media.split("#")[0]!
  expect((await page.request.get(mediaPath)).status()).toBe(200)
  await page.keyboard.press("ControlOrMeta+k")
  await page.keyboard.type("gameplay")
  await expect(
    page
      .getByRole("dialog", { name: "Search" })
      .getByRole("option", { name: /gameplay-16x9/ })
      .first()
  ).toBeVisible()
  await page.keyboard.press("Escape")

  const other = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const intruder = await other.newPage()
  await intruder.goto("/signup")
  await intruder.getByLabel("Name", { exact: true }).fill("Other Person")
  await intruder
    .getByLabel("Email", { exact: true })
    .fill(`other-${Date.now()}@nimbus.test`)
  await intruder
    .getByLabel("Password", { exact: true })
    .fill("a-different-long-password")
  await intruder.getByRole("button", { name: "Create account" }).click()
  await expect(intruder).toHaveURL(/\/$/)

  await expect(intruder.getByText("No recordings yet")).toBeVisible()
  await expect(intruder.locator(`a[href="${projectPath}"]`)).toHaveCount(0)

  for (const path of [
    projectPath,
    `${projectPath}/clips`,
    `${projectPath}/clips/${clipId}`,
    `${projectPath}/transcript`,
  ]) {
    const response = await intruder.goto(path)
    expect(response?.status(), path).toBe(404)
  }

  for (const path of [
    mediaPath,
    `/api${projectPath}/events`,
    `/api${projectPath}/export`,
  ]) {
    expect((await intruder.request.get(path)).status(), path).toBe(404)
  }

  await intruder.goto("/")
  const palette = intruder.getByRole("dialog", { name: "Search" })
  // goto resolves on load, before React attaches the hotkey listener.
  await expect(async () => {
    await intruder.keyboard.press("ControlOrMeta+k")
    await expect(palette).toBeVisible({ timeout: 1_000 })
  }).toPass()
  await intruder.keyboard.type("gameplay")
  await expect(
    palette.getByRole("option", { name: /gameplay-16x9/ })
  ).toHaveCount(0)

  await other.close()
})
