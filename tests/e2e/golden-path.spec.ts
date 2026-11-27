import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("upload, find the webcam, render, download and edit a clip", async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  const projectPath = new URL(page.url()).pathname
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole("link", { name: /^Clips/ }).click()
  const first = page
    .getByRole("list", { name: "Clips" })
    .locator("[data-clip-id]")
    .first()
  await first.dblclick()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Not rendered"
  )
  const decision = page.getByRole("group", { name: "Review decision" })
  await decision.getByRole("button", { name: "Approve" }).click()
  await expect(
    decision.getByRole("button", { name: "Approved" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("link", { name: "Back to clips" }).click()
  await expect(first).toHaveAccessibleDescription(/Approved/)
  await page.getByRole("button", { name: "Render approved clips" }).click()
  await expect(first).toHaveAccessibleDescription(/Rendered/, {
    timeout: 120_000,
  })

  await first.dblclick()
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Rendered"
  )
  await page.getByRole("button", { name: "More export options" }).click()
  const download = page.getByRole("menuitem", { name: "Download last render" })
  const clipResponse = await page.request.get(
    (await download.getAttribute("href"))!
  )
  expect(clipResponse.status()).toBe(200)
  expect(clipResponse.headers()["content-type"]).toBe("video/mp4")
  expect(clipResponse.headers()["content-disposition"]).toMatch(/attachment/)
  expect((await clipResponse.body()).length).toBeGreaterThan(100_000)

  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Back to clips" }).click()

  const zip = await page.request.get(`/api${projectPath}/export`)
  expect(zip.status()).toBe(200)
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK")
  await expect(page.getByRole("link", { name: "Download all" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await first.dblclick()
  await expect(page.getByLabel("Title")).toBeVisible()
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Rendered"
  )
  await expect(page.getByRole("button", { name: "Re-render" })).toBeEnabled()
  await expect(
    page.getByRole("group", { name: "Vertical preview with captions" })
  ).toBeVisible()
  const saveState = page.getByTestId("save-state")
  await page.getByLabel("Title").fill("My best moment")
  await page.getByRole("tab", { name: "Layout" }).click()
  const layoutMode = page.getByRole("group", { name: "Mode" })
  await layoutMode.getByRole("button", { name: "Split" }).click()
  await expect(page.getByRole("group", { name: "Webcam region" })).toBeVisible()
  await page
    .getByRole("group", { name: "Webcam goes" })
    .getByRole("button", { name: "At the bottom" })
    .click()
  await page
    .getByRole("group", { name: "Captions track", exact: true })
    .getByRole("button", { name: /^Caption / })
    .first()
    .click()
  await page.getByLabel("Caption text").fill("Edited caption")
  await expect(
    page
      .getByRole("group", { name: "Captions track", exact: true })
      .getByRole("button", { name: /^Caption Edited caption at / })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("tab", { name: "Captions" }).click()
  await page.getByRole("button", { name: "Show captions later" }).click()
  await page.getByRole("button", { name: "Edit style" }).click()
  await page
    .getByRole("group", { name: "Position", exact: true })
    .getByRole("button", { name: "Top" })
    .click()
  await expect(saveState).toHaveText("Saved")
  await page.reload()
  await page.getByRole("tab", { name: "Captions" }).click()
  await page.getByRole("button", { name: "Edit style" }).click()
  await expect(
    page
      .getByRole("group", { name: "Position", exact: true })
      .getByRole("button", { name: "Top" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("tab", { name: "Layout" }).click()
  await expect(
    page
      .getByRole("group", { name: "Webcam goes" })
      .getByRole("button", { name: "At the bottom" })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("main").getByTestId("clip-status")).toHaveText(
    "Edited since last render"
  )
  await expect(
    page.getByRole("heading", { name: "My best moment" })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
