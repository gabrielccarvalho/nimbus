import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

test.describe("signed out, browser in Portuguese", () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: "pt-BR" })

  test("the landing page follows the browser and the selector overrides it", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
    const banner = page.getByRole("banner")
    await expect(banner.getByRole("link", { name: "Entrar" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await banner.getByRole("combobox", { name: "Idioma" }).click()
    await page.getByRole("option", { name: "English" }).click()
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US")
    await expect(
      page.getByRole("heading", { level: 1, name: /Long streams in/ })
    ).toBeVisible()

    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US")

    await page.goto("/login")
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US")
  })

  test("the sign-in page is in Portuguese", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible()
    await expectNoSeriousA11yViolations(page)
  })
})

test.describe("signed in", () => {
  // The account is shared by every spec: leave it in English.
  test.afterEach(async ({ page }) => {
    await page.goto("/settings/profile")
    const language = page.locator("#language")
    if ((await language.textContent())?.includes("Português")) {
      await language.click()
      await page.getByRole("option", { name: "English" }).click()
      await expect(page.locator("html")).toHaveAttribute("lang", "en-US")
    }
  })

  test("the language is a profile setting", async ({ page }) => {
    await page.goto("/settings/profile")
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US")

    await page.getByRole("combobox", { name: "Language" }).click()
    await page.getByRole("option", { name: "Português" }).click()
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
    await expect(
      page.getByRole("heading", { level: 2, name: "Perfil" })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Canais conectados" })
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)

    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
    await expectNoSeriousA11yViolations(page)
  })
})
