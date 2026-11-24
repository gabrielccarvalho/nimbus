import { cn } from "@/lib/utils"

export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn(
        "mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-[max(20px,2.5vw)] pt-8 pb-18 max-md:gap-[22px] max-md:pt-6",
        className
      )}
      {...props}
    />
  )
}

export function PageHeader({
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="page-header"
      className={cn("grid gap-2.5", className)}
      {...props}
    />
  )
}

export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-title"
      className={cn(
        "font-heading text-[32px] leading-[1.1] text-balance max-md:text-[26px]",
        className
      )}
      {...props}
    />
  )
}

export function PageLede({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-lede"
      className={cn(
        "max-w-[46em] text-base text-muted-foreground [&_b]:font-medium [&_b]:text-foreground",
        className
      )}
      {...props}
    />
  )
}
