import "server-only"

import { mkdir, rm } from "node:fs/promises"
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
