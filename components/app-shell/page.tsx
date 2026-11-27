import { cn } from "@/lib/utils"

/** The scrolling body of a workspace page, under its `AppHeader`. */
export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page"
      className={cn(
        "flex w-full flex-1 flex-col gap-[18px] p-[18px] pb-16 max-md:gap-4 max-md:p-4",
        className
      )}
      {...props}
    />
  )
}
