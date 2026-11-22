import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("upload, confirm layout, render, download and edit a clip", async ({
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

  await page.getByRole("link", { name: "Layout" }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Confirm layout" }).click()
  await expect(page.getByText("Layout confirmed")).toBeVisible()

  await page.getByRole("link", { name: "Clips" }).click()
  const first = page
    .getByRole("list", { name: "Clip candidates" })
    .getByRole("listitem")
    .first()
  await first.getByRole("button", { name: "Approve" }).click()
  await expect(first).toContainText("Approved")
  await page.getByRole("button", { name: "Render approved clips" }).click()
  await expect(first).toContainText("Rendered", { timeout: 120_000 })

  const download = first.getByRole("link", { name: /Download/ })
  const clipResponse = await page.request.get(
    (await download.getAttribute("href"))!
  )
  expect(clipResponse.status()).toBe(200)
  expect(clipResponse.headers()["content-type"]).toBe("video/mp4")
  expect(clipResponse.headers()["content-disposition"]).toMatch(/attachment/)
  expect((await clipResponse.body()).length).toBeGreaterThan(100_000)

  const zip = await page.request.get(`/api${projectPath}/export`)
  expect(zip.status()).toBe(200)
  expect((await zip.body()).subarray(0, 2).toString()).toBe("PK")
  await expect(page.getByRole("link", { name: "Download all" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await first.getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByLabel("Title")).toBeVisible()
  await expect(page.getByTestId("clip-status")).toHaveText("Up to date")
  await expect(
    page.getByRole("img", { name: "Vertical preview with captions" })
  ).toBeVisible()
  await expect(page.getByRole("list", { name: "Caption text" })).toBeVisible()
  await page.getByLabel("Title").fill("My best moment")
  await page
    .getByLabel("Caption 1", { exact: false })
    .first()
    .fill("Edited caption")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("Clip saved")).toBeVisible()
  await expect(page.getByTestId("clip-status")).toHaveText("Out of date")
  await expect(
    page.getByRole("heading", { name: "My best moment" })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
