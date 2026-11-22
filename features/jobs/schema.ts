import { z } from "zod"

export const jobTypes = [
  "probe",
  "transcribe",
  "analyze",
  "select",
  "render_clip",
  "render_edit",
  "sweep",
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
  probe: z.object({}),
  transcribe: z.object({}),
  analyze: z.object({}),
  select: z.object({}),
  render_clip: z.object({ clipId: z.string().min(1) }),
  render_edit: z.object({}),
  sweep: z.object({}),
} satisfies Record<JobType, z.ZodType>

export type JobPayload<T extends JobType> = z.infer<
  (typeof jobPayloadSchemas)[T]
>

export const RENDER_JOB_TYPES: ReadonlySet<JobType> = new Set([
  "render_clip",
  "render_edit",
])
