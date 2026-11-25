import { z } from "zod"

export const publicationStatuses = [
  "queued",
  "waiting_quota",
  "uploading",
  "processing",
  "published",
  "failed",
  "removed",
] as const
export type PublicationStatus = (typeof publicationStatuses)[number]

export const ACTIVE_PUBLICATION_STATUSES: ReadonlySet<PublicationStatus> =
  new Set(["queued", "waiting_quota", "uploading", "processing"])

export const channelStatuses = ["ok", "needs_reconnect"] as const
export type ChannelStatus = (typeof channelStatuses)[number]

export const privacyStatuses = ["private", "unlisted", "public"] as const
export type PrivacyStatus = (typeof privacyStatuses)[number]

export const publicationOrigins = ["nimbus", "imported"] as const
export type PublicationOrigin = (typeof publicationOrigins)[number]

export const quotaKinds = ["upload", "list", "stats", "import"] as const
export type QuotaKind = (typeof quotaKinds)[number]

export const publishInputSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(100),
  description: z.string().max(5000),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .refine((tags) => tags.join(",").length <= 500, "Tags are too long"),
  privacy: z.enum(privacyStatuses),
  publishAt: z.date().nullable(),
})
export type PublishInput = z.infer<typeof publishInputSchema>
