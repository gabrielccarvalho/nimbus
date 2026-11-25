import {
  publishingRepository,
  type NewPublication,
  type Publication,
} from "@/features/publishing/repository"
import type { Db } from "@/lib/db"

export function insertImportedPublication(
  db: Db,
  channelId: string,
  patch: Partial<NewPublication> = {}
): Promise<Publication> {
  const videoId = patch.videoId ?? `imp-${crypto.randomUUID().slice(0, 8)}`
  return publishingRepository(db).createPublication({
    clipId: null,
    channelId,
    origin: "imported",
    metadata: {
      title: "Imported Short",
      description: "",
      tags: [],
      privacy: "public",
      publishAt: null,
    },
    status: "published",
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
    publishedAt: new Date("2026-10-01T18:00:00Z"),
    durationMs: 30_000,
    ...patch,
  })
}
