import "server-only"

import type { SignalsData } from "../analysis/schema"
import { signalsRepository } from "../analysis/repository"
import { clipParts, partsRange, partStarts } from "../clips/parts"
import { clipRepository, type Clip } from "../clips/repository"
import { renderableLayout, usesWebcam } from "../layout/schema"
import { assetRepository } from "../projects/repository"
import type { Db } from "@/lib/db"

import { zoomRegion, type FloatRect } from "./frame"
import { planEffects } from "./planner"
import { normalizeEffects, type Beat, type ClipEffects } from "./schema"

const NO_SIGNALS: SignalsData = {
  silences: [],
  loudness: [],
  loudnessIntervalMs: 250,
  speechDensity: [],
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function toZoomRegion(beat: Beat, region: FloatRect): Beat {
  const { x, y, ...rest } = beat
  return {
    ...rest,
    ...(x === undefined ? {} : { x: clamp01((x - region.x) / region.w) }),
    ...(y === undefined ? {} : { y: clamp01((y - region.y) / region.h) }),
  }
}

export async function autoEffectsFor(
  db: Db,
  projectId: string,
  clips: readonly (Pick<Clip, "id" | "startMs" | "endMs" | "beats" | "layout"> &
    Partial<Pick<Clip, "parts">>)[]
): Promise<Map<string, ClipEffects>> {
  const signals = (await signalsRepository(db).get(projectId)) ?? NO_SIGNALS
  const source = await assetRepository(db).findByKind(projectId, "source")
  const effects = new Map<string, ClipEffects>()
  if (!source?.width || !source.height) return effects
  const size = { width: source.width, height: source.height }
  for (const clip of clips) {
    const used = renderableLayout(clip.layout)
    const region = zoomRegion(used, size)
    const parts = clipParts(clip)
    const starts = partStarts(parts)
    const beats = (clip.beats ?? []).map((beat) => toZoomRegion(beat, region))
    const hasWebcam = usesWebcam(used.mode) && Boolean(used.webcamRect)
    const events = parts.flatMap((part, i) => {
      const shift = starts[i]! - part.startMs
      return planEffects({ ...part, hasWebcam, signals, beats }).map(
        (event) => ({
          ...event,
          startMs: event.startMs + shift,
          endMs: event.endMs + shift,
        })
      )
    })
    effects.set(clip.id, {
      events:
        parts.length > 1 ? normalizeEffects(events, partsRange(parts)) : events,
      edited: false,
    })
  }
  return effects
}

export async function syncAutoEffects(db: Db, projectId: string, on: boolean) {
  const clips = clipRepository(db)
  const unedited = (await clips.listForProject(projectId)).filter(
    (clip) => !clip.effects?.edited
  )
  const tracks = on ? await autoEffectsFor(db, projectId, unedited) : null
  for (const clip of unedited) {
    await clips.update(clip.id, { effects: tracks?.get(clip.id) ?? null })
  }
}
