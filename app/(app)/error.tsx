"use client"

import { RouteError } from "@/components/app-shell/route-error"

export default function Error({ retry }: { retry: () => void }) {
  return <RouteError retry={retry} />
}
