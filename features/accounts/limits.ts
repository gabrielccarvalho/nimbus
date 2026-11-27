import { AppError } from "@/lib/errors"

import type { Plan } from "./schema"

const GB = 1024 ** 3

export function assertRenderFits(
  plan: Pick<Plan, "renderMinutes">,
  usedSeconds: number,
  requestedSeconds: number
) {
  if (plan.renderMinutes === null) return
  const leftSeconds = plan.renderMinutes * 60 - usedSeconds
  if (leftSeconds <= 0) {
    throw new AppError(
      "CONFLICT",
      `You've used your plan's ${plan.renderMinutes} render minutes for this month`
    )
  }
  if (requestedSeconds > leftSeconds) {
    throw new AppError(
      "CONFLICT",
      `Rendering this takes about ${Math.ceil(requestedSeconds / 60)} min and your plan has ${Math.floor(leftSeconds / 60)} min left this month`
    )
  }
}

export function assertStorageFits(
  plan: Pick<Plan, "storageBytes">,
  usedBytes: number,
  requestedBytes: number
) {
  if (plan.storageBytes === null) return
  const gigabytes = Math.round(plan.storageBytes / GB)
  if (usedBytes >= plan.storageBytes) {
    throw new AppError(
      "TOO_LARGE",
      `Your plan's ${gigabytes} GB of storage is full. Delete a project to make room.`
    )
  }
  if (usedBytes + requestedBytes > plan.storageBytes) {
    throw new AppError(
      "TOO_LARGE",
      `This file doesn't fit in what's left of your plan's ${gigabytes} GB of storage`
    )
  }
}

export function claudeRunsError(
  plan: Pick<Plan, "claudeRuns">,
  usedRuns: number
) {
  if (plan.claudeRuns === null || usedRuns < plan.claudeRuns) return null
  return new AppError(
    "CONFLICT",
    `You've used your plan's ${plan.claudeRuns} Claude picks for this month`
  )
}
