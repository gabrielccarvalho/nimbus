import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  Dropzone,
  DropzoneDescription,
  DropzoneTitle,
  partitionFiles,
} from "./dropzone"

const video = (name = "a.mp4", size = 10) =>
  new File([new Uint8Array(size)], name, { type: "video/mp4" })

function setup(props: Partial<React.ComponentProps<typeof Dropzone>> = {}) {
  const onFilesAccepted = vi.fn()
  const onFilesRejected = vi.fn()
  const utils = render(
    <Dropzone
      accept={["video/*"]}
      maxSize={100}
      onFilesAccepted={onFilesAccepted}
      onFilesRejected={onFilesRejected}
      {...props}
    >
      <DropzoneTitle>Drop a video</DropzoneTitle>
      <DropzoneDescription>MP4 up to 100 bytes</DropzoneDescription>
    </Dropzone>
  )
  const zone = screen.getByRole("button", { name: /drop a video/i })
  const input = utils.container.querySelector(
    "input[type=file]"
  ) as HTMLInputElement
  return { zone, input, onFilesAccepted, onFilesRejected }
}

describe("Dropzone", () => {
  it("is a described, focusable button", () => {
    const { zone } = setup()
    expect(zone).toHaveAttribute("tabindex", "0")
    expect(zone).toHaveAccessibleDescription("MP4 up to 100 bytes")
  })

  it("opens the file picker with Enter and Space", async () => {
    const { zone, input } = setup()
    const click = vi.spyOn(input, "click")
    zone.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard(" ")
    expect(click).toHaveBeenCalledTimes(2)
  })

  it("accepts files from the picker", async () => {
    const { input, onFilesAccepted } = setup()
    await userEvent.upload(input, video())
    expect(onFilesAccepted).toHaveBeenCalledWith([expect.any(File)])
  })

  it("shows drag state and handles drops with rejections", () => {
    const { zone, onFilesAccepted, onFilesRejected } = setup()
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } })
    expect(zone).toHaveAttribute("data-dragging", "true")
    const files = [
      video("big.mp4", 500),
      new File(["x"], "a.txt", { type: "text/plain" }),
    ]
    fireEvent.drop(zone, { dataTransfer: { files } })
    expect(zone).toHaveAttribute("data-dragging", "false")
    expect(onFilesAccepted).not.toHaveBeenCalled()
    expect(onFilesRejected).toHaveBeenCalledWith([
      { file: files[0], reason: "size" },
      { file: files[1], reason: "type" },
    ])
  })

  it("ignores everything when disabled", async () => {
    const { zone, input, onFilesAccepted } = setup({ disabled: true })
    expect(zone).toHaveAttribute("aria-disabled", "true")
    expect(zone).toHaveAttribute("tabindex", "-1")
    fireEvent.drop(zone, { dataTransfer: { files: [video()] } })
    expect(input).toBeDisabled()
    expect(onFilesAccepted).not.toHaveBeenCalled()
  })

  it("takes a file picked before hydration", async () => {
    const onFilesAccepted = vi.fn()
    const element = (
      <Dropzone accept={["video/*"]} onFilesAccepted={onFilesAccepted}>
        <DropzoneTitle>Drop a video</DropzoneTitle>
      </Dropzone>
    )
    const container = document.createElement("div")
    container.innerHTML = renderToString(element)
    document.body.append(container)
    const input = container.querySelector("input")!
    const file = video()
    Object.defineProperty(input, "files", {
      value: Object.assign([file], { item: () => file }),
    })

    const root = await act(async () => hydrateRoot(container, element))
    expect(onFilesAccepted).toHaveBeenCalledWith([file])
    act(() => root.unmount())
    container.remove()
  })
})

describe("partitionFiles", () => {
  it("matches extensions and enforces single-file mode", () => {
    const { accepted, rejected } = partitionFiles(
      [video("a.mkv"), video("b.mkv")],
      { accept: [".mkv"], multiple: false }
    )
    expect(accepted).toHaveLength(1)
    expect(rejected[0]?.reason).toBe("count")
  })
})
