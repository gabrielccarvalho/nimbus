import { describe, expect, it } from "vitest"

import { SOCIAL_IMAGE, socialMetadata } from "./social-metadata"

describe("socialMetadata", () => {
  it("gives every link preview the large image, in the reader's language", () => {
    const meta = socialMetadata("pt-BR", "Título", "Descrição")
    expect(meta.openGraph).toMatchObject({
      siteName: "nimbus",
      locale: "pt_BR",
      alternateLocale: ["en_US"],
      title: "Título",
      description: "Descrição",
      images: [
        {
          url: expect.stringMatching(/^\/opengraph-image\?v=\d+$/),
          width: 1200,
          height: 630,
        },
      ],
    })
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Título",
      images: [{ alt: SOCIAL_IMAGE.alt }],
    })
  })
})
