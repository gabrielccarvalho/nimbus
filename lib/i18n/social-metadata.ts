import type { Metadata } from "next"

import type { Locale } from "./config"

export const SOCIAL_IMAGE = {
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "nimbus: long streams in, short clips out. A stream's waveform with three moments lifted into vertical clips.",
}

// WhatsApp, LinkedIn and Discord cache a preview by its URL: bump this when
// app/opengraph-image.tsx changes.
const IMAGE_URL = "/opengraph-image?v=1"

const OG_LOCALES: Record<Locale, string> = {
  "en-US": "en_US",
  "pt-BR": "pt_BR",
}

// Next merges `openGraph` and `twitter` shallowly, and a page that sets its own
// drops the image inherited from app/opengraph-image.tsx, so it is named here.
export function socialMetadata(
  locale: Locale,
  title: string,
  description: string
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "nimbus",
      locale: OG_LOCALES[locale],
      alternateLocale: Object.values(OG_LOCALES).filter(
        (value) => value !== OG_LOCALES[locale]
      ),
      title,
      description,
      url: "/",
      images: [{ url: IMAGE_URL, ...SOCIAL_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: IMAGE_URL, ...SOCIAL_IMAGE }],
    },
  }
}
