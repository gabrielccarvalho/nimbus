export const CUT_SCENE_THRESHOLD = 0.25
export const CUT_SAMPLE_FPS = 10

const LINE = /Parsed_metadata.*\bpts_time:\s*([\d.]+)/

export const cutDetectionFilter = `fps=${CUT_SAMPLE_FPS},scale=160:90,select='gt(scene,${CUT_SCENE_THRESHOLD})',metadata=print`

export function createCutParser() {
  const cuts: number[] = []

  return {
    push(line: string) {
      const match = LINE.exec(line)
      if (!match) return
      const ms = Math.round(Number(match[1]) * 1000)
      if (Number.isFinite(ms)) cuts.push(ms)
    },
    finish(durationMs: number): number[] {
      return [...new Set(cuts)]
        .filter((ms) => ms >= 0 && ms <= durationMs)
        .sort((a, b) => a - b)
    },
  }
}

const CLUSTER_GAP_MS = 10_000
const CLUSTER_MIN_CUTS = 3

export function cutClusters(cuts: readonly number[]) {
  const clusters: { startMs: number; endMs: number; count: number }[] = []
  let run: number[] = []
  const close = () => {
    if (run.length >= CLUSTER_MIN_CUTS) {
      clusters.push({ startMs: run[0]!, endMs: run.at(-1)!, count: run.length })
    }
    run = []
  }
  for (const ms of cuts) {
    if (run.length && ms - run.at(-1)! > CLUSTER_GAP_MS) close()
    run.push(ms)
  }
  close()
  return clusters
}
