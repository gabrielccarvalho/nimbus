import * as React from "react"
import { CheckIcon, XIcon } from "@phosphor-icons/react/ssr"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { useMessages } from "@/lib/i18n/client"

import { overview } from "./messages/overview"

const pipelineStepVariants = cva(
  "group/pipeline-step grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3.5 py-2.5",
  {
    variants: {
      state: {
        complete: "",
        current: "",
        upcoming: "",
        failed: "",
      },
    },
    defaultVariants: { state: "upcoming" },
  }
)

type State = NonNullable<VariantProps<typeof pipelineStepVariants>["state"]>

const PipelineStepContext = React.createContext<State>("upcoming")

function PipelineStepper({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="pipeline-stepper"
      className={cn("grid", className)}
      {...props}
    />
  )
}

function PipelineStep({
  className,
  state = "upcoming",
  attention = false,
  children,
  ...props
}: React.ComponentProps<"li"> &
  VariantProps<typeof pipelineStepVariants> & { attention?: boolean }) {
  const resolved = state ?? "upcoming"
  return (
    <PipelineStepContext.Provider value={resolved}>
      <li
        data-slot="pipeline-step"
        data-state={resolved}
        data-attention={attention || undefined}
        aria-current={resolved === "current" ? "step" : undefined}
        className={cn(pipelineStepVariants({ state: resolved, className }))}
        {...props}
      >
        <span
          aria-hidden
          className="grid size-6 place-items-center rounded-full bg-glass text-tertiary inset-ring-1 inset-ring-white/6 group-data-attention/pipeline-step:bg-amber/14 group-data-attention/pipeline-step:text-amber group-data-attention/pipeline-step:shadow-[0_0_14px_rgb(255_179_107/0.35)] group-data-attention/pipeline-step:inset-ring-amber/60 group-data-[state=complete]/pipeline-step:bg-mint/14 group-data-[state=complete]/pipeline-step:text-mint group-data-[state=complete]/pipeline-step:inset-ring-mint/45 group-data-[state=current]/pipeline-step:bg-lav/14 group-data-[state=current]/pipeline-step:text-lav group-data-[state=current]/pipeline-step:shadow-[0_0_14px_rgb(179_188_255/0.35)] group-data-[state=current]/pipeline-step:inset-ring-lav/60 group-data-[state=failed]/pipeline-step:bg-pink/14 group-data-[state=failed]/pipeline-step:text-pink group-data-[state=failed]/pipeline-step:inset-ring-pink/60 [&_svg]:size-3"
        >
          {resolved === "complete" ? (
            <CheckIcon weight="bold" />
          ) : resolved === "failed" ? (
            <XIcon weight="bold" />
          ) : resolved === "current" ? (
            <i className="size-1.5 rounded-[2px] bg-current" />
          ) : null}
        </span>
        {children}
      </li>
    </PipelineStepContext.Provider>
  )
}

function PipelineStepContent({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pipeline-step-content"
      className={cn("grid min-w-0 gap-0.5", className)}
      {...props}
    />
  )
}

function PipelineStepLabel({
  className,
  children,
  ...props
}: React.ComponentProps<"b">) {
  const state = React.useContext(PipelineStepContext)
  const t = useMessages(overview).pipeline.states
  return (
    <b
      data-slot="pipeline-step-label"
      className={cn(
        "truncate text-sm font-medium group-data-[state=upcoming]/pipeline-step:text-tertiary",
        className
      )}
      {...props}
    >
      {children}
      <span className="sr-only">, {t[state]}</span>
    </b>
  )
}

function PipelineStepDescription({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pipeline-step-description"
      className={cn("text-[13px] text-tertiary", className)}
      {...props}
    />
  )
}

function PipelineStepTime({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="pipeline-step-time"
      className={cn(
        "pt-0.5 font-mono text-[13px] text-tertiary tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export {
  PipelineStep,
  PipelineStepContent,
  PipelineStepDescription,
  PipelineStepLabel,
  PipelineStepTime,
  PipelineStepper,
  pipelineStepVariants,
}
