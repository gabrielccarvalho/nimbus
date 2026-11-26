import "server-only"

import type { StorageAdapter } from "./types"

export type PushResult = {
  copied: number
  skipped: number
  failed: Array<{ key: string; error: unknown }>
}

// Every storage key lives under a prefix; root-level files (the old app.db)
// are not media.
const isMediaKey = (key: string) => key.includes("/") && !key.startsWith("tmp/")

export async function pushStorage(
  from: StorageAdapter,
  to: StorageAdapter
): Promise<PushResult> {
  const result: PushResult = { copied: 0, skipped: 0, failed: [] }
  for (const key of (await from.list(".")).filter(isMediaKey)) {
    try {
      const [local, remote] = await Promise.all([from.stat(key), to.stat(key)])
      if (!local) continue
      if (remote?.bytes === local.bytes) {
        result.skipped++
        continue
      }
      await to.write(key, from.read(key))
      result.copied++
    } catch (error) {
      result.failed.push({ key, error })
    }
  }
  return result
}
