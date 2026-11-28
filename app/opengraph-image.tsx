import { socialImage } from "@/components/marketing/social-image"
import { SOCIAL_IMAGE } from "@/lib/i18n/social-metadata"

export const alt = SOCIAL_IMAGE.alt
export const size = { width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height }
export const contentType = SOCIAL_IMAGE.type

export default function Image() {
  return socialImage()
}
