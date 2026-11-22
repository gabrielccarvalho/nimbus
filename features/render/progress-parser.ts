export type FfmpegProgress = {
  outTimeMs: number
  percent: number
  speed: number | null
  done: boolean
}

export function createProgressParser(expectedDurationMs: number) {
  let outTimeUs = 0
  let speed: number | null = null

  return function onLine(line: string): FfmpegProgress | null {
    const index = line.indexOf("=")
    if (index === -1) return null
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()
    switch (key) {
      case "out_time_us":
      case "out_time_ms": {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed >= 0) outTimeUs = parsed
        return null
      }
      case "speed": {
        const parsed = Number.parseFloat(value)
        speed = Number.isFinite(parsed) ? parsed : null
        return null
      }
      case "progress": {
        const done = value === "end"
        const outTimeMs = Math.round(outTimeUs / 1000)
        const percent = done
          ? 100
          : expectedDurationMs > 0
            ? Math.min(99.9, (outTimeMs / expectedDurationMs) * 100)
            : 0
        return { outTimeMs, percent, speed, done }
      }
      default:
        return null
    }
  }
}
