import { LOUDNESS_FLOOR_LUFS, type SignalsData } from "../analysis/schema"
import { normalizeEffects, type Beat, type Effect } from "./schema"

export type PlanInput = {
  startMs: number
  endMs: number
  hasWebcam: boolean
  signals: SignalsData
  beats: readonly Beat[]
}

export const PLANNER = {
  screamAboveMedianLu: 8,
  strongAboveMedianLu: 14,
  screamFloorLufs: -18,
  jumpAfterQuietLu: 10,
  quietMs: 1500,
  focusLeadMs: 300,
  focusTailMs: 1500,
  zoomMs: 1500,
  shakeMs: 500,
  minGapMs: 3000,
  maxFocusShare: 0.4,
  maxShakes: 4,
  leadInMs: 500,
  beatSnapMs: 2500,
} as const

type FocusEffect = Extract<Effect, { kind: "focus" }>

type Candidate = {
  anchorMs: number
  exempt: boolean
  events: Effect[]
  optionalFocus?: FocusEffect
  screamPeak?: boolean
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

function focusAround(ms: number): FocusEffect {
  return {
    kind: "focus",
    startMs: ms - PLANNER.focusLeadMs,
    endMs: ms + PLANNER.focusTailMs,
  }
}

function zoomAround(ms: number, x = 0.5, y = 0.5): Effect {
  return {
    kind: "zoom",
    startMs: ms - PLANNER.zoomMs / 2,
    endMs: ms + PLANNER.zoomMs / 2,
    scale: 1.4,
    focus: { x, y },
  }
}

function snapBeat(beat: Beat, input: PlanInput) {
  const { loudness, loudnessIntervalMs, speechDensity } = input.signals
  const from = Math.max(
    0,
    Math.ceil(
      Math.max(beat.ms - PLANNER.beatSnapMs, input.startMs) / loudnessIntervalMs
    )
  )
  const to = Math.min(
    loudness.length - 1,
    Math.floor(
      (Math.min(beat.ms + PLANNER.beatSnapMs, input.endMs) - 1) /
        loudnessIntervalMs
    )
  )
  let best = LOUDNESS_FLOOR_LUFS
  let bestIndex = -1
  let tied = false
  for (let i = from; i <= to; i++) {
    const value = loudness[i]!
    if (value > best) {
      best = value
      bestIndex = i
      tied = false
    } else if (value === best && bestIndex >= 0) {
      tied = true
    }
  }
  if (bestIndex >= 0 && !tied) return bestIndex * loudnessIntervalMs

  let densest: { mid: number; rate: number } | undefined
  for (const window of speechDensity) {
    const mid = (window.startMs + window.endMs) / 2
    if (Math.abs(mid - beat.ms) > PLANNER.beatSnapMs) continue
    if (mid < input.startMs || mid >= input.endMs) continue
    if (window.wordsPerSecond > (densest?.rate ?? 0)) {
      densest = { mid, rate: window.wordsPerSecond }
    }
  }
  return densest ? Math.round(densest.mid) : beat.ms
}

function beatCandidates(input: PlanInput): Candidate[] {
  return input.beats
    .filter((beat) => beat.ms >= input.startMs && beat.ms < input.endMs)
    .toSorted((a, b) => a.ms - b.ms)
    .flatMap((beat): Candidate[] => {
      const ms = Math.min(
        Math.max(snapBeat(beat, input), input.startMs),
        input.endMs
      )
      if (beat.kind === "reaction") {
        return input.hasWebcam
          ? [{ anchorMs: ms, exempt: true, events: [focusAround(ms)] }]
          : []
      }
      return [
        {
          anchorMs: ms,
          exempt: true,
          events: [zoomAround(ms, beat.x, beat.y)],
        },
      ]
    })
}

function loudnessWindows(input: PlanInput) {
  const { loudness, loudnessIntervalMs } = input.signals
  const from = Math.max(0, Math.ceil(input.startMs / loudnessIntervalMs))
  const to = Math.min(
    loudness.length,
    Math.floor(input.endMs / loudnessIntervalMs)
  )
  const windows: { index: number; lufs: number }[] = []
  for (let index = from; index < to; index++) {
    windows.push({ index, lufs: loudness[index]! })
  }
  return windows
}

function screamCandidates(input: PlanInput): Candidate[] {
  const windows = loudnessWindows(input)
  const audible = windows.filter((w) => w.lufs > LOUDNESS_FLOOR_LUFS)
  if (audible.length === 0) return []
  const base = median(audible.map((w) => w.lufs))
  const threshold = Math.max(
    base + PLANNER.screamAboveMedianLu,
    PLANNER.screamFloorLufs
  )

  const peaks: { index: number; lufs: number }[] = []
  let previous = -2
  for (const window of windows) {
    if (window.lufs < threshold) continue
    if (window.index === previous + 1) {
      if (window.lufs > peaks[peaks.length - 1]!.lufs) {
        peaks[peaks.length - 1] = window
      }
    } else {
      peaks.push(window)
    }
    previous = window.index
  }

  const { loudnessIntervalMs } = input.signals
  return peaks
    .toSorted((a, b) => b.lufs - a.lufs)
    .map((peak) => {
      const ms = peak.index * loudnessIntervalMs
      const shake: Effect = {
        kind: "shake",
        startMs: ms,
        endMs: ms + PLANNER.shakeMs,
        intensity:
          peak.lufs >= base + PLANNER.strongAboveMedianLu ? "strong" : "light",
      }
      return {
        anchorMs: ms,
        exempt: false,
        events: [shake],
        optionalFocus: input.hasWebcam ? focusAround(ms) : undefined,
        screamPeak: true,
      }
    })
}

function jumpCandidates(input: PlanInput): Candidate[] {
  const { loudness, loudnessIntervalMs } = input.signals
  const quietWindows = Math.round(PLANNER.quietMs / loudnessIntervalMs)
  return loudnessWindows(input)
    .flatMap(({ index, lufs }) => {
      if (index < quietWindows) return []
      let sum = 0
      for (let i = index - quietWindows; i < index; i++) sum += loudness[i]!
      const jump = lufs - sum / quietWindows
      return jump >= PLANNER.jumpAfterQuietLu ? [{ index, jump }] : []
    })
    .toSorted((a, b) => b.jump - a.jump)
    .map(({ index }) => {
      const centre = index * loudnessIntervalMs + loudnessIntervalMs / 2
      return { anchorMs: centre, exempt: false, events: [zoomAround(centre)] }
    })
}

export function planEffects(input: PlanInput): Effect[] {
  const range = { startMs: input.startMs, endMs: input.endMs }
  const candidates = [
    ...beatCandidates(input),
    ...screamCandidates(input),
    ...(input.beats.length === 0 ? jumpCandidates(input) : []),
  ]

  const maxFocusMs = (input.endMs - input.startMs) * PLANNER.maxFocusShare
  const leadInEnd = input.startMs + PLANNER.leadInMs
  const accepted: Effect[] = []
  let focusMs = 0
  let shakes = 0

  const clippedMs = (event: Effect) =>
    Math.min(event.endMs, input.endMs) - Math.max(event.startMs, input.startMs)

  for (const candidate of candidates) {
    if (!candidate.exempt && candidate.events[0]!.startMs < leadInEnd) continue

    const covering = accepted.find(
      (event) =>
        candidate.screamPeak &&
        event.kind === "focus" &&
        event.startMs <= candidate.anchorMs &&
        candidate.anchorMs < event.endMs
    )
    const events = [...candidate.events]
    if (candidate.optionalFocus && !covering) {
      const focus = candidate.optionalFocus
      events.push({ ...focus, startMs: Math.max(focus.startMs, leadInEnd) })
    }

    const newFocusMs = events
      .filter((event) => event.kind === "focus")
      .reduce((sum, event) => sum + clippedMs(event), 0)
    const overBudget = focusMs + newFocusMs > maxFocusMs
    const kept = overBudget
      ? events.filter((event) => event.kind !== "focus")
      : events
    if (kept.length === 0) continue

    const newShakes = kept.filter((event) => event.kind === "shake").length
    if (shakes + newShakes > PLANNER.maxShakes) continue

    const crowded = kept.some((event) =>
      accepted.some(
        (other) =>
          other !== covering &&
          Math.abs(other.startMs - event.startMs) < PLANNER.minGapMs
      )
    )
    if (crowded) continue

    accepted.push(...kept)
    shakes += newShakes
    if (!overBudget) focusMs += newFocusMs
  }

  return normalizeEffects(accepted, range)
}
