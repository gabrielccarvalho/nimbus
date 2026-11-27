import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("the front door is the landing page", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole("heading", { level: 1, name: /Long streams in/ })
    ).toBeVisible()
    await expect(
      page.getByRole("img", { name: /^A clip being edited/ })
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.getByText("What can I import?").click()
    await expect(page.getByText(/MP4, MOV, MKV or WebM files/)).toBeVisible()

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Get started" })
      .click()
    await expect(page).toHaveURL(/\/signup$/)
  })

  test("the landing page holds together on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await expectNoSeriousA11yViolations(page)
  })
})

test("a signed-in visitor still lands on their projects", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" })
  ).toBeVisible()
})
