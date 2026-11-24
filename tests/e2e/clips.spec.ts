import { expect, test, type Page } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

async function uploadAndOpenClips(page: Page, { confirmLayout = false } = {}) {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  if (confirmLayout) {
    await page.getByRole("link", { name: /^Layout & captions/ }).click()
    await expect(page.getByText(/Webcam found/)).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole("button", { name: "Confirm layout" }).click()
    await expect(page.getByText("Layout confirmed")).toBeVisible()
  }
  await page.getByRole("link", { name: "Clips" }).click()
  return page.getByRole("list", { name: "Clips" }).getByRole("button")
}

test("reviews highlight candidates", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await expect(tiles.first()).toHaveAccessibleDescription(/To review/)
  const first = (await tiles.nth(0).getAttribute("data-clip-id"))!
  await expectNoSeriousA11yViolations(page)

  await tiles.first().focus()
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading")).toBeVisible()
  const title = (await dialog.getByRole("heading").textContent())!
  await expect(page.getByRole("dialog", { name: title })).toBeVisible()

  const approve = dialog.getByRole("button", { name: "Approve" })
  await expect(approve).toHaveAttribute("aria-pressed", "false")
  await approve.click()
  await expect(approve).toHaveAttribute("aria-pressed", "true")
  await expect(dialog.getByRole("link", { name: /Edit/ })).toHaveAttribute(
    "href",
    new RegExp(`/clips/${first}$`)
  )
  await expectNoSeriousA11yViolations(page)

  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(tiles.first()).toBeFocused()
  await expect(tiles.first()).toHaveAccessibleName(title)

  await page.reload()
  await expect(tiles.first()).toHaveAccessibleDescription(/Approved/)

  await page.getByTitle(title).click()
  await expect(page.getByRole("dialog", { name: title })).toBeVisible()
})

test("hides rejected clips and finds more highlights", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await expect(tiles.first()).toBeVisible()
  const count = await tiles.count()

  await tiles.first().click()
  const dialog = page.getByRole("dialog")
  const title = (await dialog.getByRole("heading").textContent())!
  const reject = dialog.getByRole("button", { name: "Reject" })
  await reject.click()
  await expect(reject).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(tiles).toHaveCount(count - 1)
  await expect(page.getByText("1 rejected clip hidden")).toBeVisible()

  await page.getByRole("button", { name: "Show rejected" }).click()
  await expect(tiles).toHaveCount(count)
  await expect(
    page.getByRole("button", { name: title, exact: true })
  ).toHaveAccessibleDescription(/Rejected/)
  await page.getByRole("button", { name: "Hide rejected" }).click()

  await page.getByRole("button", { name: "Find more highlights" }).click()
  await expect(page.getByText("Looking for more highlights")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Find more highlights" })
  ).toBeEnabled({ timeout: 30_000 })
  await expect(page.getByText("1 rejected clip hidden")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("adds a zoom effect in the clip editor", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page, { confirmLayout: true })
  await tiles.first().click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByLabel("Title")).toBeVisible()

  const zoomTrack = page.getByRole("group", { name: "Zoom", exact: true })
  const zoomBlocks = zoomTrack.getByRole("button", { name: /^Zoom / })
  const before = await zoomBlocks.count()
  await page.getByRole("button", { name: "Add zoom" }).click()
  await expect(zoomBlocks).toHaveCount(before + 1)

  const name = (await zoomTrack
    .getByRole("button", { pressed: true })
    .getAttribute("aria-label"))!
  expect(name).toMatch(/^Zoom 1\.4× at /)
  const added = zoomTrack.getByRole("button", { name, exact: true })
  const scale = page.getByRole("slider", { name: "Scale" })
  await added.focus()
  await page.keyboard.press("Tab")
  await expect(scale).toBeFocused()
  await expectNoSeriousA11yViolations(page)
  await page.keyboard.press("Shift+Tab")
  await expect(added).toBeFocused()
  await expect(scale).toBeVisible()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: "Delete" })).toBeFocused()
  await page.keyboard.press("Tab")
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-slot="effects-lane"]'))
    )
  ).toBe(true)
  await added.focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Escape")
  await expect(added).toBeFocused()
  await expect(scale).toBeHidden()

  const gameBlocks = page
    .getByRole("group", { name: "Full game", exact: true })
    .getByRole("button", { name: /^Full game at / })
  const gamesBefore = await gameBlocks.count()
  await page.getByRole("button", { name: "Add full game" }).click()
  await expect(gameBlocks).toHaveCount(gamesBefore + 1)

  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Clip saved")).toBeVisible()
  await page.reload()
  await expect(zoomBlocks).toHaveCount(before + 1)
  await expect(gameBlocks).toHaveCount(gamesBefore + 1)
  await expect(
    page.getByRole("main").getByText(/^Edited by hand\./)
  ).toBeVisible()
})

test("moves the gameplay box in the clip editor", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page, { confirmLayout: true })
  await tiles.first().click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByLabel("Title")).toBeVisible()

  const region = page.getByRole("group", { name: "Gameplay region" })
  const describe = () =>
    region.evaluate(
      (el) =>
        document.getElementById(el.getAttribute("aria-describedby")!)!
          .textContent
    )
  const before = await describe()
  const box = (await region.boundingBox())!
  const x = box.x + box.width * 0.25
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 40, y + 10, { steps: 5 })
  await page.mouse.up()
  const after = await describe()
  expect(after).not.toEqual(before)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Clip saved")).toBeVisible()
  await page.reload()
  await expect(region).toBeVisible()
  expect(await describe()).toEqual(after)
  await expect(page.getByText("This clip has its own layout.")).toBeVisible()
})
