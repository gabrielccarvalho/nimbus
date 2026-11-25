import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  publishClipAction,
  retryPublicationAction,
} from "@/features/publishing/actions"

import {
  PublicationStatusView,
  type PublicationState,
  PublishControl,
  PublishDialog,
  type PublishingState,
} from "./publish-dialog"

const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

vi.mock("@/features/publishing/actions", () => ({
  publishClipAction: vi.fn(),
  retryPublicationAction: vi.fn(),
}))

const base = {
  renderAssetId: "r1",
  metadata: {
    title: "Old title",
    description: "Old description",
    tags: ["old"],
    privacy: "unlisted" as const,
  },
  publishedAt: null,
  stats: null,
  early: false,
  refreshing: false,
}

const clip = {
  id: "c1",
  title: "Clutch ace",
  description: "A 1v4 on Ascent",
  status: "rendered" as const,
  renderAssetId: "r1",
}

const publishing: PublishingState = {
  channel: { title: "My channel", status: "ok" },
  defaults: { privacy: "public", tags: ["gaming"], hashtags: "#gaming" },
  publications: {},
  publishesLeftToday: null,
}

beforeEach(() => {
  refresh.mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(publishClipAction).mockReset()
  vi.mocked(retryPublicationAction).mockReset()
})

describe("PublishDialog", () => {
  it("prefills the title and a description ending with the hashtags line", async () => {
    render(<PublishDialog clip={clip} publishing={publishing} />)
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText("Title")).toHaveValue("Clutch ace")
    const description = screen.getByLabelText("Description")
    expect((description as HTMLTextAreaElement).value).toBe(
      "A 1v4 on Ascent\n#gaming #Shorts"
    )
  })

  it("scheduling a public video switches privacy to private and says why", async () => {
    render(<PublishDialog clip={clip} publishing={publishing} />)
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    expect(await screen.findByLabelText("Privacy")).toHaveTextContent("Public")
    await userEvent.click(
      screen.getByRole("switch", { name: "Schedule for later" })
    )
    expect(screen.getByLabelText("Privacy")).toHaveTextContent("Private")
    expect(
      screen.getByText("Scheduled videos stay private until they go live.")
    ).toBeVisible()
  })

  it("submits the parsed input", async () => {
    vi.mocked(publishClipAction).mockResolvedValue({
      ok: true,
      value: { publicationId: "pub1" },
    })
    render(<PublishDialog clip={clip} publishing={publishing} />)
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "Publish to YouTube" })
    )
    await waitFor(() => expect(publishClipAction).toHaveBeenCalledTimes(1))
    expect(publishClipAction).toHaveBeenCalledWith("c1", {
      title: "Clutch ace",
      description: "A 1v4 on Ascent\n#gaming #Shorts",
      tags: ["gaming"],
      privacy: "public",
      publishAt: null,
    })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("submits a private video with the chosen publish time", async () => {
    vi.mocked(publishClipAction).mockResolvedValue({
      ok: true,
      value: { publicationId: "pub1" },
    })
    render(<PublishDialog clip={clip} publishing={publishing} />)
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(
      await screen.findByRole("switch", { name: "Schedule for later" })
    )
    fireEvent.change(screen.getByLabelText("Publish at"), {
      target: { value: "2099-01-02T10:30" },
    })
    await userEvent.click(
      screen.getByRole("button", { name: "Schedule on YouTube" })
    )
    await waitFor(() => expect(publishClipAction).toHaveBeenCalledTimes(1))
    expect(publishClipAction).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        privacy: "private",
        publishAt: new Date("2099-01-02T10:30"),
      })
    )
  })

  it("shows the action's error and keeps the dialog open", async () => {
    vi.mocked(publishClipAction).mockResolvedValue({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Your plan allows 3 publishes a day",
      },
    })
    render(<PublishDialog clip={clip} publishing={publishing} />)
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    await userEvent.click(
      await screen.findByRole("button", { name: "Publish to YouTube" })
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Your plan allows 3 publishes a day"
      )
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it.each([
    ["approved clip", { ...clip, status: "approved" as const }, publishing],
    ["no channel", clip, { ...publishing, channel: null }],
    [
      "channel needing reconnect",
      clip,
      { ...publishing, channel: { title: "x", status: "needs_reconnect" } },
    ],
    ["plan limit reached", clip, { ...publishing, publishesLeftToday: 0 }],
  ] as const)("is disabled for %s", (_, c, p) => {
    render(<PublishDialog clip={c} publishing={p as PublishingState} />)
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled()
  })

  it.each([
    [
      "Render the latest edit first",
      { ...clip, status: "approved" as const },
      publishing,
    ],
    [
      "Connect YouTube in Settings › Connected channels",
      clip,
      { ...publishing, channel: null },
    ],
    [
      "Reconnect YouTube in Settings › Connected channels",
      clip,
      { ...publishing, channel: { title: "x", status: "needs_reconnect" } },
    ],
    [
      "Your plan's daily publish limit is reached",
      clip,
      { ...publishing, publishesLeftToday: 0 },
    ],
  ] as const)("explains why: %s", (reason, c, p) => {
    render(<PublishDialog clip={c} publishing={p as PublishingState} />)
    expect(screen.getByText(reason)).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Publish" })
    ).toHaveAccessibleDescription(reason)
  })
})

describe("PublishControl", () => {
  it("shows the publication status instead of the button while one is active", () => {
    render(
      <PublishControl
        clip={clip}
        publishing={{
          ...publishing,
          publications: {
            c1: {
              ...base,
              id: "p1",
              status: "uploading",
              url: null,
              error: null,
            },
          },
        }}
      />
    )
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull()
    expect(screen.getByText("Publishing…")).toBeVisible()
  })

  it("offers the dialog when there is no publication", () => {
    render(<PublishControl clip={clip} publishing={publishing} />)
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled()
  })
})

describe("PublishControl republishing", () => {
  const failed = {
    ...base,
    id: "p1",
    status: "failed" as const,
    url: null,
    error: "Upload rejected",
  }
  const withPublication = (publication: typeof failed | PublicationState) => ({
    ...publishing,
    publications: { c1: publication },
  })

  it("keeps Retry and a Publish button prefilled from the failed metadata", async () => {
    render(<PublishControl clip={clip} publishing={withPublication(failed)} />)
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Publish" }))
    expect(await screen.findByLabelText("Title")).toHaveValue("Old title")
    expect(screen.getByLabelText("Description")).toHaveValue("Old description")
  })

  it("offers no second upload of the same published render", () => {
    render(
      <PublishControl
        clip={clip}
        publishing={withPublication({
          ...failed,
          status: "published",
          url: "https://youtu.be/abc",
        })}
      />
    )
    expect(screen.getByRole("link", { name: /Published/ })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull()
    expect(screen.queryByText("Edited since publish")).toBeNull()
  })

  it("flags a published clip that was re-rendered and offers Publish", () => {
    render(
      <PublishControl
        clip={{ ...clip, renderAssetId: "r2" }}
        publishing={withPublication({
          ...failed,
          status: "published",
          url: "https://youtu.be/abc",
        })}
      />
    )
    expect(screen.getByText("Edited since publish")).toBeVisible()
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled()
  })
})

describe("PublicationStatusView", () => {
  it("shows progress while publishing", () => {
    render(
      <PublicationStatusView
        publication={{
          ...base,
          id: "p1",
          status: "uploading",
          url: null,
          error: null,
          progress: 42,
        }}
      />
    )
    expect(screen.getByText("Publishing… 42%")).toBeVisible()
  })

  it("explains a quota wait", () => {
    render(
      <PublicationStatusView
        publication={{
          ...base,
          id: "p1",
          status: "waiting_quota",
          url: null,
          error: null,
        }}
      />
    )
    expect(screen.getByText("Waiting for YouTube's daily limit")).toBeVisible()
  })

  it("links to the published video", () => {
    render(
      <PublicationStatusView
        publication={{
          ...base,
          id: "p1",
          status: "published",
          url: "https://youtu.be/abc",
          error: null,
        }}
      />
    )
    const link = screen.getByRole("link", { name: /Published/ })
    expect(link).toHaveAttribute("href", "https://youtu.be/abc")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
  })

  it("retries a failed publish", async () => {
    vi.mocked(retryPublicationAction).mockResolvedValue({
      ok: true,
      value: { publicationId: "p2" },
    })
    render(
      <PublicationStatusView
        publication={{
          ...base,
          id: "p1",
          status: "failed",
          url: null,
          error: "Upload rejected",
        }}
      />
    )
    expect(screen.getByText("Publish failed")).toBeVisible()
    expect(screen.getByText("Upload rejected")).toBeVisible()
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(retryPublicationAction).toHaveBeenCalledWith("p1")
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("shows why a retry failed", async () => {
    vi.mocked(retryPublicationAction).mockResolvedValue({
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Reconnect YouTube" },
    })
    render(
      <PublicationStatusView
        publication={{
          ...base,
          id: "p1",
          status: "failed",
          url: null,
          error: null,
        }}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Reconnect YouTube")
    )
  })
})
