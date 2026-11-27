import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"

import "./globals.css"
import type { Metadata } from "next"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { LocaleProvider } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(common)
  return {
    title: { default: "nimbus", template: "%s · nimbus" },
    description: t.appDescription,
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      className={cn("dark", GeistSans.variable, GeistMono.variable)}
    >
      <body>
        <LocaleProvider locale={locale}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster closeButton />
        </LocaleProvider>
      </body>
    </html>
  )
}
