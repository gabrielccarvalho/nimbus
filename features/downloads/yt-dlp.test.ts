import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { YtDlpDownloader } = await import("./yt-dlp")

let dir: string
let calls: string

// Fails like YouTube does for signed-in requests, succeeds without cookies.
const STUB = `#!/bin/sh
echo "$*" >> "$CALLS"
case "$*" in
  *--cookies*) echo "ERROR: [youtube] abc: Requested format is not available. Use --list-formats for a list of available formats" >&2; exit 1 ;;
  *--format*) out=""; prev=""; for a in "$@"; do [ "$prev" = "--paths" ] && out="$a"; prev="$a"; done; : > "$out/source.mp4" ;;
  *) echo '{"id":"abc","title":"Clip","duration":60}' ;;
esac
`

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "yt-dlp-test-"))
  calls = path.join(dir, "calls.txt")
  await writeFile(path.join(dir, "yt-dlp"), STUB)
  await chmod(path.join(dir, "yt-dlp"), 0o755)
  vi.stubEnv("CALLS", calls)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

function downloader(cookiesFile?: string) {
  return new YtDlpDownloader({
    binary: path.join(dir, "yt-dlp"),
    ffmpeg: "ffmpeg",
    cookiesFile,
  })
}

describe("YtDlpDownloader", () => {
  it("retries without cookies when signed-in requests get no formats", async () => {
    const file = await downloader("/tmp/cookies.txt").download({
      url: "https://www.youtube.com/watch?v=abc",
      dir,
      maxBytes: 1000,
    })

    expect(file).toBe(path.join(dir, "source.mp4"))
    const lines = (await readFile(calls, "utf8")).trim().split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain("--cookies /tmp/cookies.txt")
    expect(lines[1]).not.toContain("--cookies")
  })

  it("retries the info call the same way", async () => {
    const info = await downloader("/tmp/cookies.txt").info(
      "https://www.youtube.com/watch?v=abc"
    )

    expect(info.title).toBe("Clip")
  })

  it("doesn't retry when no cookies were sent", async () => {
    await downloader().download({
      url: "https://www.youtube.com/watch?v=abc",
      dir,
      maxBytes: 1000,
    })

    const lines = (await readFile(calls, "utf8")).trim().split("\n")
    expect(lines).toHaveLength(1)
  })
})
