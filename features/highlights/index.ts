import "server-only"

import type { Logger } from "pino"

import { toAppError } from "@/lib/errors"

import { AnthropicReviewer, AnthropicSelector } from "./anthropic"
import { HeuristicSelector } from "./heuristic"
import { postprocessCandidates } from "./postprocess"
import { reviewPoolSize } from "./review"
import type { ClipReviewer, HighlightSelector, SelectorInput } from "./types"

export async function selectHighlights(
  mode: "anthropic" | "heuristic",
  input: SelectorInput,
  logger: Logger,
  createSelector: (mode: "anthropic" | "heuristic") => HighlightSelector = (
    m
  ) => (m === "anthropic" ? new AnthropicSelector() : new HeuristicSelector()),
  createReviewer: () => ClipReviewer = () => new AnthropicReviewer()
) {
  const reviewing = mode === "anthropic" && Boolean(input.frames)
  const pool = reviewing
    ? {
        ...input,
        limits: {
          ...input.limits,
          maxCount: reviewPoolSize(input.limits.maxCount),
        },
      }
    : input
  let raw
  let fallbackReason: string | undefined
  try {
    raw = await createSelector(mode).select(pool)
  } catch (error) {
    if (mode !== "anthropic" || input.signal?.aborted) throw error
    fallbackReason = toAppError(error).message
    logger.warn({ err: error }, "anthropic selector failed, using heuristic")
    raw = await new HeuristicSelector().select(input)
  }
  if (!reviewing || fallbackReason) {
    return { candidates: postprocessCandidates(raw, input), fallbackReason }
  }

  const shortlist = postprocessCandidates(raw, pool)
  try {
    const reviewed = await createReviewer().review(shortlist, input)
    return {
      candidates: postprocessCandidates(reviewed, {
        ...input,
        payoffStarts: true,
      }),
      fallbackReason,
    }
  } catch (error) {
    if (input.signal?.aborted) throw error
    logger.warn({ err: error }, "visual review failed, keeping the first pass")
    return {
      candidates: shortlist.slice(0, input.limits.maxCount),
      fallbackReason,
      reviewFailure: toAppError(error).message,
    }
  }
}
