type Timed = { startMs: number; endMs: number }

export function findActiveIndex(items: readonly Timed[], ms: number): number {
  let low = 0
  let high = items.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (items[mid]!.startMs <= ms) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  if (found === -1 || ms >= items[found]!.endMs) return -1
  return found
}
