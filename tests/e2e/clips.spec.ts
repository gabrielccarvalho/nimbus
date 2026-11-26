import { expect, test, type Page } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

async function uploadAndOpenClips(page: Page) {
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: /^Clips/ }).click()
  return page.getByRole("list", { name: "Clips" }).locator("[data-clip-id]")
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

  // A hidden copy streamed in after the reload can briefly share the title.
  await page
    .getByRole("img", { name: "Clips in the recording" })
    .getByTitle(title)
    .click()
  await expect(page.getByRole("dialog", { name: title })).toBeVisible()
})

test("filters, rejects and approves from the keyboard, then finds more highlights", async ({
  page,
}) => {
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
  const filters = page.getByRole("group", { name: "Filter clips" })
  await expect(
    filters.getByRole("button", { name: "Rejected 1" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: title, exact: true })
  ).toHaveAccessibleDescription(/Rejected/)
  await filters.getByRole("button", { name: /^To review/ }).click()
  await expect(tiles).toHaveCount(count - 1)
  await filters.getByRole("button", { name: "Rejected 1" }).click()
  await expect(tiles).toHaveCount(1)
  await filters.getByRole("button", { name: /^All/ }).click()
  await expect(tiles).toHaveCount(count)

  const rejected = page.getByRole("button", { name: title, exact: true })
  await rejected.focus()
  await page.keyboard.press("x")
  await expect(rejected).toHaveAccessibleDescription(/To review/)
  await page.keyboard.press("a")
  await expect(rejected).toHaveAccessibleDescription(/Approved/)
  await page.keyboard.press("a")
  await expect(rejected).toHaveAccessibleDescription(/To review/)
  await page.keyboard.press("x")
  await expect(rejected).toHaveAccessibleDescription(/Rejected/)

  await page.getByRole("button", { name: "Find more highlights" }).click()
  await expect(page.getByText("Looking for more highlights")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Find more highlights" })
  ).toBeEnabled({ timeout: 30_000 })
  await expect(
    page
      .getByRole("group", { name: "Filter clips" })
      .getByRole("button", { name: "Rejected 1" })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("adds a zoom effect in the clip editor", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })

  const timeline = page.getByRole("region", { name: "Timeline" })
  const addEffect = async (name: string) => {
    await timeline.getByRole("button", { name: "Effect", exact: true }).click()
    await page.getByRole("menuitem", { name, exact: true }).click()
  }
  const zoomBlocks = timeline.getByRole("button", { name: /^Zoom 1\.4× at / })
  const before = await zoomBlocks.count()
  await addEffect("Zoom")
  await expect(zoomBlocks).toHaveCount(before + 1)

  const name = (await timeline
    .getByRole("button", { name: /^Zoom /, pressed: true })
    .getAttribute("aria-label"))!
  expect(name).toMatch(/^Zoom 1\.4× at /)
  const added = timeline.getByRole("button", { name, exact: true })
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
  await expect(
    page.getByRole("button", { name: "Delete", exact: true })
  ).toBeFocused()
  await page.keyboard.press("Tab")
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-slot="clip-timeline"]'))
    )
  ).toBe(true)
  await added.focus()
  await page.keyboard.press("Tab")
  await page.keyboard.press("Escape")
  await expect(added).toBeFocused()
  await expect(scale).toBeHidden()

  const gameBlocks = timeline.getByRole("button", { name: /^Full game at / })
  const gamesBefore = await gameBlocks.count()
  await addEffect("Full game")
  await expect(gameBlocks).toHaveCount(gamesBefore + 1)

  const lanes = timeline.getByRole("group", { name: /^Effects track / })
  const lanesBefore = await lanes.count()
  await timeline.getByRole("button", { name: "Track", exact: true }).click()
  await page.getByRole("menuitem", { name: "Effects track" }).click()
  await expect(lanes).toHaveCount(lanesBefore + 1)
  const newLane = timeline.getByRole("group", {
    name: `Effects track ${lanesBefore + 1}`,
  })
  const from = (await added.boundingBox())!
  const to = (await newLane.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, {
    steps: 6,
  })
  await page.mouse.up()
  await expect(newLane.getByRole("button", { name: /^Zoom / })).toHaveCount(1)

  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await page.reload()
  await expect(zoomBlocks).toHaveCount(before + 1)
  await expect(gameBlocks).toHaveCount(gamesBefore + 1)
  await expect(
    timeline
      .getByRole("group", { name: `Effects track ${lanesBefore + 1}` })
      .getByRole("button", { name: /^Zoom / })
  ).toHaveCount(1)
  await expectNoSeriousA11yViolations(page)
})

test("moves the gameplay box in the clip editor", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })

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

  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await page.reload()
  await expect(region).toBeVisible()
  expect(await describe()).toEqual(after)
})

test("places this clip's captions by hand", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })

  const caption = page.getByRole("slider", { name: "Caption position" })
  await caption.focus()
  const before = Number(await caption.getAttribute("aria-valuenow"))
  await page.keyboard.press("Shift+ArrowUp")
  await expect(caption).toHaveAttribute("aria-valuenow", String(before - 5))
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await page.reload()
  await expect(caption).toHaveAttribute("aria-valuenow", String(before - 5))
  await page.getByRole("tab", { name: "Captions" }).click()
  await expect(
    page
      .getByRole("group", { name: "Position", exact: true })
      .getByRole("button", { name: "Custom" })
  ).toHaveAttribute("aria-pressed", "true")
})
