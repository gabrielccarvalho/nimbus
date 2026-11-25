import { z } from "zod"

export const jobTypes = [
  "download",
  "probe",
  "transcribe",
  "analyze",
  "select",
  "render_clip",
  "render_edit",
  "sweep",
  "publish_clip",
  "sync_stats",
  "analyze_performance",
  "sync_uploads",
  "sync_channel",
] as const
export const jobTypeSchema = z.enum(jobTypes)
export type JobType = z.infer<typeof jobTypeSchema>

export const jobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const
export const jobStatusSchema = z.enum(jobStatuses)
export type JobStatus = z.infer<typeof jobStatusSchema>

export const jobPayloadSchemas = {
  download: z.object({}),
  probe: z.object({}),
  transcribe: z.object({}),
  analyze: z.object({}),
  select: z.object({}),
  render_clip: z.object({ clipId: z.string().min(1) }),
  render_edit: z.object({}),
  sweep: z.object({}),
  publish_clip: z.object({ publicationId: z.string().min(1) }),
  sync_stats: z.object({ publicationId: z.string().min(1) }),
  analyze_performance: z.object({ channelId: z.string().min(1) }),
  sync_uploads: z.object({
    channelId: z.string().min(1),
    pageToken: z.string().min(1).optional(),
    passStartedAt: z.iso.datetime().optional(),
  }),
  sync_channel: z.object({ channelId: z.string().min(1) }),
} satisfies Record<JobType, z.ZodType>

export type JobPayload<T extends JobType> = z.infer<
  (typeof jobPayloadSchemas)[T]
>

export const RENDER_JOB_TYPES: ReadonlySet<JobType> = new Set([
  "render_clip",
  "render_edit",
])
