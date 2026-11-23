import { describe, expect, it } from "vitest"

import { AppError } from "@/lib/errors"

import { jobTypes } from "../jobs/schema"
import { projectStatuses, type ProjectStatus } from "../projects/schema"
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isRunning,
  jobTypeForStep,
  PIPELINE_STEPS,
  retryTarget,
  RUNNING_STATUSES,
  statusForJobType,
  stepStates,
} from "./state-machine"

const legal: Array<[ProjectStatus, ProjectStatus]> = [
  ["downloading", "uploaded"],
  ["uploaded", "probing"],
  ["probing", "transcribing"],
  ["transcribing", "analyzing"],
  ["analyzing", "selecting"],
  ["selecting", "awaiting_layout"],
  ["selecting", "ready_for_review"],
  ["awaiting_layout", "ready_for_review"],
  ["ready_for_review", "rendering"],
  ["ready_for_review", "awaiting_layout"],
  ["rendering", "done"],
  ["rendering", "ready_for_review"],
  ["done", "rendering"],
  ["done", "ready_for_review"],
  ...RUNNING_STATUSES.flatMap((s): Array<[ProjectStatus, ProjectStatus]> => [
    [s, "failed"],
    [s, "cancelled"],
  ]),
]

const key = (from: ProjectStatus, to: ProjectStatus) => `${from}->${to}`
const legalKeys = new Set(legal.map(([a, b]) => key(a, b)))

const allPairs = projectStatuses.flatMap((from) =>
  projectStatuses.map((to): [ProjectStatus, ProjectStatus] => [from, to])
)

describe("pipeline state machine", () => {
  it.each(legal)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true)
    expect(() => assertTransition(from, to)).not.toThrow()
  })

  const illegal = allPairs.filter(([a, b]) => !legalKeys.has(key(a, b)))

  it(`rejects all ${illegal.length} other transitions`, () => {
    for (const [from, to] of illegal) {
      expect(canTransition(from, to), key(from, to)).toBe(false)
      expect(() => assertTransition(from, to)).toThrow(AppError)
    }
  })

  it("throws INVALID_TRANSITION with details", () => {
    try {
      assertTransition("uploaded", "done")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe("INVALID_TRANSITION")
      expect((error as AppError).details).toEqual({
        from: "uploaded",
        to: "done",
      })
    }
  })

  it("only lets running states fail or be cancelled", () => {
    for (const status of projectStatuses) {
      const targets = allowedTransitions(status)
      expect(targets.includes("failed")).toBe(isRunning(status))
      expect(targets.includes("cancelled")).toBe(isRunning(status))
    }
  })

  it("treats failed and cancelled as dead ends without retry", () => {
    expect(allowedTransitions("failed")).toEqual([])
    expect(allowedTransitions("cancelled")).toEqual([])
  })

  describe("retry", () => {
    it.each(RUNNING_STATUSES)("returns to the failed step %s", (step) => {
      expect(retryTarget("failed", step)).toBe(step)
    })

    it("rejects retry from non-failed states", () => {
      expect(() => retryTarget("done", "probing")).toThrow(AppError)
    })

    it("rejects retry without a known running step", () => {
      expect(() => retryTarget("failed", null)).toThrow(AppError)
      expect(() => retryTarget("failed", "done")).toThrow(AppError)
    })
  })

  it("maps job types and steps both ways", () => {
    for (const type of jobTypes) {
      const status = statusForJobType(type)
      if (status && status !== "rendering") {
        expect(jobTypeForStep(status)).toBe(type)
      }
    }
    expect(statusForJobType("sweep")).toBeNull()
    expect(jobTypeForStep("rendering")).toBeNull()
  })

  describe("stepStates", () => {
    it("marks earlier steps complete and the current one current", () => {
      const states = stepStates("analyzing")
      const index = PIPELINE_STEPS.findIndex((s) => s.id === "analyze")
      expect(states.slice(0, index).every((s) => s === "complete")).toBe(true)
      expect(states[index]).toBe("current")
      expect(states.slice(index + 1).every((s) => s === "upcoming")).toBe(true)
    })

    it("marks the failed step", () => {
      const states = stepStates("failed", "transcribing")
      expect(
        states[PIPELINE_STEPS.findIndex((s) => s.id === "transcribe")]
      ).toBe("failed")
    })

    it("marks a cancelled project's step as current", () => {
      const states = stepStates("cancelled", "selecting")
      expect(states[PIPELINE_STEPS.findIndex((s) => s.id === "select")]).toBe(
        "current"
      )
    })

    it("marks everything complete when done", () => {
      expect(stepStates("done").every((s) => s === "complete")).toBe(true)
    })

    it("handles failure with unknown step", () => {
      expect(stepStates("failed", null).every((s) => s === "upcoming")).toBe(
        true
      )
    })
  })
})
