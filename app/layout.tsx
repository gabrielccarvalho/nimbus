import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"

import "./globals.css"
import type { Metadata } from "next"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: { default: "nimbus", template: "%s · nimbus" },
  description: "Turn long recordings into vertical clips with captions.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn("dark", GeistSans.variable, GeistMono.variable)}
    >
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster closeButton />
      </body>
    </html>
  )
}
