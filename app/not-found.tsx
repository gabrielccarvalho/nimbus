import { CompassIcon } from "@phosphor-icons/react/ssr"
import type { Metadata } from "next"
import Link from "next/link"

import { shell } from "@/components/app-shell/messages"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getMessages } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(shell)).notFound.title }
}

export default async function NotFound() {
  const t = (await getMessages(shell)).notFound
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CompassIcon />
          </EmptyMedia>
          <EmptyTitle>
            <h1>{t.title}</h1>
          </EmptyTitle>
          <EmptyDescription>{t.description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants()}>
            {t.home}
          </Link>
        </EmptyContent>
      </Empty>
    </main>
  )
}
