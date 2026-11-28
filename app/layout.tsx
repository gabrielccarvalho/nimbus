import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"

import "./globals.css"
import type { Metadata } from "next"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getEnv } from "@/lib/env"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { LocaleProvider } from "@/lib/i18n/client"
import { common } from "@/lib/i18n/common"
import { socialMetadata } from "@/lib/i18n/social-metadata"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getMessages(common), getLocale()])
  return {
    metadataBase: new URL(getEnv().BETTER_AUTH_URL),
    title: { default: "nimbus", template: "%s · nimbus" },
    description: t.appDescription,
    ...socialMetadata(locale, "nimbus", t.appDescription),
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
