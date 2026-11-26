import "server-only"

import { mkdir, readdir, rm, stat } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"

export async function withScratch<T>(
  name: string,
  run: (dir: string) => Promise<T>
): Promise<T> {
  const dir = path.join(getEnv().SCRATCH_DIR, name)
  await mkdir(dir, { recursive: true })
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function removeStaleScratch(
  olderThanMs: number,
  now = Date.now()
) {
  const root = getEnv().SCRATCH_DIR
  const entries = await readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  let removed = 0
  for (const name of entries) {
    // The S3 input cache evicts its own entries.
    if (name === "cache") continue
    const entry = path.join(root, name)
    const info = await stat(entry).catch(() => null)
    if (!info || now - info.mtimeMs <= olderThanMs) continue
    await rm(entry, { recursive: true, force: true })
    removed++
  }
  return removed
}
