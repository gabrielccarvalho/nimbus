import {
  InstagramLogoIcon,
  TiktokLogoIcon,
  TwitchLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react/ssr"
import { cva, type VariantProps } from "class-variance-authority"

import type { ChannelProvider } from "@/features/accounts/schema"
import { cn } from "@/lib/utils"

const LOGOS = {
  youtube: YoutubeLogoIcon,
  twitch: TwitchLogoIcon,
  tiktok: TiktokLogoIcon,
  instagram: InstagramLogoIcon,
} as const

const channelIconVariants = cva(
  "grid shrink-0 place-items-center text-white inset-ring-1 inset-ring-white/12",
  {
    variants: {
      provider: {
        youtube: "bg-[#ff0033]",
        twitch: "bg-[#9146ff]",
        tiktok: "bg-black",
        instagram:
          "bg-[linear-gradient(45deg,#feda75,#fa7e1e_25%,#d62976_50%,#962fbf_75%,#4f5bd5)]",
      },
      size: {
        sm: "size-7 rounded-lg [&_svg]:size-4",
        default: "size-10 rounded-xl [&_svg]:size-[22px]",
      },
    },
    defaultVariants: { size: "default" },
  }
)

export function ChannelIcon({
  provider,
  size,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof channelIconVariants> & { provider: ChannelProvider }) {
  const Logo = LOGOS[provider]
  return (
    <span
      data-slot="channel-icon"
      data-provider={provider}
      aria-hidden
      className={cn(channelIconVariants({ provider, size }), className)}
      {...props}
    >
      <Logo weight="fill" />
    </span>
  )
}
