import type { PrivacyStatus, PublishInput } from "./schema"

export type PublishingDefaults = {
  privacy: PrivacyStatus
  tags: string[]
  hashtags: string
}

const TITLE_MAX = 100
const DESCRIPTION_MAX = 5000
const GAMING_CATEGORY_ID = "20"

export function cleanText(s: string, max: number): string {
  const text = s.replace(/[<>]/g, "").trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim()
}

export function defaultPublishInput(
  clip: { title: string; description: string },
  defaults: PublishingDefaults
): PublishInput {
  const hashtags = /#shorts\b/i.test(defaults.hashtags)
    ? defaults.hashtags
    : `${defaults.hashtags} #Shorts`.trim()
  const body = cleanText(clip.description, DESCRIPTION_MAX)
  const description = [body, hashtags].filter(Boolean).join("\n")
  return {
    title: cleanText(clip.title, TITLE_MAX),
    description: cleanText(description, DESCRIPTION_MAX),
    tags: [...defaults.tags],
    privacy: defaults.privacy,
    publishAt: null,
  }
}

export function videoResource(input: PublishInput, language: string) {
  return {
    snippet: {
      title: cleanText(input.title, TITLE_MAX),
      description: cleanText(input.description, DESCRIPTION_MAX),
      tags: input.tags,
      categoryId: GAMING_CATEGORY_ID,
      defaultLanguage: language,
    },
    status: {
      privacyStatus: input.publishAt ? "private" : input.privacy,
      publishAt: input.publishAt?.toISOString(),
      selfDeclaredMadeForKids: false,
    },
  }
}
