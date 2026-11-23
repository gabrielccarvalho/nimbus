import { expect, test } from "@playwright/test"

import { fixtures } from "../../scripts/make-fixtures"
import { expectNoSeriousA11yViolations } from "./utils/axe"

test("detects the webcam and confirms the layout", async ({ page }) => {
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

  await page.getByRole("link", { name: "Layout" }).click()
  await expect(page.getByText(/Webcam found/)).toBeVisible({ timeout: 30_000 })
  expect(warnings.filter((w) => w.includes("Face detection"))).toEqual([])
  const region = page.getByRole("group", { name: "Webcam region" })
  const description = await region.evaluate(
    (el) =>
      document.getElementById(el.getAttribute("aria-describedby")!)!.textContent
  )
  const [left, top] = [...description!.matchAll(/([\d.]+)%/g)].map((m) =>
    Number(m[1])
  )
  expect(left).toBeGreaterThan(76)
  expect(top).toBeGreaterThan(74)

  await region.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(region).toHaveAccessibleDescription(/Left 7[\d.]+%/)
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: "Boxed" }).click()
  await page.getByRole("switch", { name: "Uppercase" }).click()
  await expect(page.locator("[data-slot=caption-preview-text]")).not.toBeEmpty()

  await page.getByRole("button", { name: "Confirm layout" }).click()
  await expect(page.getByText("Layout confirmed")).toBeVisible()
  await expect(page.getByRole("button", { name: "Save layout" })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "Boxed" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByRole("switch", { name: "Uppercase" })).toBeChecked()
  await page.getByRole("link", { name: "Overview" }).click()
  await expect(
    page.getByRole("listitem").filter({ hasText: "Confirm layout, completed" })
  ).toBeVisible()
})
