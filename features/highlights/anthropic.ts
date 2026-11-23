import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { z } from "zod"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import {
  buildSelectionPrompt,
  chunkRanges,
  SELECTION_SYSTEM_PROMPT,
  type PromptInput,
} from "./prompt"
import {
  applyReviews,
  buildReviewContent,
  REVIEW_BATCH_SIZE,
  REVIEW_SYSTEM_PROMPT,
  reviewFrameTimes,
  reviewResponseSchema,
} from "./review"
import {
  candidatesResponseSchema,
  type Candidate,
  type ClipReviewer,
  type HighlightSelector,
  type SelectorInput,
} from "./types"

type JsonFormat<T extends z.ZodType> = ReturnType<typeof betaZodOutputFormat<T>>

function createClient() {
  return new Anthropic({
    apiKey: getEnv().ANTHROPIC_API_KEY,
    baseURL: getEnv().ANTHROPIC_BASE_URL,
  })
}

async function requestJson<T extends z.ZodType>({
  client,
  model,
  effort,
  system,
  content,
  schema,
  retryHint,
  signal,
}: {
  client: Anthropic
  model: string
  effort: "medium" | "high"
  system: string
  content: Anthropic.Beta.Messages.BetaMessageContentParam
  schema: T
  retryHint: string
  signal: AbortSignal | undefined
}): Promise<z.infer<T>> {
  const format = betaZodOutputFormat(schema)
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content },
  ]
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(
      client,
      { model, effort, system, messages, format },
      signal
    )
    if (response.stop_reason === "refusal") {
      throw new AppError("EXTERNAL", "Claude declined to pick highlights")
    }
    const text = response.content.find((block) => block.type === "text")?.text
    if (text && response.stop_reason !== "max_tokens") {
      try {
        return format.parse(text)
      } catch {}
    }
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: `That reply ${response.stop_reason === "max_tokens" ? "was cut off" : "didn't match the JSON schema"}. ${retryHint}`,
      }
    )
  }
  throw new AppError("EXTERNAL", "Claude returned invalid highlight JSON twice")
}

async function request<T extends z.ZodType>(
  client: Anthropic,
  {
    model,
    effort,
    system,
    messages,
    format,
  }: {
    model: string
    effort: "medium" | "high"
    system: string
    messages: Anthropic.Beta.BetaMessageParam[]
    format: JsonFormat<T>
  },
  signal: AbortSignal | undefined
) {
  try {
    return await client.beta.messages.create(
      {
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format },
        system,
        messages,
      },
      { signal }
    )
  } catch (error) {
    if (
      error instanceof Anthropic.APIError &&
      !(error instanceof Anthropic.APIUserAbortError)
    ) {
      throw new AppError("EXTERNAL", describeApiError(error), {
        cause: error,
      })
    }
    throw error
  }
}

export class AnthropicSelector implements HighlightSelector {
  readonly id = "anthropic"

  constructor(
    private readonly client = createClient(),
    private readonly model = getEnv().ANTHROPIC_MODEL
  ) {}

  async select(input: SelectorInput) {
    const ranges = chunkRanges(input.segments, input.durationMs)
    if (ranges.length === 1) return this.selectPart(input, input)
    let done = 0
    const results = await Promise.all(
      ranges.map(async (range, index) => {
        const part = await this.selectPart(
          {
            ...input,
            limits: {
              ...input.limits,
              maxCount:
                Math.ceil(
                  (input.limits.maxCount * (range.endMs - range.startMs)) /
                    input.durationMs
                ) + 2,
            },
            part: { index, count: ranges.length, ...range },
          },
          input
        )
        input.onPart?.(part, { done: ++done, total: ranges.length })
        return part
      })
    )
    return results.flat()
  }

  private async selectPart(prompt: PromptInput, input: SelectorInput) {
    const { clips } = await requestJson({
      client: this.client,
      model: this.model,
      effort: "high",
      system: SELECTION_SYSTEM_PROMPT,
      content: buildSelectionPrompt(prompt),
      schema: candidatesResponseSchema,
      retryHint: `Reply again with only the JSON, at most ${prompt.limits.maxCount} clips.`,
      signal: input.signal,
    })
    return clips
  }
}

export class AnthropicReviewer implements ClipReviewer {
  constructor(
    private readonly client = createClient(),
    private readonly model = getEnv().ANTHROPIC_REVIEW_MODEL ??
      getEnv().ANTHROPIC_MODEL
  ) {}

  async review(candidates: readonly Candidate[], input: SelectorInput) {
    const frames = input.frames
    if (!frames || candidates.length === 0) return [...candidates]
    const batches = Array.from(
      { length: Math.ceil(candidates.length / REVIEW_BATCH_SIZE) },
      (_, i) => i * REVIEW_BATCH_SIZE
    )
    let done = 0
    const reviews = await Promise.all(
      batches.map(async (firstId) => {
        const batch = []
        for (const candidate of candidates.slice(
          firstId,
          firstId + REVIEW_BATCH_SIZE
        )) {
          const times = reviewFrameTimes(candidate, input.durationMs)
          batch.push({
            candidate,
            times,
            frames: await frames(times, input.signal),
          })
        }
        const { clips } = await requestJson({
          client: this.client,
          model: this.model,
          effort: "medium",
          system: REVIEW_SYSTEM_PROMPT,
          content: buildReviewContent(batch, firstId, input),
          schema: reviewResponseSchema,
          retryHint: `Reply again with only the JSON, one entry per candidate id.`,
          signal: input.signal,
        })
        input.onReview?.({ done: ++done, total: batches.length })
        return clips
      })
    )
    return applyReviews(candidates, reviews.flat())
  }
}

export function describeApiError(
  error: InstanceType<typeof Anthropic.APIError>
) {
  if (error instanceof Anthropic.APIConnectionError) {
    return "couldn't reach the Anthropic API"
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "the API key was rejected"
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "rate limited, try again in a minute"
  }
  if (/too long|too many tokens|context/i.test(error.message)) {
    return "the transcript is too long for one request"
  }
  if (error.status && error.status >= 500) {
    return "the API is overloaded or unavailable"
  }
  return `the API returned ${error.status ?? "an error"}`
}
