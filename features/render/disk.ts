const VERTICAL_BITRATE_BPS = 8_000_000
const AUDIO_BITRATE_BPS = 160_000

export function estimateRenderBytes(durationMs: number, pixels = 1080 * 1920) {
  const video = VERTICAL_BITRATE_BPS * (pixels / (1080 * 1920))
  return Math.ceil(((video + AUDIO_BITRATE_BPS) / 8) * (durationMs / 1000))
}
