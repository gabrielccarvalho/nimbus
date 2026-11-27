import { FolderDashedIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { overview } from "@/components/projects/messages/overview"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getMessages } from "@/lib/i18n/server"

export default async function ProjectNotFound() {
  const t = (await getMessages(overview)).notFound
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderDashedIcon />
        </EmptyMedia>
        <EmptyTitle>{t.title}</EmptyTitle>
        <EmptyDescription>{t.description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button render={<Link href="/" />}>{t.action}</Button>
      </EmptyContent>
    </Empty>
  )
}
