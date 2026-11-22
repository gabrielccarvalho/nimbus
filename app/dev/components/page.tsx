import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ComponentGallery } from "./gallery"

export const metadata: Metadata = { title: "Component gallery" }

export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ComponentGallery />
}
