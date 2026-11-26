import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/avatars/[...path]/route"
import { imageType, removeAvatar, saveAvatar } from "@/features/accounts/avatar"
import { accountRepository } from "@/features/accounts/repository"
import { user } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import { createTestEnv, type TestEnv } from "../utils/test-env"

const viewer: { user: { id: string }; workspace: { id: string } } = {
  user: { id: "" },
  workspace: { id: "" },
}

vi.mock("@/features/accounts/session", () => ({
  requireActor: async () => viewer,
}))

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64"
)
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.alloc(4),
  Buffer.from("WEBPVP8 "),
])

async function account(name: string) {
  const id = crypto.randomUUID()
  const created = { id, name, email: `${id}@example.com` }
  await env.db.insert(user).values(created)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    created
  )
  return { userId: id, workspaceId: workspace.id }
}

const get = (url: string) =>
  GET(new Request(`http://local${url}`) as never, {
    params: Promise.resolve({
      path: url.replace("/api/avatars/", "").split("/"),
    }),
  })

describe("avatars", () => {
  it("recognises PNG, JPEG and WebP by their bytes", () => {
    expect(imageType(PNG)).toBe("png")
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg")
    expect(imageType(WEBP)).toBe("webp")
    expect(imageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull()
  })

  it("rejects files that aren't images or are too large", async () => {
    const { userId } = await account("A")
    const save = (blob: Blob) =>
      saveAvatar(env.db, getStorage(), "users", userId, blob)
    await expect(save(new Blob(["<svg/>"]))).rejects.toThrow(
      "Use a PNG, JPEG or WebP image"
    )
    await expect(save(new Blob([Buffer.alloc(600 * 1024)]))).rejects.toThrow(
      "too large"
    )
    await expect(
      saveAvatar(env.db, getStorage(), "users", userId, "nope")
    ).rejects.toThrow("Choose an image")
  })

  it("replaces and removes the stored file", async () => {
    const { userId } = await account("A")
    const storage = getStorage()
    const first = await saveAvatar(
      env.db,
      storage,
      "users",
      userId,
      new Blob([PNG])
    )
    expect(first.image).toMatch(
      new RegExp(`^/api/avatars/users/${userId}/\\d+\\.png$`)
    )
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = await saveAvatar(
      env.db,
      storage,
      "users",
      userId,
      new Blob([WEBP])
    )
    expect(await accountRepository(env.db).userImage(userId)).toBe(second.image)
    expect(await storage.stat(first.image.replace("/api/", ""))).toBeNull()

    await removeAvatar(env.db, storage, "users", userId)
    expect(await accountRepository(env.db).userImage(userId)).toBeNull()
    expect(await storage.list(`avatars/users/${userId}`)).toEqual([])
  })

  it("serves an avatar only to its owner", async () => {
    const a = await account("A")
    const b = await account("B")
    const storage = getStorage()
    const photo = await saveAvatar(
      env.db,
      storage,
      "users",
      a.userId,
      new Blob([PNG])
    )
    const logo = await saveAvatar(
      env.db,
      storage,
      "workspaces",
      a.workspaceId,
      new Blob([PNG])
    )

    viewer.user.id = a.userId
    viewer.workspace.id = a.workspaceId
    const own = await get(photo.image)
    expect(own.status).toBe(200)
    expect(own.headers.get("content-type")).toBe("image/png")
    expect((await get(logo.image)).status).toBe(200)

    viewer.user.id = b.userId
    viewer.workspace.id = b.workspaceId
    expect((await get(photo.image)).status).toBe(404)
    expect((await get(logo.image)).status).toBe(404)
    expect((await get("/api/avatars/users/../projects/x.png")).status).toBe(404)
  })

  it("redirects an owner's avatar to the signed URL and hides it from others", async () => {
    const a = await account("A")
    const b = await account("B")
    const storage = getStorage()
    const photo = await saveAvatar(
      env.db,
      storage,
      "users",
      a.userId,
      new Blob([PNG])
    )
    const readUrl = vi
      .spyOn(storage, "readUrl")
      .mockResolvedValue("https://bucket.test/k?sig")

    viewer.user.id = a.userId
    viewer.workspace.id = a.workspaceId
    const own = await get(photo.image)
    expect(own.status).toBe(302)
    expect(own.headers.get("location")).toBe("https://bucket.test/k?sig")

    readUrl.mockClear()
    viewer.user.id = b.userId
    viewer.workspace.id = b.workspaceId
    expect((await get(photo.image)).status).toBe(404)
    expect(readUrl).not.toHaveBeenCalled()
  })
})
