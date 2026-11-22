import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"

import { getEnv } from "@/lib/env"
import { AppError } from "@/lib/errors"

import { buildSelectionPrompt, SELECTION_SYSTEM_PROMPT } from "./prompt"
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
    const format = betaZodOutputFormat(candidatesResponseSchema)
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: buildSelectionPrompt(input) },
    ]
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.beta.messages.create(
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
        { signal: input.signal }
      )
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
          content: `That reply ${response.stop_reason === "max_tokens" ? "was cut off" : "didn't match the JSON schema"}. Reply again with only the JSON, at most ${input.limits.maxCount} clips.`,
        }
      )
    }
    throw new AppError(
      "EXTERNAL",
      "Claude returned invalid highlight JSON twice"
    )
  }
}
