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
  const title = (await tiles
    .first()
    .evaluate(
      (el) =>
        document.getElementById(el.getAttribute("aria-labelledby")!)!
          .textContent
    ))!
  await expectNoSeriousA11yViolations(page)

  await tiles.first().focus()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(new RegExp(`/clips/${first}$`))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title)
  await expect(page.getByRole("dialog")).toHaveCount(0)

  const decision = page.getByRole("group", { name: "Review decision" })
  await decision.getByRole("button", { name: "Approve" }).click()
  await expect(
    decision.getByRole("button", { name: "Approved" })
  ).toHaveAttribute("aria-pressed", "true")
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("link", { name: "Back to clips" }).click()
  await expect(tiles.first()).toHaveAccessibleName(title)
  await expect(tiles.first()).toHaveAccessibleDescription(/Approved/)

  // A hidden copy streamed in after the reload can briefly share the title.
  await page
    .getByRole("img", { name: "Clips in the recording" })
    .getByTitle(title)
    .click()
  await expect(page).toHaveURL(new RegExp(`/clips/${first}$`))
})

test("drives the editor from the keyboard", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("save-state")).toHaveText("Saved")

  const decision = page.getByRole("group", { name: "Review decision" })
  await page.keyboard.press("a")
  await expect(
    decision.getByRole("button", { name: "Approved" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(decision.getByRole("button", { name: "Approved" })).toBeEnabled()
  await page.keyboard.press("x")
  await expect(
    decision.getByRole("button", { name: "Rejected" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(decision.getByRole("button", { name: "Rejected" })).toBeEnabled()
  await page.keyboard.press("x")
  await expect(
    decision.getByRole("button", { name: "Reject", exact: true })
  ).toHaveAttribute("aria-pressed", "false")

  const playback = page.getByRole("group", { name: "Playback" })
  await page.keyboard.press("Space")
  await expect(playback.getByRole("button", { name: /^Pause/ })).toBeVisible()
  await page.keyboard.press("Space")
  await expect(playback.getByRole("button", { name: /^Play/ })).toBeVisible()

  const timeline = page.getByRole("region", { name: "Timeline" })
  const texts = timeline
    .getByRole("group", { name: "Text track 1" })
    .getByRole("button")
  await timeline.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Text", exact: true }).click()
  await expect(texts).toHaveCount(1)
  await page.keyboard.press("Escape")
  await page.keyboard.press("ControlOrMeta+z")
  await expect(texts).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+Shift+z")
  await expect(texts).toHaveCount(1)
  await texts.first().click()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Delete")
  await expect(texts).toHaveCount(0)

  await page.getByRole("switch", { name: "Safe zones" }).click()
  await expect(page.getByTestId("safe-zones")).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.setViewportSize({ width: 1100, height: 900 })
  await expect(page.getByRole("tab", { name: "Details" })).toHaveCount(0)
  await page.getByRole("button", { name: "Clip settings" }).click()
  const drawer = page.getByRole("dialog", { name: "Clip settings" })
  await expect(drawer.getByRole("tab", { name: "Details" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("filters, rejects and approves from the keyboard, then finds more highlights", async ({
  page,
}) => {
  const tiles = await uploadAndOpenClips(page)
  await expect(tiles.first()).toBeVisible()
  const count = await tiles.count()

  const title = (await tiles
    .first()
    .evaluate(
      (el) =>
        document.getElementById(el.getAttribute("aria-labelledby")!)!
          .textContent
    ))!
  await page
    .getByRole("list", { name: "Clips" })
    .getByRole("listitem")
    .first()
    .getByRole("button", { name: "Reject clip" })
    .click()
  const filters = page.getByRole("group", { name: "Filter clips" })
  await expect(
    filters.getByRole("button", { name: "Rejected 1" })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: title, exact: true })
  ).toHaveAccessibleDescription(/Rejected/)
  await filters.getByRole("button", { name: /^To review/ }).click()
  await expect(tiles).toHaveCount(count - 1)
  await filters.getByRole("button", { name: "Rejected 1" }).click()
  await expect(tiles).toHaveCount(1)
  await filters.getByRole("button", { name: /^All/ }).click()
  await expect(tiles).toHaveCount(count)

  const rejected = page.getByRole("link", { name: title, exact: true })
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
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })

  const timeline = page.getByRole("region", { name: "Timeline" })
  const add = async (...path: string[]) => {
    await timeline.getByRole("button", { name: "Add", exact: true }).click()
    for (const name of path)
      await page.getByRole("menuitem", { name, exact: true }).click()
  }
  const zoomBlocks = timeline.getByRole("button", { name: /^Zoom 1\.4× at / })
  const before = await zoomBlocks.count()
  await add("Effect", "Zoom")
  await expect(zoomBlocks).toHaveCount(before + 1)

  const name = (await timeline
    .getByRole("button", { name: /^Zoom /, pressed: true })
    .getAttribute("aria-label"))!
  expect(name).toMatch(/^Zoom 1\.4× at /)
  const added = timeline.getByRole("button", { name, exact: true })
  await page.getByRole("slider", { name: "Strength" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(
    timeline.getByRole("button", { name: /^Zoom 1\.5× at /, pressed: true })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.keyboard.press("ArrowLeft")
  await expect(added.first()).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")

  const gameBlocks = timeline.getByRole("button", { name: /^Full game at / })
  const gamesBefore = await gameBlocks.count()
  await add("Effect", "Full game")
  await expect(gameBlocks).toHaveCount(gamesBefore + 1)

  const lanes = timeline.getByRole("group", { name: /^Effects track / })
  const lanesBefore = await lanes.count()
  await add("Track", "Effects track")
  await expect(lanes).toHaveCount(lanesBefore + 1)
  const newLane = timeline.getByRole("group", {
    name: `Effects track ${lanesBefore + 1}`,
  })
  await newLane.scrollIntoViewIfNeeded()
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

test("starts the timeline at the clip and moves it without a scrollbar", async ({
  page,
}) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()

  const timeline = page.getByRole("region", { name: "Timeline" })
  const scroller = page.getByTestId("timeline-scroller")
  await scroller.scrollIntoViewIfNeeded()
  await expect(scroller).toHaveCSS("overflow-x", "hidden")
  const view = (await scroller.boundingBox())!
  const clipLeft = async () =>
    (await timeline.getByRole("group", { name: "Text track 1" }).boundingBox())!
      .x - view.x
  await expect.poll(clipLeft).toBeCloseTo(32, 0)

  const axisWidth = () =>
    scroller.evaluate(
      (node) => node.firstElementChild!.getBoundingClientRect().width
    )
  const widthBefore = await axisWidth()
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2)
  await page.mouse.wheel(0, -200)
  await expect.poll(axisWidth).toBeGreaterThan(widthBefore)

  const handle = timeline.getByRole("scrollbar", { name: "Timeline position" })
  const scrolled = () => scroller.evaluate((node) => node.scrollLeft)
  const scrolledBefore = await scrolled()
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y, { steps: 4 })
  await page.mouse.up()
  expect(await scrolled()).toBeGreaterThan(scrolledBefore)

  await timeline.getByRole("button", { name: "Fit" }).click()
  await expect.poll(clipLeft).toBeCloseTo(32, 0)
  await expectNoSeriousA11yViolations(page)
})

test("adds a text where a track is hovered and resizes the timeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()

  const timeline = page.getByRole("region", { name: "Timeline" })
  const dockHeight = async () => (await timeline.boundingBox())!.height
  const filled = await dockHeight()
  expect(filled).toBeGreaterThan(296)
  const edge = page.getByRole("separator", { name: "Resize timeline" })
  const grip = (await edge.boundingBox())!
  await page.mouse.move(grip.x + 300, grip.y + 4)
  await page.mouse.down()
  await page.mouse.move(grip.x + 300, grip.y + 64, { steps: 4 })
  await page.mouse.up()
  await expect.poll(dockHeight).toBeCloseTo(filled - 60, -1)

  const lane = timeline.getByRole("group", { name: "Text track 1" })
  const box = (await lane.boundingBox())!
  await page.mouse.move(box.x + 200, box.y + box.height / 2)
  await expect(lane.locator("[data-slot=timeline-spot]")).toHaveText("Text")
  await page.mouse.down()
  await page.mouse.up()
  await expect(lane.getByRole("button", { pressed: true })).toHaveCount(1)
  await expect(page.getByRole("textbox", { name: "Text" })).toBeVisible()

  await page.keyboard.press("Escape")
  const effects = timeline.getByRole("group", { name: "Effects track 1" })
  const row = (await effects.boundingBox())!
  await page.mouse.click(row.x + 8, row.y + row.height / 2)
  await page.getByRole("menuitem", { name: "Shake" }).click()
  await expect(
    effects.getByRole("button", { name: /^Shake light at 0:00/ })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await expectNoSeriousA11yViolations(page)
})

test("moves the gameplay box in the clip editor", async ({ page }) => {
  const tiles = await uploadAndOpenClips(page)
  await tiles.first().click()
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
  await page.getByRole("button", { name: "Edit style" }).click()
  await expect(
    page
      .getByRole("group", { name: "Position", exact: true })
      .getByRole("button", { name: "Custom" })
  ).toHaveAttribute("aria-pressed", "true")
})
