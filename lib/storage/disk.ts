import "server-only"

import { statfs } from "node:fs/promises"

import { AppError } from "@/lib/errors"

export const DISK_HEADROOM_BYTES = 500 * 1024 ** 2

export function hasRoomFor(freeBytes: number, estimateBytes: number) {
  return freeBytes >= 2 * estimateBytes + DISK_HEADROOM_BYTES
}

export async function assertDiskSpace(
  directory: string,
  estimateBytes: number,
  action = "render"
) {
  const stats = await statfs(directory)
  const free = stats.bavail * stats.bsize
  if (!hasRoomFor(free, estimateBytes)) {
    throw new AppError(
      "STORAGE",
      `Not enough free disk space to ${action} (${Math.round(free / 1024 ** 2)} MB free)`
    )
  }
}
