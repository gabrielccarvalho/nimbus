import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-[250ms,300ms,200ms,200ms] ease-snappy select-none focus-visible:focus-ring active:not-aria-[haspopup]:scale-[.97] disabled:pointer-events-none disabled:opacity-45 aria-invalid:inset-ring-1 aria-invalid:inset-ring-pink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-glass-2 text-foreground inset-ring-1 inset-ring-white/10 backdrop-blur-md hover:-translate-y-px hover:bg-glass-3 hover:inset-ring-white/16 aria-expanded:bg-glass-3",
        primary:
          "bg-primary text-primary-foreground shadow-primary hover:-translate-y-px hover:bg-white hover:shadow-primary-hover",
        ghost:
          "text-muted-foreground hover:bg-glass hover:text-foreground aria-expanded:bg-glass aria-expanded:text-foreground",
        destructive:
          "bg-pink/10 text-pink inset-ring-1 inset-ring-pink/30 hover:-translate-y-px hover:bg-pink/16",
        link: "text-muted-foreground hover:text-foreground",
      },
      size: {
        default:
          "h-9 gap-2 px-4 text-sm has-data-[icon=inline-end]:pe-3.5 has-data-[icon=inline-start]:ps-3.5",
        xs: "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[13px] has-data-[icon=inline-end]:pe-2.5 has-data-[icon=inline-start]:ps-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-[26px] text-[16.5px]",
        icon: "size-9",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
