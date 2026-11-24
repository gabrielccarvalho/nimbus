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
  await page.getByRole("button", { name: "Collapse sidebar" }).click()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await page.reload()
  await expect(sidebar).toHaveAttribute("data-state", "collapsed")
  await page.getByRole("button", { name: "Expand sidebar" }).click()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
  await page.reload()
  await expect(sidebar).toHaveAttribute("data-state", "expanded")
})

test("command palette jumps to a page", async ({ page }) => {
  await page.goto("/")
  await page.keyboard.press("ControlOrMeta+k")
  const palette = page.getByRole("dialog", { name: "Search" })
  await expect(palette).toBeVisible()
  await page.keyboard.type("settings")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/settings$/)
  await expect(palette).toBeHidden()
})

test("is always dark and keyboard navigation works", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
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

test("unknown pages show a styled 404", async ({ page }) => {
  const response = await page.goto("/does-not-exist")
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Page not found" })
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "All projects" })).toBeVisible()
  await expectNoSeriousA11yViolations(page)
})
