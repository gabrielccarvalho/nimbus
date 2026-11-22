import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  PipelineStep,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepper,
} from "./pipeline-stepper"

describe("PipelineStepper", () => {
  it("announces each step's state and marks the current one", () => {
    render(
      <PipelineStepper aria-label="Pipeline">
        <PipelineStep state="complete">
          <PipelineStepLabel>Probe</PipelineStepLabel>
        </PipelineStep>
        <PipelineStep state="current">
          <PipelineStepLabel>Transcribe</PipelineStepLabel>
          <PipelineStepDescription>42%</PipelineStepDescription>
        </PipelineStep>
        <PipelineStep state="failed">
          <PipelineStepLabel>Analyze</PipelineStepLabel>
        </PipelineStep>
        <PipelineStep>
          <PipelineStepLabel>Render</PipelineStepLabel>
        </PipelineStep>
      </PipelineStepper>
    )
    const items = screen.getAllByRole("listitem")
    expect(screen.getByRole("list", { name: "Pipeline" })).toBeInTheDocument()
    expect(items[0]).toHaveTextContent("Probe, completed")
    expect(items[1]).toHaveAttribute("aria-current", "step")
    expect(items[1]).toHaveTextContent("42%")
    expect(items[2]).toHaveTextContent("failed")
    expect(items[3]).toHaveAttribute("data-state", "upcoming")
    expect(items[3]).not.toHaveAttribute("aria-current")
  })
})
