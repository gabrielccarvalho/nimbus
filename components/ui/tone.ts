import { cva, type VariantProps } from "class-variance-authority"

// Crew colours as an rgb triple in --tone, so one element can use it at any alpha.
const toneVariants = cva("", {
  variants: {
    tone: {
      amber: "[--tone:255_179_107]",
      lav: "[--tone:179_188_255]",
      mint: "[--tone:134_227_187]",
      sky: "[--tone:140_190_255]",
      pink: "[--tone:255_143_192]",
      neutral: "[--tone:134_134_139]",
    },
  },
  defaultVariants: {
    tone: "mint",
  },
})

type Tone = NonNullable<VariantProps<typeof toneVariants>["tone"]>

export { toneVariants, type Tone }
