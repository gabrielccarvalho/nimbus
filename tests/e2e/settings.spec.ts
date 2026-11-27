import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

const DEFAULTS = "/settings/workspace/defaults"
const CAPTIONS = "/settings/workspace/captions"
const RENDERING = "/settings/workspace/rendering"

test.afterEach(async ({ page }) => {
  await page.goto(DEFAULTS)
  await page.getByLabel("Shortest clip (s)").fill("15")
  await page.getByLabel("Longest clip (s)").fill("60")
  await page.getByLabel("Clips to find").fill("12")
  await page.getByRole("button", { name: "Save project defaults" }).click()
  await expect(page.getByText("Project defaults saved")).toBeVisible()

  await page.goto(RENDERING)
  await page.getByRole("radio", { name: /Standard/ }).check()
  await page.getByRole("button", { name: "Save rendering" }).click()
  await expect(page.getByText("Rendering saved")).toBeVisible()

  await page.goto(CAPTIONS)
  const captions = page.getByRole("switch", { name: "Burn in captions" })
  if (!(await captions.isChecked())) await captions.click()
  await page.getByRole("button", { name: "Punch" }).click()
  await page.getByRole("button", { name: "Save captions" }).click()
  await expect(page.getByText("Captions saved")).toBeVisible()
})

test("workspace settings persist and validate", async ({ page }) => {
  await page.goto("/settings")
  await expect(page).toHaveURL(/\/settings\/profile$/)
  const nav = page.getByRole("navigation", { name: "Settings sections" })
  await nav.getByRole("link", { name: "Project defaults" }).click()
  await expect(page).toHaveURL(new RegExp(`${DEFAULTS}$`))
  await expect(page.getByRole("radio", { name: /Claude/ })).toBeDisabled()
  await expectNoSeriousA11yViolations(page)

  await page.getByLabel("Clips to find").fill("4")
  await page.getByRole("button", { name: "Save project defaults" }).click()
  await expect(page.getByText("Project defaults saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Clips to find")).toHaveValue("4")

  await page.getByLabel("Shortest clip (s)").fill("90")
  await page.getByLabel("Longest clip (s)").fill("30")
  await page.getByRole("button", { name: "Save project defaults" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "shorter than the maximum" })
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Shortest clip (s)")).not.toHaveValue("90")

  await nav.getByRole("link", { name: "Rendering" }).click()
  await page.getByRole("radio", { name: /Draft/ }).check()
  await page.getByRole("button", { name: "Save rendering" }).click()
  await expect(page.getByText("Rendering saved")).toBeVisible()
  await page.reload()
  await expect(page.getByRole("radio", { name: /Draft/ })).toBeChecked()
})

test("workspace caption defaults: style, font and position", async ({
  page,
}) => {
  await page.goto(CAPTIONS)
  await expect(
    page.getByRole("group", { name: "Caption preview" })
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Clean" }).click()
  await page
    .getByRole("group", { name: "Position", exact: true })
    .getByRole("button", { name: "Top" })
    .click()
  await page.getByRole("switch", { name: "Burn in captions" }).click()
  await page.getByRole("button", { name: "Save captions" }).click()
  await expect(page.getByText("Captions saved")).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole("switch", { name: "Burn in captions" })
  ).not.toBeChecked()
  await page.getByRole("switch", { name: "Burn in captions" }).click()
  await expect(page.getByRole("button", { name: "Clean" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(
    page
      .getByRole("group", { name: "Position", exact: true })
      .getByRole("button", { name: "Top" })
  ).toHaveAttribute("aria-pressed", "true")
})

test("each project keeps its own settings and offers to re-run", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByLabel("Language", { exact: true }).click()
  await page.getByRole("option", { name: "Portuguese" }).click()
  await page.getByLabel("Paste a video link").fill("https://youtu.be/e2e-pt")
  await page.getByRole("button", { name: "Import", exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/, { timeout: 30_000 })
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.getByRole("button", { name: "Project settings and more" }).click()
  await page.getByRole("menuitem", { name: "Project settings" }).click()
  await expect(page.getByLabel("Spoken language")).toContainText("Portuguese")
  await expect(
    page.getByText("Transcribed as Portuguese (chosen in settings).")
  ).toBeVisible()
  await expectNoSeriousA11yViolations(page)

  await page.getByLabel("Clips to find").fill("2")
  await page.getByRole("button", { name: "Save project settings" }).click()
  await expect(page.getByText("Find highlights again?")).toBeVisible()
  await page.getByRole("button", { name: "Find highlights again" }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+$/)
  await expect(
    page.getByRole("listitem").filter({ hasText: "Find highlights, completed" })
  ).toBeVisible({ timeout: 30_000 })

  await page.goto(DEFAULTS)
  await expect(page.getByLabel("Clips to find")).toHaveValue("12")
})

test("drags workspace captions to a custom height", async ({ page }) => {
  await page.goto(CAPTIONS)
  const caption = page.getByRole("slider", { name: "Caption position" })
  const frame = (await page
    .getByRole("group", { name: "Caption preview" })
    .boundingBox())!
  const box = (await caption.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, frame.y + frame.height * 0.2, {
    steps: 6,
  })
  await page.mouse.up()
  const position = page.getByRole("group", { name: "Position", exact: true })
  await expect(
    position.getByRole("button", { name: "Custom" })
  ).toHaveAttribute("aria-pressed", "true")
  const dragged = Number(await caption.getAttribute("aria-valuenow"))
  expect(dragged).toBeLessThan(50)
  await caption.press("ArrowDown")
  await expect(caption).toHaveAttribute("aria-valuenow", String(dragged + 1))
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Save captions" }).click()
  await expect(page.getByText("Captions saved")).toBeVisible()

  await page.reload()
  await expect(caption).toHaveAttribute("aria-valuenow", String(dragged + 1))
  await position.getByRole("button", { name: "Auto" }).click()
  await page.getByRole("button", { name: "Save captions" }).click()
  await expect(page.getByText("Captions saved")).toBeVisible()
})

test("publishing defaults persist", async ({ page }) => {
  await page.goto(DEFAULTS)
  await page.getByLabel("Tags", { exact: true }).fill("fps, clutch")
  await page.getByRole("button", { name: "Save project defaults" }).click()
  await expect(page.getByText("Project defaults saved")).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Tags", { exact: true })).toHaveValue(
    "fps, clutch"
  )
  await expect(page.getByLabel("Hashtags", { exact: true })).toHaveValue(
    "#Shorts #gaming"
  )
  await page.getByLabel("Tags", { exact: true }).fill("")
  await page.getByRole("button", { name: "Save project defaults" }).click()
  await expect(page.getByText("Project defaults saved")).toBeVisible()
})

test("a Free workspace can upgrade to Creator", async ({ page }) => {
  await page.route("https://pay.example.com/**", (route) =>
    route.fulfill({ status: 200, body: "AbacatePay checkout" })
  )
  await page.goto("/settings/workspace/plan")
  await expect(page.getByText("Creator · R$67.69 a month")).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole("button", { name: "Upgrade to Creator" }).click()
  await expect(page).toHaveURL(/^https:\/\/pay\.example\.com\/bill_fake_\d+$/)
})
