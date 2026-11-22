import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const statCardVariants = cva(
  "group/stat-card flex min-w-0 flex-col gap-1 rounded-xl text-card-foreground",
  {
    variants: {
      variant: {
        default: "bg-card ring-1 ring-foreground/10",
        muted: "bg-muted/50",
        ghost: "bg-transparent",
      },
      size: {
        default: "p-4",
        sm: "p-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function StatCard({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof statCardVariants>) {
  return (
    <div
      data-slot="stat-card"
      data-variant={variant}
      data-size={size}
      className={cn(statCardVariants({ variant, size, className }))}
      {...props}
    />
  )
}

function StatCardLabel({ className, ...props }: React.ComponentProps<"dt">) {
  return (
    <dt
      data-slot="stat-card-label"
      className={cn(
        "flex min-w-0 items-center justify-between gap-2 text-xs font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function StatCardIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="stat-card-icon"
      aria-hidden
      className={cn(
        "flex shrink-0 items-center [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function StatCardValue({ className, ...props }: React.ComponentProps<"dd">) {
  return (
    <dd
      data-slot="stat-card-value"
      className={cn(
        "truncate font-heading text-2xl font-semibold tabular-nums group-data-[size=sm]/stat-card:text-lg",
        className
      )}
      {...props}
    />
  )
}

function StatCardDescription({
  className,
  ...props
}: React.ComponentProps<"dd">) {
  return (
    <dd
      data-slot="stat-card-description"
      className={cn("truncate text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function StatCardGroup({ className, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl
      data-slot="stat-card-group"
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4",
        className
      )}
      {...props}
    />
  )
}

export {
  StatCard,
  StatCardDescription,
  StatCardGroup,
  StatCardIcon,
  StatCardLabel,
  StatCardValue,
  statCardVariants,
}
