"use client"

import {
  FilmStripIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import type { Route } from "next"
import { useRouter } from "next/navigation"
import * as React from "react"

import { projectSignal } from "@/components/projects/status-badge"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { SignalDot } from "@/components/ui/signal-dot"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getSearchIndexAction } from "@/features/projects/actions"
import { formatTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"

import { useHotkey } from "./use-hotkey"

type SearchIndex = Extract<
  Awaited<ReturnType<typeof getSearchIndexAction>>,
  { ok: true }
>["value"]

const CommandPaletteContext = React.createContext<(() => void) | null>(null)

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState<SearchIndex | null>(null)

  const show = React.useCallback(() => setOpen(true), [])
  useHotkey("k", () => setOpen((current) => !current), { meta: true })

  React.useEffect(() => {
    if (!open) return
    let current = true
    void getSearchIndexAction().then((result) => {
      if (current && result.ok) setIndex(result.value)
    })
    return () => {
      current = false
    }
  }, [open])

  const go = (href: string) => {
    setOpen(false)
    router.push(href as Route)
  }

  return (
    <CommandPaletteContext.Provider value={show}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search recordings and clips, or jump to a page."
      >
        <Command>
          <CommandInput placeholder="Search recordings and clips" />
          <CommandList>
            <CommandEmpty>
              {index ? "Nothing matches." : "Loading…"}
            </CommandEmpty>
            {index && index.projects.length > 0 && (
              <CommandGroup heading="Recordings">
                {index.projects.map((project) => {
                  const signal = projectSignal(project)
                  return (
                    <CommandItem
                      key={project.id}
                      value={`project ${project.id} ${project.name}`}
                      onSelect={() => go(`/projects/${project.id}`)}
                    >
                      <SignalDot tone={signal.tone} lit={signal.needsYou} />
                      <span className="truncate">{project.name}</span>
                      <CommandShortcut className="font-sans tracking-normal normal-case">
                        {signal.label}
                      </CommandShortcut>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
            {index && index.clips.length > 0 && (
              <CommandGroup heading="Clips">
                {index.clips.map((clip) => (
                  <CommandItem
                    key={clip.id}
                    value={`clip ${clip.id} ${clip.title} ${clip.projectName}`}
                    onSelect={() =>
                      go(`/projects/${clip.projectId}/clips/${clip.id}`)
                    }
                  >
                    <FilmStripIcon aria-hidden />
                    <span className="grid min-w-0">
                      <span className="truncate">{clip.title}</span>
                      <span className="truncate text-xs text-tertiary">
                        {clip.projectName}
                      </span>
                    </span>
                    <CommandShortcut>
                      {formatTimestamp(clip.startMs)}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Go to">
              <CommandItem value="New project" onSelect={() => go("/#import")}>
                <PlusIcon aria-hidden />
                New project
                <CommandShortcut>N</CommandShortcut>
              </CommandItem>
              <CommandItem
                value="Settings"
                onSelect={() => go("/settings/profile")}
              >
                <GearSixIcon aria-hidden />
                Settings
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  )
}

export function SearchTrigger({
  className,
  label = "Search recordings and clips",
  collapsed = false,
}: {
  className?: string
  label?: string
  collapsed?: boolean
}) {
  const open = React.useContext(CommandPaletteContext)
  const button = (
    <button
      type="button"
      onClick={() => open?.()}
      aria-keyshortcuts="Meta+K"
      className={cn(
        "flex h-[38px] w-full items-center gap-[11px] rounded-xl px-2.5 text-start text-sm font-medium text-muted-foreground transition-colors hover:bg-glass hover:text-foreground",
        collapsed && "md:justify-center md:px-0",
        className
      )}
    >
      <MagnifyingGlassIcon className="size-4 shrink-0" aria-hidden />
      <span className={cn("min-w-0 flex-1", collapsed && "md:sr-only")}>
        Search
      </span>
      <Kbd aria-hidden className={cn(collapsed && "md:hidden")}>
        ⌘K
      </Kbd>
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" className="max-md:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
