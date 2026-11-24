import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cn } from "cn"

import { toneVariants, type Tone } from "@/components/ui/tone"

function StatusPill({
  className,
  tone = "mint",
  render,
  ...props
}: useRender.ComponentProps<"span"> & { tone?: Tone }) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(
          toneVariants({ tone }),
          "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-glass px-2.5 py-[5px] text-[12.5px] leading-none font-semibold whitespace-nowrap text-foreground inset-ring-1 inset-ring-white/14 before:size-[7px] before:shrink-0 before:rounded-full before:bg-[rgb(var(--tone))]",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "status-pill",
      tone,
    },
  })
}

export { StatusPill }
