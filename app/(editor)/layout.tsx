import { CommandPaletteProvider } from "@/components/app-shell/command-palette"
import { EditorRail } from "@/components/app-shell/editor-rail"
import { EDITOR_SHORTCUTS } from "@/components/projects/clip-shortcuts"
import { initials } from "@/features/accounts/schema"
import { requireViewer } from "@/features/accounts/session"

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await requireViewer()

  return (
    <CommandPaletteProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-graphite-3 px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="flex h-dvh min-h-[880px] overflow-hidden text-sm leading-[1.45]">
        <EditorRail
          shortcuts={EDITOR_SHORTCUTS}
          account={{
            name: user.name,
            email: user.email,
            initials: initials(user.name),
            image: user.image ?? null,
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
      </div>
    </CommandPaletteProvider>
  )
}
