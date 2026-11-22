"use client"

import { RouteError } from "@/components/app-shell/route-error"

export default function Error({ reset }: { reset: () => void }) {
  return <RouteError reset={reset} />
}
