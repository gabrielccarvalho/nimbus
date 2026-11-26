import { readFile } from "node:fs/promises"

import { expect, test } from "@playwright/test"

import { defaultOverlayText } from "../../features/captions/overlay"
import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"
import { removeYouTubeChannel, seedYouTubeChannel } from "./utils/youtube"

test.beforeAll(seedYouTubeChannel)
test.afterAll(removeYouTubeChannel)

test("puts a track and a hook title under a clip and renders it", async ({
  page,
}) => {
  test.setTimeout(240_000)

  await page.goto("/settings/workspace/music")
  const upload = page.getByRole("button", { name: "Upload a track" })
  const chooser = page.waitForEvent("filechooser")
  await upload.click()
  await (await chooser).setFiles(fixtures.tone)
  const library = page.getByRole("region", { name: "Music library" })
  await expect(
    library.getByRole("textbox", { name: "Track title" })
  ).toHaveValue("tone-880hz")
  await expect(library.getByText(/^0:30 · /)).toBeVisible({ timeout: 30_000 })
  await expectNoSeriousA11yViolations(page)

  const rejected = page.waitForEvent("filechooser")
  await upload.click()
  await (
    await rejected
  ).setFiles({
    name: "song.mp3",
    mimeType: "audio/mpeg",
    buffer: await readFile(fixtures.notVideo),
  })
  await expect(
    page.getByText("Upload an MP3, M4A, AAC, WAV, OGG or FLAC file")
  ).toBeVisible()

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
  await page
    .getByRole("list", { name: "Clips" })
    .locator("[data-clip-id]")
    .first()
    .click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByLabel("Title")).toBeVisible()
  const editor = page.url()
  const title = await page.getByLabel("Title").inputValue()
  const hook = await page.getByLabel("Hook").inputValue()

  await page.getByRole("tab", { name: "Audio & text" }).click()
  await page.getByLabel("Track").click()
  await page.getByRole("option", { name: "tone-880hz · 0:30" }).click()
  await page.getByRole("switch", { name: "Show text on the video" }).click()
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    defaultOverlayText(hook, title)
  )
  const saveState = page.getByTestId("save-state")
  await expect(saveState).toHaveText("Saved")
  await expectNoSeriousA11yViolations(page)

  await page.goto("/settings/workspace/music")
  await page.getByRole("button", { name: "Delete tone-880hz" }).click()
  await page.getByRole("button", { name: "Delete track" }).click()
  await expect(
    page.getByText(
      `This track is under “${title}”. Remove it from that clip first.`
    )
  ).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(
    library.getByRole("textbox", { name: "Track title" })
  ).toHaveValue("tone-880hz")

  await page.goto(editor)
  await page.getByRole("button", { name: "Render this clip" }).click()
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Up to date",
    { timeout: 120_000 }
  )
  const publish = page.getByRole("button", { name: "Publish", exact: true })
  await expect(publish).toBeEnabled()
  await publish.click()
  const form = page.getByRole("dialog", { name: "Publish to YouTube" })
  await expect(form.getByText("Check the music rights")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.keyboard.press("Escape")
  await expect(form).toBeHidden()

  await page.getByRole("tab", { name: "Audio & text" }).click()
  await page.getByRole("slider", { name: "Music volume" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(saveState).toHaveText("Saved")
  await expect(publish).toBeDisabled()
  await expect(page.getByText("Render the latest edit first")).toBeVisible()
})
