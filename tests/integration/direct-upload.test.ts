import { readFile, utimes } from "node:fs/promises"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { accountRepository } from "@/features/accounts/repository"
import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import {
  completeUploadAction,
  startUploadAction,
} from "@/features/uploads/actions"
import { verifyUploadToken } from "@/features/uploads/token"
import { user } from "@/lib/db/schema"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { runJobs } from "../utils/pipeline"
import { createTestEnv, type TestEnv } from "../utils/test-env"
import { directUpload, putUpload } from "../utils/uploads"

const signedIn: { user: { id: string; name: string } | null } = { user: null }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/features/accounts/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        signedIn.user && { user: signedIn.user, session: {} },
    },
  }),
}))

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv({ MAX_UPLOAD_BYTES: String(50 * 1024 * 1024) })
})
afterEach(() => {
  signedIn.user = null
  env.cleanup()
})

async function signIn(name: string) {
  const id = crypto.randomUUID()
  const owner = { id, name, email: `${id}@example.com` }
  await env.db.insert(user).values(owner)
  const workspace = await accountRepository(env.db).createPersonalWorkspace(
    owner
  )
  signedIn.user = owner
  return workspace.id
}

async function start(input: Record<string, unknown>) {
  const result = await startUploadAction({
    kind: "video",
    fileName: "my_stream.mp4",
    mime: "video/mp4",
    ...input,
  })
  if (!result.ok) throw new Error(result.error.message)
  const { token, target } = result.value
  if (target.kind !== "single") throw new Error("expected a local target")
  return { token, target }
}

async function storedFiles() {
  return getStorage().list("projects")
}

describe("direct uploads", () => {
  it("video upload creates a project and enqueues probe", async () => {
    const workspaceId = await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({
      bytes: data.length,
      options: { language: "pt" },
    })
    expect(target).toEqual({
      kind: "single",
      url: `/api/uploads/${token}`,
      method: "PUT",
      headers: { "Content-Type": "video/mp4" },
    })

    const put = await putUpload(target.url, data)
    expect(put.status).toBe(204)
    const result = await completeUploadAction(token)
    if (!result.ok) throw new Error(result.error.message)
    const { projectId } = result.value as { projectId: string }

    const project = await projectRepository(env.db).getOrThrow(projectId)
    expect(project).toMatchObject({
      name: "my stream",
      status: "uploaded",
      workspaceId,
    })
    expect(project.settings.language).toBe("pt")
    const source = await assetRepository(env.db).findByKind(projectId, "source")
    expect(source).toMatchObject({ bytes: data.length, mime: "video/mp4" })
    expect(project.sourceAssetId).toBe(source?.id)
    expect(source?.storageKey).toBe(verifyUploadToken(token).key)
    expect((await getStorage().stat(source!.storageKey))?.bytes).toBe(
      data.length
    )
    expect(
      (await jobQueue(env.db).listForProject(projectId)).map((j) => j.type)
    ).toEqual(["probe"])
    expect(await storedFiles()).toEqual([source!.storageKey])
  })

  it("completing twice fails the second time", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    await putUpload(target.url, data)
    expect((await completeUploadAction(token)).ok).toBe(true)

    expect(await completeUploadAction(token)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "The upload didn't arrive" },
    })
    expect(await projectRepository(env.db).list()).toHaveLength(1)
  })

  it("completing another workspace's token is rejected", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    await putUpload(target.url, data)

    await signIn("Someone else")
    expect(await completeUploadAction(token)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "The upload didn't arrive" },
    })
    expect(await projectRepository(env.db).list()).toEqual([])
    expect(await storedFiles()).toEqual([verifyUploadToken(token).key])
  })

  it("local PUT rejects bytes over the signed size", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { target } = await start({ bytes: 1024 })
    const response = await putUpload(target.url, data)
    expect(response.status).toBe(413)
    expect(await storedFiles()).toEqual([])
  })

  it("a non-video body is rejected at complete with UNSUPPORTED_MEDIA", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.notVideo)
    const { token } = await start({ bytes: data.length })
    await getStorage().writeBuffer(verifyUploadToken(token).key, data)

    const result = await completeUploadAction(token)
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_MEDIA" },
    })
    expect(await storedFiles()).toEqual([])
    expect(await projectRepository(env.db).list()).toEqual([])
  })

  it("sweep removes uploads that were never completed", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const stale = await start({ bytes: data.length })
    const fresh = await start({ bytes: data.length })
    await putUpload(stale.target.url, data)
    await putUpload(fresh.target.url, data)
    const staleKey = verifyUploadToken(stale.token).key
    const when = new Date(Date.now() - 25 * 60 * 60_000)
    await utimes(path.join(env.dataDir, staleKey), when, when)

    await jobQueue(env.db).enqueue({ type: "sweep", projectId: null })
    await runJobs(env.db, ["sweep"])

    expect(await storedFiles()).toEqual([verifyUploadToken(fresh.token).key])
  })

  it("completeUpload succeeds after the PUT window but before the completion deadline", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    await putUpload(target.url, data)
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(Date.now() + 2 * 60 * 60_000)
      expect(await completeUploadAction(token)).toMatchObject({ ok: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it("completeUpload rejects after the completion deadline", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    await putUpload(target.url, data)
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      vi.setSystemTime(Date.now() + 25 * 60 * 60_000)
      expect(await completeUploadAction(token)).toEqual({
        ok: false,
        error: { code: "VALIDATION", message: "This upload link has expired" },
      })
    } finally {
      vi.useRealTimers()
    }
    expect(await projectRepository(env.db).list()).toEqual([])
  })

  it("refuses a PUT once the upload is complete", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    await putUpload(target.url, data)
    expect((await completeUploadAction(token)).ok).toBe(true)
    const response = await putUpload(target.url, data)
    expect(response.status).toBe(409)
    expect(await storedFiles()).toEqual([verifyUploadToken(token).key])
  })

  it("rejects files over the limit before anything is sent", async () => {
    await signIn("Owner")
    expect(
      await startUploadAction({
        kind: "video",
        fileName: "big.mp4",
        mime: "video/mp4",
        bytes: 60 * 1024 * 1024,
      })
    ).toEqual({
      ok: false,
      error: {
        code: "TOO_LARGE",
        message: "This file is larger than the upload limit",
      },
    })
  })

  it("rejects unsupported declared types", async () => {
    await signIn("Owner")
    expect(
      await startUploadAction({
        kind: "video",
        fileName: "a.png",
        mime: "image/png",
        bytes: 10,
      })
    ).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_MEDIA",
        message: "Upload an MP4, MOV, MKV or WebM video",
      },
    })
  })

  it("rejects invalid import options", async () => {
    await signIn("Owner")
    expect(
      await startUploadAction({
        kind: "video",
        fileName: "a.mp4",
        mime: "video/mp4",
        bytes: 10,
        options: { selectorMode: "magic" },
      })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
  })

  it("rejects an empty upload", async () => {
    await signIn("Owner")
    expect(
      await directUpload({ kind: "video", fileName: "a.mp4" }, new Uint8Array())
    ).toEqual({
      ok: false,
      error: { code: "VALIDATION", message: "The upload was empty" },
    })
  })

  it("requires a session to start", async () => {
    expect(
      await startUploadAction({
        kind: "video",
        fileName: "a.mp4",
        mime: "video/mp4",
        bytes: 10,
      })
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } })
  })

  it("rejects bodies whose magic bytes aren't video at the PUT", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.notVideo)
    const { target } = await start({ bytes: data.length })
    const response = await putUpload(target.url, data)
    expect(response.status).toBe(415)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toMatch(/supported video/)
    expect(await storedFiles()).toEqual([])
  })

  it("rejects a PUT with a bad token", async () => {
    const response = await putUpload("/api/uploads/forged.token", "x")
    expect(response.status).toBe(400)
    expect(await storedFiles()).toEqual([])
  })

  it("cleans up after an aborted PUT", async () => {
    await signIn("Owner")
    const data = await readFile(fixtures.wide)
    const { token, target } = await start({ bytes: data.length })
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(new Error("connection reset"))
          return
        }
        sent = true
        controller.enqueue(data.subarray(0, 4096))
      },
    })
    const response = await putUpload(target.url, stream)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await storedFiles()).toEqual([])
    expect((await completeUploadAction(token)).ok).toBe(false)
  })

  it("only accepts PUTs on the local driver", async () => {
    await signIn("Owner")
    const { target } = await start({ bytes: 4 })
    env.cleanup()
    env = await createTestEnv({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "http://localhost:1",
      S3_BUCKET: "nimbus",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
    })
    const response = await putUpload(target.url, "abcd")
    expect(response.status).toBe(404)
  })
})
