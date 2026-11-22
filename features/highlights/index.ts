import "server-only"

import type { Logger } from "pino"

import { toAppError } from "@/lib/errors"

import { AnthropicSelector } from "./anthropic"
import { HeuristicSelector } from "./heuristic"
import { postprocessCandidates } from "./postprocess"
import type { HighlightSelector, SelectorInput } from "./types"

export async function selectHighlights(
  mode: "anthropic" | "heuristic",
  input: SelectorInput,
  logger: Logger,
  createSelector: (mode: "anthropic" | "heuristic") => HighlightSelector = (
    m
  ) => (m === "anthropic" ? new AnthropicSelector() : new HeuristicSelector())
) {
  let raw
  let fallbackReason: string | undefined
  try {
    raw = await createSelector(mode).select(input)
  } catch (error) {
    if (mode !== "anthropic" || input.signal?.aborted) throw error
    fallbackReason = toAppError(error).message
    logger.warn({ err: error }, "anthropic selector failed, using heuristic")
    raw = await new HeuristicSelector().select(input)
  }
  return {
    candidates: postprocessCandidates(raw, input),
    fallbackReason,
  }
}
