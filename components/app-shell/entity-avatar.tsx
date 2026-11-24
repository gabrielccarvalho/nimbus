import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function EntityAvatar({
  image,
  initials,
  shape = "circle",
  className,
}: {
  image: string | null
  initials: string
  shape?: "circle" | "square"
  className?: string
}) {
  const square = shape === "square"
  return (
    <Avatar
      className={cn(
        "font-semibold",
        square && "rounded-[28%] after:rounded-[28%]",
        className
      )}
    >
      {image && (
        <AvatarImage
          src={image}
          alt=""
          className={cn(square && "rounded-[28%]")}
        />
      )}
      <AvatarFallback
        className={cn(
          square
            ? "rounded-[28%] bg-graphite-3 text-lav inset-ring-1 inset-ring-lav/45"
            : "bg-linear-160 from-violet to-violet-deep text-white",
          "text-[length:inherit]"
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
