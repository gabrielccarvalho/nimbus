import { readFile } from "node:fs/promises"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GET as mediaGET } from "@/app/api/media/[...path]/route"
import { POST as uploadPOST } from "@/app/api/uploads/route"
import { jobQueue } from "@/features/jobs/queue"
import {
  assetRepository,
  projectRepository,
} from "@/features/projects/repository"
import { getStorage } from "@/lib/storage"

import { fixtures } from "../../scripts/make-fixtures"
import { createTestEnv, type TestEnv } from "../utils/test-env"

let env: TestEnv

beforeEach(() => {
  env = createTestEnv({ MAX_UPLOAD_BYTES: String(50 * 1024 * 1024) })
})
afterEach(() => env.cleanup())

function uploadRequest(
  body: BodyInit | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {}
) {
  return new Request("http://localhost/api/uploads", {
    method: "POST",
    body,
    headers: {
      "content-type": "video/mp4",
      "x-file-name": encodeURIComponent("my_stream.mp4"),
      ...headers,
    },
    duplex: "half",
  } as RequestInit)
}

async function tempFiles() {
  return getStorage().list("tmp")
}

describe("POST /api/uploads", () => {
  it("stores the file, creates the project and enqueues probe", async () => {
    const data = await readFile(fixtures.wide)
    const response = await uploadPOST(uploadRequest(data))
    expect(response.status).toBe(201)
    const { projectId } = (await response.json()) as { projectId: string }

    const project = projectRepository(env.db).getOrThrow(projectId)
    expect(project).toMatchObject({ name: "my stream", status: "uploaded" })
    const source = assetRepository(env.db).findByKind(projectId, "source")
    expect(source).toMatchObject({ bytes: data.length, mime: "video/mp4" })
    expect(project.sourceAssetId).toBe(source?.id)
    expect((await getStorage().stat(source!.storageKey))?.bytes).toBe(
      data.length
    )
    expect(
      jobQueue(env.db)
        .listForProject(projectId)
        .map((j) => j.type)
    ).toEqual(["probe"])
    expect(await tempFiles()).toEqual([])
  })

  it("rejects files over the limit by content-length", async () => {
    const response = await uploadPOST(
      uploadRequest("x", { "content-length": String(60 * 1024 * 1024) })
    )
    expect(response.status).toBe(413)
  })

  it("rejects streams that exceed the limit and cleans up", async () => {
    env.cleanup()
    env = createTestEnv({ MAX_UPLOAD_BYTES: "1024" })
    const data = await readFile(fixtures.wide)
    const response = await uploadPOST(uploadRequest(data))
    expect(response.status).toBe(413)
    expect(await tempFiles()).toEqual([])
    expect(projectRepository(env.db).list()).toEqual([])
  })

  it("rejects unsupported declared types", async () => {
    const response = await uploadPOST(
      uploadRequest("hello", {
        "content-type": "image/png",
        "x-file-name": "a.png",
      })
    )
    expect(response.status).toBe(415)
  })

  it("rejects files whose magic bytes aren't video", async () => {
    const data = await readFile(fixtures.notVideo)
    const response = await uploadPOST(uploadRequest(data))
    expect(response.status).toBe(415)
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toMatch(/supported video/)
    expect(await tempFiles()).toEqual([])
  })

  it("cleans up after an aborted upload", async () => {
    const head = (await readFile(fixtures.wide)).subarray(0, 4096)
    let sent = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.error(new Error("connection reset"))
          return
        }
        sent = true
        controller.enqueue(head)
      },
    })
    const response = await uploadPOST(uploadRequest(stream))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await tempFiles()).toEqual([])
    expect(projectRepository(env.db).list()).toEqual([])
  })
})

describe("GET /api/media/[...path]", () => {
  const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) })

  beforeEach(async () => {
    await getStorage().writeBuffer("projects/p1/file.mp4", "0123456789")
  })

  it("serves full files with range support advertised", async () => {
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/projects/p1/file.mp4"),
      ctx(["projects", "p1", "file.mp4"])
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("content-length")).toBe("10")
    expect(await response.text()).toBe("0123456789")
  })

  it("serves partial content", async () => {
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/projects/p1/file.mp4", {
        headers: { range: "bytes=3-5" },
      }),
      ctx(["projects", "p1", "file.mp4"])
    )
    expect(response.status).toBe(206)
    expect(response.headers.get("content-range")).toBe("bytes 3-5/10")
    expect(await response.text()).toBe("345")
  })

  it("returns 416 for unsatisfiable ranges", async () => {
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/projects/p1/file.mp4", {
        headers: { range: "bytes=50-" },
      }),
      ctx(["projects", "p1", "file.mp4"])
    )
    expect(response.status).toBe(416)
    expect(response.headers.get("content-range")).toBe("bytes */10")
  })

  it("sets a download filename when asked", async () => {
    const response = await mediaGET(
      new NextRequest(
        "http://localhost/api/media/projects/p1/file.mp4?download=My%20Clip.mp4"
      ),
      ctx(["projects", "p1", "file.mp4"])
    )
    expect(response.headers.get("content-disposition")).toContain(
      "My%20Clip.mp4"
    )
  })

  it("returns 404 for missing files", async () => {
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/projects/p1/nope.mp4"),
      ctx(["projects", "p1", "nope.mp4"])
    )
    expect(response.status).toBe(404)
  })

  it.each([
    [["..", "..", "etc", "passwd"]],
    [["projects", "..", "..", "secret"]],
    [["%2e%2e", "%2e%2e", "etc", "passwd"]],
    [["projects%2F..%2F..%2Fsecret"]],
    [["app.db"]],
    [["tmp", "uploads", "abc.part"]],
    [["projects", "p1", "work", "graph.txt"]],
    [["projects", "p1", "audio.wav%00.mp4"]],
  ])("only serves project media: %j", async (path) => {
    await getStorage().writeBuffer("tmp/uploads/abc.part", "partial")
    await getStorage().writeBuffer("projects/p1/work/graph.txt", "graph")
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/x"),
      ctx(path)
    )
    expect(response.status).toBe(404)
  })
})
