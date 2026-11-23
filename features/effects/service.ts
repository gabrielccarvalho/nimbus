import "server-only"

import type { SignalsData } from "../analysis/schema"
import { signalsRepository } from "../analysis/repository"
import type { Clip } from "../clips/repository"
import { layoutRepository } from "../layout/repository"
import { usesWebcam, type Rect } from "../layout/schema"
import type { Db } from "@/lib/db"

import { planEffects } from "./planner"
import type { Beat, ClipEffects } from "./schema"

const NO_SIGNALS: SignalsData = {
  silences: [],
  loudness: [],
  loudnessIntervalMs: 250,
  speechDensity: [],
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function toGameplayRegion(beat: Beat, gameplay: Rect): Beat {
  const { x, y, ...rest } = beat
  return {
    ...rest,
    ...(x === undefined ? {} : { x: clamp01((x - gameplay.x) / gameplay.w) }),
    ...(y === undefined ? {} : { y: clamp01((y - gameplay.y) / gameplay.h) }),
  }
}

export async function autoEffectsFor(
  db: Db,
  projectId: string,
  clips: readonly Pick<
    Clip,
    "id" | "startMs" | "endMs" | "beats" | "layoutOverride"
  >[]
): Promise<Map<string, ClipEffects>> {
  const signals = (await signalsRepository(db).get(projectId)) ?? NO_SIGNALS
  const layout = await layoutRepository(db).get(projectId)
  const effects = new Map<string, ClipEffects>()
  for (const clip of clips) {
    const used = clip.layoutOverride ?? layout
    if (!used) continue
    effects.set(clip.id, {
      events: planEffects({
        startMs: clip.startMs,
        endMs: clip.endMs,
        hasWebcam: usesWebcam(used.mode) && Boolean(used.webcamRect),
        signals,
        beats: (clip.beats ?? []).map((beat) =>
          toGameplayRegion(beat, used.gameplayRect)
        ),
      }),
      edited: false,
    })
  }
  return effects
}
