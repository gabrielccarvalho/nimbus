import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"
import { E2E_USER } from "./utils/user"

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("protects pages and the API", async ({ page, request }) => {
    await page.goto("/settings")
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/)
    await expect(
      page.getByRole("heading", { name: /Long streams in/ })
    ).toBeVisible()
    await expectNoSeriousA11yViolations(page)
    const api = await request.get("/api/projects/x/events")
    expect(api.status()).toBe(401)
    const upload = await request.post("/api/uploads", { data: "x" })
    expect(upload.status()).toBe(401)
  })

  test("signs in, returns to the page and signs out", async ({ page }) => {
    await page.goto("/settings")
    await page.getByLabel("Email", { exact: true }).fill(E2E_USER.email)
    await page
      .getByLabel("Password", { exact: true })
      .fill("wrong-password-123")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()

    await page.getByLabel("Password", { exact: true }).fill(E2E_USER.password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/settings$/)

    await page.getByRole("button", { name: new RegExp(E2E_USER.name) }).click()
    await page.getByRole("menuitem", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto("/")
    await expect(page).toHaveURL(/\/login$/)
  })

  test("a new account gets its own empty workspace", async ({ page }) => {
    await page.goto("/signup")
    await page.getByLabel("Name", { exact: true }).fill("Second User")
    await page.getByLabel("Email", { exact: true }).fill("second@nimbus.test")
    await page
      .getByLabel("Password", { exact: true })
      .fill("another-long-password")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole("button", { name: /Second's studio/ })
    ).toBeVisible()
    await expect(page.getByText("No recordings yet")).toBeVisible()
  })
})

test("keeps the Claude key encrypted and shows only a hint", async ({
  page,
}) => {
  await page.goto("/settings/security")
  await page.getByRole("button", { name: "Add key" }).click()
  await page
    .getByLabel("Key", { exact: true })
    .fill("sk-ant-api03-e2e-0123456789abcdefghij-a41f")
  await page.getByRole("button", { name: "Save key" }).click()
  await expect(page.getByText("sk-ant-…a41f")).toBeVisible()
  await expect(page.getByText("0123456789abcdefghij")).toHaveCount(0)
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Remove" }).click()
  await expect(page.getByRole("button", { name: "Add key" })).toBeVisible()
})
