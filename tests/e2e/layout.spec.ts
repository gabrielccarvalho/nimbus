import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("finds the webcam the first time a clip opens", async ({ page }) => {
  const warnings: string[] = []
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      warnings.push(message.text())
  })
  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByRole("link", { name: /^Layout & captions/ })
  ).toHaveCount(0)

  await page.getByRole("link", { name: /^Clips/ }).click()
  await page
    .getByRole("list", { name: "Clips" })
    .getByRole("button")
    .first()
    .click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  expect(warnings.filter((w) => w.includes("Face detection"))).toEqual([])
  const region = page.getByRole("group", { name: "Webcam region" })
  const description = () =>
    region.evaluate(
      (el) =>
        document.getElementById(el.getAttribute("aria-describedby")!)!
          .textContent
    )
  const [left, top] = [...(await description())!.matchAll(/([\d.]+)%/g)].map(
    (m) => Number(m[1])
  )
  expect(left).toBeGreaterThan(76)
  expect(top).toBeGreaterThan(74)

  await region.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(region).toHaveAccessibleDescription(/Left 7[\d.]+%/)
  await expectNoSeriousA11yViolations(page)
  await expect(page.getByTestId("save-state")).toHaveText("Saved")
  const moved = await description()

  await page.reload()
  await expect(region).toBeVisible()
  await page.getByRole("tab", { name: "Layout" }).click()
  await expect(page.getByRole("button", { name: "Find webcam" })).toBeEnabled()
  expect(await description()).toEqual(moved)
})

test("new clips start from the workspace default layout", async ({ page }) => {
  await page.goto("/settings/workspace/layout")
  await page.getByRole("button", { name: /^Even split/ }).click()
  await page
    .getByRole("group", { name: "Webcam goes" })
    .getByRole("button", { name: "At the bottom" })
    .click()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Save layout" }).click()
  await expect(page.getByText("Layout saved")).toBeVisible()

  await page.goto("/")
  await page.locator("input[type=file]").setInputFiles(fixtures.wide)
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })
  await page.getByRole("link", { name: /^Clips/ }).click()
  await page
    .getByRole("list", { name: "Clips" })
    .getByRole("button")
    .first()
    .click()
  await page.getByRole("dialog").getByRole("link", { name: /Edit/ }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole("tab", { name: "Layout" }).click()
  await expect(
    page.getByRole("group", { name: "Mode" }).getByRole("button", {
      name: /^Even split/,
    })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page
      .getByRole("group", { name: "Webcam goes" })
      .getByRole("button", { name: "At the bottom" })
  ).toHaveAttribute("aria-pressed", "true")

  await page.goto("/settings/workspace/layout")
  await page.getByRole("button", { name: /^Webcam on top/ }).click()
  await page
    .getByRole("group", { name: "Webcam goes" })
    .getByRole("button", { name: "On top" })
    .click()
  await page.getByRole("button", { name: "Save layout" }).click()
  await expect(page.getByText("Layout saved")).toBeVisible()
})
