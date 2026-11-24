import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  PipelineStep,
  PipelineStepContent,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepper,
  PipelineStepTime,
} from "./pipeline-stepper"

describe("PipelineStepper", () => {
  it("announces each step's state and marks the current one", () => {
    render(
      <PipelineStepper aria-label="Pipeline">
        <PipelineStep state="complete">
          <PipelineStepContent>
            <PipelineStepLabel>Probe</PipelineStepLabel>
            <PipelineStepDescription>0:20 · 1920×1080</PipelineStepDescription>
          </PipelineStepContent>
          <PipelineStepTime>0:01</PipelineStepTime>
        </PipelineStep>
        <PipelineStep state="current" attention>
          <PipelineStepContent>
            <PipelineStepLabel>Confirm layout</PipelineStepLabel>
          </PipelineStepContent>
        </PipelineStep>
        <PipelineStep state="failed">
          <PipelineStepContent>
            <PipelineStepLabel>Analyze</PipelineStepLabel>
          </PipelineStepContent>
        </PipelineStep>
        <PipelineStep>
          <PipelineStepContent>
            <PipelineStepLabel>Render</PipelineStepLabel>
          </PipelineStepContent>
        </PipelineStep>
      </PipelineStepper>
    )
    const items = screen.getAllByRole("listitem")
    expect(screen.getByRole("list", { name: "Pipeline" })).toBeInTheDocument()
    expect(items[0]).toHaveTextContent("Probe, completed0:20 · 1920×10800:01")
    expect(items[1]).toHaveAttribute("aria-current", "step")
    expect(items[1]).toHaveAttribute("data-attention", "true")
    expect(items[2]).toHaveTextContent("Analyze, failed")
    expect(items[3]).toHaveAttribute("data-state", "upcoming")
    expect(items[3]).not.toHaveAttribute("aria-current")
  })
})
