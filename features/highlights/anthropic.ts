import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import {
  buildSelectionPrompt,
  chunkRanges,
  SELECTION_SYSTEM_PROMPT,
  type PromptInput,
} from "./prompt"
import {
  candidatesResponseSchema,
  type HighlightSelector,
  type SelectorInput,
} from "./types"

export class AnthropicSelector implements HighlightSelector {
  readonly id = "anthropic"

  constructor(
    private readonly client = new Anthropic({
      apiKey: getEnv().ANTHROPIC_API_KEY,
      baseURL: getEnv().ANTHROPIC_BASE_URL,
    }),
    private readonly model = getEnv().ANTHROPIC_MODEL
  ) {}

  async select(input: SelectorInput) {
    const ranges = chunkRanges(input.segments, input.durationMs)
    if (ranges.length === 1) return this.selectPart(input, input)
    const results = await Promise.all(
      ranges.map((range, index) =>
        this.selectPart(
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
      )
    )
    return results.flat()
  }

  private async selectPart(prompt: PromptInput, input: SelectorInput) {
    const format = betaZodOutputFormat(candidatesResponseSchema)
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: buildSelectionPrompt(prompt) },
    ]
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.request(messages, format, input.signal)
      if (response.stop_reason === "refusal") {
        throw new AppError("EXTERNAL", "Claude declined to pick highlights")
      }
      const text = response.content.find((block) => block.type === "text")?.text
      if (text && response.stop_reason !== "max_tokens") {
        try {
          return format.parse(text).clips
        } catch {}
      }
      messages.push(
        { role: "assistant", content: response.content },
        {
          role: "user",
          content: `That reply ${response.stop_reason === "max_tokens" ? "was cut off" : "didn't match the JSON schema"}. Reply again with only the JSON, at most ${prompt.limits.maxCount} clips.`,
        }
      )
    }
    throw new AppError(
      "EXTERNAL",
      "Claude returned invalid highlight JSON twice"
    )
  }

  private async request(
    messages: Anthropic.Beta.BetaMessageParam[],
    format: ReturnType<
      typeof betaZodOutputFormat<typeof candidatesResponseSchema>
    >,
    signal: AbortSignal | undefined
  ) {
    try {
      return await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: {
            effort: "high",
            format,
          },
          system: SELECTION_SYSTEM_PROMPT,
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
