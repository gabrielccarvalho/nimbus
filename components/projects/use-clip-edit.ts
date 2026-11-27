"use client"

import * as React from "react"

import type { TimeRange } from "@/features/analysis/schema"
import type { TextOverlay } from "@/features/captions/overlay"
import { clipParts } from "@/features/clips/parts"
import type { Clip } from "@/features/clips/repository"
import type { ClipEffects } from "@/features/effects/schema"
import type { LayoutInput } from "@/features/layout/schema"
import type { AudioMix } from "@/features/music/schema"
import type { ProjectSettings } from "@/features/projects/schema"
import type { CaptionState } from "@/features/timeline/captions"

export type ClipEditState = {
  startMs: number
  endMs: number
  parts: TimeRange[]
  title: string
  hook: string
  styleRef: ProjectSettings["captionStyle"]
  captionsOverride: boolean | undefined
  layout: LayoutInput
  effects: ClipEffects | null
  audioMix: AudioMix | null
  textOverlays: TextOverlay[]
  captions: CaptionState
}

export type ClipEditPatch =
  Partial<ClipEditState> | ((current: ClipEditState) => Partial<ClipEditState>)

type History = {
  present: ClipEditState
  past: ClipEditState[]
  future: ClipEditState[]
  stamp: number
}

// "skip" changes the present only; "rebase" applies the patch to every snapshot,
// for changes the user didn't make and undo must not take back.
export type ClipEditHistory = "record" | "skip" | "rebase"

type Action =
  | {
      type: "patch"
      patch: ClipEditPatch
      history: ClipEditHistory
      at: number
    }
  | { type: "undo" }
  | { type: "redo" }

const MERGE_MS = 500
const HISTORY_LIMIT = 100

function reduce(state: History, action: Action): History {
  if (action.type === "undo") {
    const previous = state.past.at(-1)
    if (!previous) return state
    return {
      present: previous,
      past: state.past.slice(0, -1),
      future: [state.present, ...state.future],
      stamp: 0,
    }
  }
  if (action.type === "redo") {
    const [next, ...future] = state.future
    if (!next) return state
    return {
      present: next,
      past: [...state.past, state.present],
      future,
      stamp: 0,
    }
  }
  const apply = (edit: ClipEditState) => ({
    ...edit,
    ...(typeof action.patch === "function" ? action.patch(edit) : action.patch),
  })
  const present = apply(state.present)
  if (action.history === "skip") return { ...state, present }
  if (action.history === "rebase") {
    return {
      ...state,
      present,
      past: state.past.map(apply),
      future: state.future.map(apply),
    }
  }
  return {
    present,
    past:
      action.at - state.stamp < MERGE_MS
        ? state.past
        : [...state.past, state.present].slice(-HISTORY_LIMIT),
    future: [],
    stamp: action.at,
  }
}

export function initialClipEdit(
  clip: Clip,
  settings: ProjectSettings
): ClipEditState {
  return {
    startMs: clip.startMs,
    endMs: clip.endMs,
    parts: clipParts(clip).map((part) => ({ ...part })),
    title: clip.title,
    hook: clip.hook,
    styleRef: clip.captionOverrides?.style ?? settings.captionStyle,
    captionsOverride: clip.captionOverrides?.enabled,
    layout: clip.layout,
    effects: clip.effects,
    audioMix: clip.audioMix,
    textOverlays: clip.textOverlays,
    captions: {
      pageEdits: Object.fromEntries(
        (clip.captionOverrides?.pages ?? []).map(({ index, ...edit }) => [
          index,
          edit,
        ])
      ),
      offsetMs: clip.captionOverrides?.offsetMs ?? 0,
      added: clip.captionOverrides?.added ?? [],
      lanes: clip.captionOverrides?.lanes ?? [],
    },
  }
}

export function useClipEdit(initial: () => ClipEditState) {
  const [history, dispatch] = React.useReducer(reduce, undefined, () => ({
    present: initial(),
    past: [],
    future: [],
    stamp: 0,
  }))

  const patch = React.useCallback(
    (next: ClipEditPatch, history: ClipEditHistory = "record") =>
      dispatch({ type: "patch", patch: next, history, at: Date.now() }),
    []
  )
  const undo = React.useCallback(() => dispatch({ type: "undo" }), [])
  const redo = React.useCallback(() => dispatch({ type: "redo" }), [])

  return {
    edit: history.present,
    patch,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
