import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  GET as mediaGET,
  HEAD as mediaHEAD,
} from "@/app/api/media/[...path]/route"
import { projectRepository } from "@/features/projects/repository"
import { defaultProjectSettings } from "@/features/projects/schema"
import { getStorage } from "@/lib/storage"

import { createTestEnv, type TestEnv } from "../utils/test-env"
import { testViewer } from "../utils/viewer"

vi.mock(
  "@/features/accounts/session",
  async () => (await import("../utils/viewer")).sessionMock
)

let env: TestEnv

beforeEach(async () => {
  env = await createTestEnv()
})
afterEach(() => env.cleanup())

describe("GET /api/media/[...path]", () => {
  const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) })

  beforeEach(async () => {
    await projectRepository(env.db).create({
      id: "p1",
      name: "p1",
      settings: defaultProjectSettings,
    })
    await getStorage().writeBuffer("projects/p1/file.mp4", "0123456789")
  })

  afterEach(() => {
    testViewer.workspaceId = null
  })

  it("hides files from other workspaces", async () => {
    testViewer.workspaceId = "someone-else"
    const response = await mediaGET(
      new NextRequest("http://localhost/api/media/projects/p1/file.mp4"),
      ctx(["projects", "p1", "file.mp4"])
    )
    expect(response.status).toBe(404)
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

  describe("with signed read URLs", () => {
    const SIGNED = "https://bucket.test/k?sig"
    let readUrl: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      readUrl = vi.spyOn(getStorage(), "readUrl").mockResolvedValue(SIGNED)
    })

    it("media route redirects to the signed URL after the access check", async () => {
      const response = await mediaGET(
        new NextRequest("http://localhost/api/media/projects/p1/file.mp4"),
        ctx(["projects", "p1", "file.mp4"])
      )
      expect(response.status).toBe(302)
      expect(response.headers.get("location")).toBe(SIGNED)
      expect(response.headers.get("cache-control")).toBe("private, max-age=0")
      expect(readUrl).toHaveBeenCalledWith("projects/p1/file.mp4", {
        download: undefined,
      })
    })

    it("redirects HEAD requests the same way", async () => {
      const response = await mediaHEAD(
        new NextRequest("http://localhost/api/media/projects/p1/file.mp4", {
          method: "HEAD",
        }),
        ctx(["projects", "p1", "file.mp4"])
      )
      expect(response.status).toBe(302)
      expect(response.headers.get("location")).toBe(SIGNED)
    })

    it("media route returns 404 for another workspace without signing", async () => {
      testViewer.workspaceId = "someone-else"
      const response = await mediaGET(
        new NextRequest("http://localhost/api/media/projects/p1/file.mp4"),
        ctx(["projects", "p1", "file.mp4"])
      )
      expect(response.status).toBe(404)
      expect(readUrl).not.toHaveBeenCalled()
    })

    it("download sets the content disposition on the signed URL", async () => {
      await mediaGET(
        new NextRequest(
          "http://localhost/api/media/projects/p1/file.mp4?download=My%20Clip.mp4"
        ),
        ctx(["projects", "p1", "file.mp4"])
      )
      expect(readUrl).toHaveBeenCalledWith("projects/p1/file.mp4", {
        download: "My Clip.mp4",
      })
    })
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
