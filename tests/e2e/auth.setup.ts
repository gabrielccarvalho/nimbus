import { expect, test as setup } from "@playwright/test"

import { STORAGE_STATE } from "../../playwright.config"
import { E2E_USER } from "./utils/user"

setup("sign up the e2e user", async ({ page }) => {
  await page.goto("/signup")
  await page.getByLabel("Name", { exact: true }).fill(E2E_USER.name)
  await page.getByLabel("Email", { exact: true }).fill(E2E_USER.email)
  await page.getByLabel("Password", { exact: true }).fill(E2E_USER.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole("button", { name: new RegExp(E2E_USER.name) })
  ).toBeVisible()
  await page.context().storageState({ path: STORAGE_STATE })
})
