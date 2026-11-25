import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"
import {
  removeYouTubeChannel,
  seedInsightSuggestion,
  seedYouTubeChannel,
} from "./utils/youtube"

const RULE = "Open on the crash, not the build-up"

test.beforeAll(async () => {
  await seedYouTubeChannel()
  await seedInsightSuggestion()
})
test.afterAll(removeYouTubeChannel)

test("approves an insight into the playbook, then retires it", async ({
  page,
}) => {
  await page.goto("/channels")
  await page.getByRole("tab", { name: "Insights" }).click()
  await expect(page.getByText(RULE, { exact: true }).first()).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByRole("button", { name: /^Approve/ }).click()
  const picking = page.getByRole("region", { name: "Picking clips" })
  await expect(picking.getByText(RULE, { exact: true })).toBeVisible()
  await expect(picking.getByText("1 / 12")).toBeVisible()

  await picking.getByRole("button", { name: /^Retire/ }).click()
  await page.getByText(/^Retired \(1\)/).click()
  await expect(page.getByText(RULE, { exact: true })).toBeVisible()
  await expect(picking.getByText("0 / 12")).toBeVisible()
})
