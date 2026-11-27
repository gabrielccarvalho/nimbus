"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import * as React from "react"

const segmentedVariants = cva(
  "group/segmented gap-0.5 rounded-full bg-glass p-[3px] inset-ring-1 inset-ring-hair data-disabled:opacity-50",
  {
    variants: {
      layout: {
        inline: "inline-flex w-fit flex-wrap",
        fill: "flex w-full",
      },
    },
    defaultVariants: { layout: "inline" },
  }
)

function Segmented({
  className,
  layout = "inline",
  ...props
}: ToggleGroupPrimitive.Props & VariantProps<typeof segmentedVariants>) {
  return (
    <ToggleGroupPrimitive
      data-slot="segmented"
      data-layout={layout}
      className={cn(segmentedVariants({ layout }), className)}
      {...props}
    />
  )
}

const segmentedItemVariants = cva(
  "inline-flex items-center justify-center gap-[7px] rounded-full px-3.5 py-2 text-[13.5px] leading-[1.1] font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 outline-none group-data-[layout=fill]/segmented:flex-1 group-data-[layout=fill]/segmented:px-1.5 hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none aria-pressed:bg-white/14 aria-pressed:text-foreground aria-pressed:inset-ring-1 aria-pressed:inset-ring-white/10 aria-[current=page]:bg-white/14 aria-[current=page]:text-foreground aria-[current=page]:inset-ring-1 aria-[current=page]:inset-ring-white/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[13px]"
)

function SegmentedItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="segmented-item"
      className={cn(segmentedItemVariants(), className)}
      {...props}
    />
  )
}

function SegmentedNav({
  className,
  layout = "inline",
  ...props
}: React.ComponentProps<"nav"> & VariantProps<typeof segmentedVariants>) {
  return (
    <nav
      data-slot="segmented-nav"
      data-layout={layout}
      className={cn(segmentedVariants({ layout }), className)}
      {...props}
    />
  )
}

function SegmentedLink({
  className,
  render,
  current = false,
  ...props
}: useRender.ComponentProps<"a"> & { current?: boolean }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        "aria-current": current ? "page" : undefined,
        className: cn(segmentedItemVariants(), className),
      },
      props
    ),
    render,
    state: {
      slot: "segmented-link",
    },
  })
}

export {
  Segmented,
  SegmentedItem,
  SegmentedLink,
  SegmentedNav,
  segmentedItemVariants,
  segmentedVariants,
}
