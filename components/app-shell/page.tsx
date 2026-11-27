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
