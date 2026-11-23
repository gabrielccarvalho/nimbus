"use client"

import "./globals.css"

import { RouteError } from "@/components/app-shell/route-error"

export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-svh place-items-center bg-background font-sans text-foreground antialiased">
        <title>Something went wrong · Nimbus</title>
        <RouteError retry={retry} />
      </body>
    </html>
  )
}
