import { expect, test } from "@playwright/test"

import { expectNoSeriousA11yViolations } from "./utils/axe"

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP479AARwzEcQDeohvxBqDEwwAAAABJRU5ErkJggg==",
  "base64"
)

test("changes and removes the profile photo and workspace logo", async ({
  page,
}) => {
  for (const { path, label } of [
    { path: "/settings/profile", label: "photo" },
    { path: "/settings/workspace", label: "logo" },
  ]) {
    await page.goto(path)
    await page
      .locator("input[type=file]")
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG })
    await expect(
      page.getByText(`${label[0]!.toUpperCase()}${label.slice(1)} updated`)
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: `Change ${label}` })
    ).toBeVisible()
    const images = page.locator(`img[src^="/api/avatars/"]`)
    await expect(images.first()).toBeVisible()
    const src = (await images.first().getAttribute("src"))!
    expect((await page.request.get(src)).headers()["content-type"]).toBe(
      "image/webp"
    )
    await expectNoSeriousA11yViolations(page)

    await page.getByRole("button", { name: "Remove" }).click()
    await expect(
      page.getByRole("button", { name: `Upload ${label}` })
    ).toBeVisible()
    await expect(images).toHaveCount(0)
  }
})
