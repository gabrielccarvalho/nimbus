export const SWEEP_INTERVAL_MS = 6 * 60 * 60_000

export const SWEEP_MIN_AGE_MS = {
  upload: 24 * 60 * 60_000,
  orphan: 60 * 60_000,
  work: 7 * 60 * 60_000,
}

export type SweepFile = { key: string; mtimeMs: number }

export function planSweep({
  files,
  projectIds,
  busyProjectIds,
  referencedKeys,
  nowMs,
}: {
  files: readonly SweepFile[]
  projectIds: ReadonlySet<string>
  busyProjectIds: ReadonlySet<string>
  referencedKeys: ReadonlySet<string>
  nowMs: number
}): string[] {
  const stale = (file: SweepFile, minAge: number) =>
    nowMs - file.mtimeMs >= minAge
  return files
    .filter((file) => {
      const parts = file.key.split("/")
      if (
        parts[0] === "tmp" &&
        (parts[1] === "uploads" || parts[1] === "downloads")
      ) {
        return stale(file, SWEEP_MIN_AGE_MS.upload)
      }
      if (parts[0] !== "projects" || !parts[1]) return false
      const projectId = parts[1]
      if (!projectIds.has(projectId)) {
        return stale(file, SWEEP_MIN_AGE_MS.orphan)
      }
      if (busyProjectIds.has(projectId)) return false
      if (parts[2] === "work") return stale(file, SWEEP_MIN_AGE_MS.work)
      if (parts[2] === "renders") {
        return (
          !referencedKeys.has(file.key) && stale(file, SWEEP_MIN_AGE_MS.orphan)
        )
      }
      return false
    })
    .map((file) => file.key)
}
