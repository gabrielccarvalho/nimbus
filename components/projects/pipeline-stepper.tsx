import * as React from "react"
import { CheckIcon, XIcon } from "@phosphor-icons/react/ssr"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const pipelineStepVariants = cva(
  "group/pipeline-step relative flex min-w-0 flex-1 items-center gap-2 text-sm",
  {
    variants: {
      state: {
        complete: "text-foreground",
        current: "font-medium text-foreground",
        upcoming: "text-muted-foreground",
        failed: "font-medium text-destructive",
      },
    },
    defaultVariants: { state: "upcoming" },
  }
)

const STATE_TEXT = {
  complete: "completed",
  current: "in progress",
  upcoming: "not started",
  failed: "failed",
} as const

function PipelineStepper({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"ol"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <ol
      data-slot="pipeline-stepper"
      data-orientation={orientation}
      className={cn(
        "group/pipeline-stepper flex gap-3 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:flex-col md:data-[orientation=horizontal]:flex-row",
        className
      )}
      {...props}
    />
  )
}

function PipelineStep({
  className,
  state = "upcoming",
  children,
  ...props
}: React.ComponentProps<"li"> & VariantProps<typeof pipelineStepVariants>) {
  const resolved = state ?? "upcoming"
  return (
    <li
      data-slot="pipeline-step"
      data-state={resolved}
      aria-current={resolved === "current" ? "step" : undefined}
      className={cn(pipelineStepVariants({ state: resolved, className }))}
      {...props}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums group-data-[state=complete]/pipeline-step:border-primary group-data-[state=complete]/pipeline-step:bg-primary group-data-[state=complete]/pipeline-step:text-primary-foreground group-data-[state=current]/pipeline-step:border-primary group-data-[state=current]/pipeline-step:ring-3 group-data-[state=current]/pipeline-step:ring-primary/30 group-data-[state=failed]/pipeline-step:border-destructive group-data-[state=failed]/pipeline-step:bg-destructive/10 [&_svg]:size-3.5"
      >
        {resolved === "complete" ? (
          <CheckIcon weight="bold" />
        ) : resolved === "failed" ? (
          <XIcon weight="bold" />
        ) : (
          <span className="size-1.5 rounded-full bg-current group-data-[state=current]/pipeline-step:bg-primary" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        {children}
        <span className="sr-only">, {STATE_TEXT[resolved]}</span>
      </span>
    </li>
  )
}

function PipelineStepLabel({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pipeline-step-label"
      className={cn("truncate", className)}
      {...props}
    />
  )
}

function PipelineStepDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pipeline-step-description"
      className={cn(
        "truncate text-xs font-normal text-muted-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export {
  PipelineStep,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepper,
  pipelineStepVariants,
}
