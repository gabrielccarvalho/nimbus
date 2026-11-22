import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

test("navigates between projects and settings", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Settings" }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(
    page.getByRole("navigation", { name: "breadcrumb" }).getByText("Settings")
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})

test("sidebar collapse state persists across reloads", async ({ page }) => {
  await page.goto("/")
  const sidebar = page.locator("[data-slot=sidebar][data-state]")
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await page.reload()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await page.reload()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
})

test("theme toggle and keyboard navigation work", async ({ page }) => {
  await page.goto("/")
  const html = page.locator("html")
  const before = (await html.getAttribute("class")) ?? ""
  await page.getByRole("button", { name: "Toggle dark mode" }).click()
  await expect(html).not.toHaveClass(before)
  await page.reload()
  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: "Skip to content" })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main")).toBeFocused()
  await expectNoSeriousA11yViolations(page)
})

test("unknown projects show not found", async ({ page }) => {
  const response = await page.goto("/projects/does-not-exist")
  expect(response?.status()).toBe(404)
})
